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
import crypto from 'node:crypto';
import zlib from 'node:zlib';
import { spawnSync } from 'node:child_process';
import {
  buildAll, renderCity, writeAll, fill, findPlaceholders, fragments, familyFor, BuildError, esc, eur, money, currencyOf, GENERATED_MARK, WEIGHT_KB, BUDGET,
  daysLabel, deskHoursText, feesRowOf, holidayKeyOf, visibleAtLoad, visibleText, sliceOf, words, waHref, WITHDRAWAL_PATH, TERMS_PATH,
  stripComments, emittedAssets, emitAssets, SERVED_ASSETS,
  atLoadParts, longNodes, weightOf, validGeo, sealText, sealPhrase, STATUS_RE, STATUS_BANNED_RE, AVIATION_BAN_RE,
  ARC_CLEAR, ARC_DOT_R, ARC_ME_R, MAP_KB, HZ_CAM, HZ_LIFT, HZ_LEAN, HZ_KEY, HUB_MAP_PX, horizon, hzViolations, hzPathPts, hzCal, holidayKeyOf as hkOf,
  orgNode, serviceNode, numberWord, listJoin, dateLong, homeCountryOf, isHomeDesk,
  renderHub, buildHub, HUB_WEIGHT_KB, HUB_BUDGET, HUB_FILE, HUB_PATH, COUNTRY_NAME, hoursSentence, hubText, CALL_RE, RATING_RE,
  reviewSentences, claimProblems, claimGuard, lintClaims, loadClaims, CLAIM_VOCAB_RE, CLAIM_KINDS, CLAIMS_FILE,
  hasClaimVocab, claimHits, sellHit, closeUp, cleanText, normSentence, PLACE_RE, htmlFieldGuard, neutralValue, joinCut, numKeyCode
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
const SLUGS = ['amsterdam', 'barcelona', 'berlin', 'london', 'madrid', 'milan', 'paris', 'valencia'];
const CITY = Object.fromEntries(SLUGS.map((s) => [s, JSON.parse(read(`cities/${s}.json`))]));
const ams = CITY.amsterdam;
const assetVersion = { css: 'testcss000', js: 'testjs0000', onda: 'testonda00' };
const frags = fragments(R);
// the refusals are measured without the weight gate (it has its own check);
// the family is the real one, so a mutation of one desk keeps its sisters
// the reviewed sentences (cities/_claims.json) travel with the render, whatever root the refusal builds in
const CLAIMS = loadClaims(R);
const render = (city, sh = shared, tpl = template, root = R, extra = {}) =>
  renderCity({ template: tpl, shared: sh, city, assetVersion, frags, root, weigh: false, cities: SLUGS.map((s) => (s === city.slug ? city : CITY[s])), claims: CLAIMS, ...extra });
// a template mutation: the build must refuse its own output
const tplRefuses = (from, to, re, t, base = 'amsterdam') => {
  check(template.includes(from), `(the template still carries the anchor of: ${t})`);
  const r = throws(() => render(CITY[base], shared, template.replace(from, to)), re);
  check(r === true, t, r === true ? '' : r);
};

// ── 1 · the committed pages are exactly what the data builds ─────────────
const pages = buildAll({ root: R });
check(pages.length === 8 && pages.map((p) => p.slug).join() === SLUGS.join(), `the eight desks are built from cities/*.json (${pages.map((p) => p.slug).join(', ')})`);
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
  for (const f of ['assets/boom-city.css', 'assets/boom-city.js', 'assets/boom-onda.js', 'assets/boom-map.js', 'js/boom-consent.js', 'js/boom-track.js']) fs.copyFileSync(path.join(R, f), path.join(tmpW, f));
  const w0 = weightOf(pages[0].html, tmpW);
  fs.appendFileSync(path.join(tmpW, 'assets/boom-onda.js'), '\n/*' + Array.from({ length: 4000 }, (_, i) => ((i * 2654435761) % 4294967296).toString(36)).join(' ') + '*/');
  const w1 = weightOf(pages[0].html, tmpW);
  check(w0.ondaKb > 0 && w1.ondaKb > w0.ondaKb && w1.totalKb - w0.totalKb > (w1.ondaKb - w0.ondaKb) * 0.99, `weightOf counts assets/boom-onda.js in the total and on its own (${w0.ondaKb.toFixed(1)} → ${w1.ondaKb.toFixed(1)} KB)`);
  // v1.7: the map's script, loaded on view, is in the total AND on its own line (MAP_KB)
  fs.appendFileSync(path.join(tmpW, 'assets/boom-map.js'), '\n/*' + Array.from({ length: 3000 }, (_, i) => ((i * 2246822519) % 4294967296).toString(36)).join(' ') + '*/');
  const w2 = weightOf(pages[0].html, tmpW);
  check(w1.mapKb > 0 && w2.mapKb > w1.mapKb && w2.totalKb - w1.totalKb > (w2.mapKb - w1.mapKb) * 0.99 && w2.ondaKb === w1.ondaKb, `weightOf counts assets/boom-map.js in the total and on its own (${w1.mapKb.toFixed(1)} → ${w2.mapKb.toFixed(1)} KB; total +${(w2.totalKb - w1.totalKb).toFixed(1)})`);
  fs.rmSync(tmpW, { recursive: true, force: true });
}
const PAGE = Object.fromEntries(pages.map((p) => [p.slug, p.html]));
// the coast (optional): design/pages-deco/genera-europa.mjs → cities/_europe.json, rings in degrees the camera projects at build time
const EUROPE = fs.existsSync(path.join(R, 'cities/_europe.json')) ? JSON.parse(fs.readFileSync(path.join(R, 'cities/_europe.json'), 'utf8')) : null;
const html = PAGE.amsterdam;
// the Horizon's model over every desk: the same camera, arcs and labels every page draws (memoised in the build)
const HZ = horizon(shared.rome.geo, SLUGS.map((x) => CITY[x]), EUROPE);

// ── 2 · the Amsterdam page, as built ──────────────────────────────────────
check(!/\{\{\{?\s*[\w.]+\s*\}\}\}?/.test(html), 'amsterdam: no unresolved {{token}} in the output');
check(html.includes(GENERATED_MARK), 'amsterdam: carries the GENERATED mark (the overwrite guard depends on it)');
for (const s of SLUGS) {
  const head = PAGE[s].slice(0, 4000);
  const live = CITY[s].live === true;
  check(live ? (!/noindex/.test(head) && /content="index, follow/.test(head)) : /<meta name="robots" content="noindex">/.test(head),
    `${s} is ${live ? 'LIVE: index, follow' : 'a draft: noindex'} in the first 4000 chars (tests/seo rule 8 reads exactly there)`);
}
check(['amsterdam', 'madrid', 'barcelona', 'london', 'milan', 'valencia'].every((s) => CITY[s].live && CITY[s].checkout === true && CITY[s].mode === 'search')
  && ['paris', 'berlin'].every((s) => !CITY[s].live && CITY[s].checkout === undefined && CITY[s].mode === 'waitlist'),
  'the live set is pinned: Amsterdam, Madrid, Barcelona, London, Milan, Valencia sell; Paris and Berlin are noindex waitlists without a till');
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
  // v1.7 (card-S): Full Search prints its promise in the closed summary (f-say), the economy tickets keep it in the open ticket (tk-tag)
  const promise = p.id === 'full-search' ? `<span class="f-say">${esc(p.name)}</span></span>` : `<p class="tk-tag">${esc(p.name)}</p>`;
  check(p.includes.every((x) => row.includes(`<li>${esc(x)}</li>`)) && row.includes(promise) && (p.id === 'full-search' ? !row.includes('tk-tag') : !row.includes('f-say')),
    `${p.label}: its ticket says what the fee buys (${p.includes.length} lines) and prints its promise ${p.id === 'full-search' ? 'in the summary' : 'in the ticket'}`);
  check(row.includes(`data-pay="${p.id}"><span>${esc(ams.till.label)} · ${eur(p.price)}</span>`), `${p.label}: the ticket's pay button reads till.label with ITS price`);
}
check(fares.includes(`<p class="fares-h"><b id="faresH">Flat fees</b><span>No percentage of your rent</span></p>`), 'the line over the fares: "Flat fees · No percentage of your rent"');
check((html.match(/data-pay="/g) || []).length === 3, 'pay controls live only inside the tickets (three, one per plan): no pay bar, no pay button outside a ticket');
// v1.7 (04/11, card-S): three tickets in the home's grammar — an <ol class="bps"> of
// three <li class="bp">, the first .eroe (Full Search lies down, the flagship);
// the pip INSIDE the stub; the open ticket ends in a darker stub (slot, barcode,
// pay); the €500 coupon and the desk-width pay slot follow the FS <details>
// inside ITS <li>; the leftovers of the four prototypes are banned by name.
{
  const lis = [...fares.matchAll(/<li class="bp( eroe)?">/g)].map((m) => !!m[1]);
  check(/<ol class="bps">\s*<li class="bp eroe">/.test(fares) && lis.length === 3 && lis.join() === 'true,false,false' && fares.includes('</li>\n        </ol>'),
    'the fares are an <ol class="bps"> of three <li class="bp">, the first .eroe (Full Search, the flagship)');
  for (const p of ams.pricing.plans) {
    const row = sliceOf(fares, `id="fare-${p.id}"`, '</details>');
    check(/<span class="f-r">.*<i class="f-tog" aria-hidden="true"><\/i><\/span>\s*<\/summary>/.test(row) && !/<span class="f-tog"/.test(row), `${p.label}: the pip (.f-tog) lives inside the stub .f-r, last`);
    check(/<div class="tk-stub">\s*<div class="tk-slot" data-slot><\/div>\s*<i class="bars" aria-hidden="true"><\/i>\s*<button class="pay2 js" type="button" data-pay="/.test(row) && row.trimEnd().endsWith('</button>\n            </div>\n          </div>'),
      `${p.label}: the ticket ends in a darker stub holding the door's slot, a barcode and the pay button`);
    check((row.match(/class="bars"/g) || []).length === (p.id === 'full-search' ? 2 : 1), `${p.label}: a barcode on the open stub${p.id === 'full-search' ? ' and one on the flagship\'s closed stub' : ', none on the closed row'}`);
  }
  const li = sliceOf(fares, '<li class="bp eroe">', '</li>\n        <li class="bp">');
  check(/<\/details>\s*<p class="refund fs">[^<]+<\/p>\s*<span class="bp-pay"><\/span>\s*$/.test(li), 'after the Full Search </details>, inside its <li>: the ✓ coupon, then the empty desk-width pay slot');
  for (const s of ['paris', 'berlin']) {
    const f = sliceOf(PAGE[s], '<!-- FARES -->', '<!-- /FARES -->');
    check(/<ol class="bps">\s*<li class="bp eroe">/.test(f) && !f.includes('bp-pay') && !f.includes('class="refund') && !f.includes('data-pay='), `${s} (waitlist): the same three tickets, no coupon, no pay slot, no pay button`);
  }
  // the Departures board keeps its v1.6 "N°" column (steps 1–3, real facts): the ban on a code is on the TICKETS
  const LEFTOVERS = /First class|f-band|tk-band|tk-foot|f-kind|class="deck|class="pair"/;
  check(SLUGS.every((s) => { const f = sliceOf(PAGE[s], '<!-- FARES -->', '<!-- /FARES -->'); return f && !LEFTOVERS.test(PAGE[s]) && !/N°|tk-code|\bBM [A-Z0-9]{5}\b/.test(f); }),
    'no prototype leftover on any page: no "First class" word (the band is wordless), no N° or code on a ticket, no f-band/tk-band/tk-foot/f-kind, no deck, no .pair div');
  const css = read('assets/src/boom-city.css');
  check(/\.door:hover,\.pay:hover\{box-shadow:/.test(css) && !/\.door:hover,\.pay:hover\{[^}]*translateY\(-1px\)/.test(css) && !/\.door:hover\{[^}]*transform/.test(css), 'the door no longer lifts on hover (the lift moved the edge away from the pointer and the hover flickered)');
  const bare = [...css.matchAll(/(?:^|[}{;])\s*([^{}@]+)\{/g)].map((m) => m[1]).filter((sel) => sel.split(',').some((x) => x.trim() === '.refund'));
  check(bare.length === 0 && /\.pass \.refund,\.till \.refund\{/.test(css) && /\.bp>\.refund\.fs\{/.test(css), 'the ✓ rule is scoped to the pass, the till and the coupon: boom-city.css has no bare .refund{ rule, so the hub\'s .hft .refund keeps its own look', bare.join(' | '));
  check(/\.hft \.refund\{/.test(read('assets/src/boom-desks.css')), 'the hub styles its own .hft .refund');
  check(/\.f-when::after\{content:'\?'\}/.test(css) && /\.bps:not\(\.pair-open\):not\(:has\(>\.bp:not\(\.eroe\)>\[open\]\)\)\{grid-template-columns:repeat\(2,minmax\(0,1fr\)\)\}/.test(css),
    'the situation ends in a CSS "?"; between 360 and 939 the two economy tickets are a pair while neither is open (pair-open from the page, :has without it)');
  check(/\.bp:has\(>\[data-fs\]\[open\]\)>\.refund\.fs,\.fs-open \.refund\.fs,\.bp-pay:empty\{display:none\}/.test(css), 'the coupon hides while Full Search is open; an empty desk pay slot takes no room');
}

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
  const SEAL = { amsterdam: 'NEVER PAID BY LANDLORDS', london: 'NEVER PAID BY LANDLORDS', milan: 'NEVER PAID BY LANDLORDS', madrid: 'WE DO NOT ACT FOR THE LANDLORD', barcelona: 'WE DO NOT ACT FOR THE LANDLORD', valencia: 'WE DO NOT ACT FOR THE LANDLORD', paris: 'OPENING WITH A LICENSED PARTNER', berlin: 'OPENING WITH A LICENSED PARTNER' };
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
  check(ams2.map((x) => x[0]).join() === 'barcelona,london,madrid,milan,valencia,' && ams2.map((x) => x[1]).join() === 'BCN,LON,MAD,MIL,VLC,ROM' && ams2[5][2] === 'BOOM Rome' && ams2[0][2] === 'Barcelona',
    `a live desk links only the live sisters, then BOOM Rome (${ams2.map((x) => x[1]).join(', ')})`);
  check(par.map((x) => x[0]).join() === 'amsterdam,barcelona,berlin,london,madrid,milan,valencia,', 'a draft links every sister (the review sees the suite)');
  check(!/<a href="\/(amsterdam|barcelona|berlin|london|madrid|milan|paris|valencia)">/.test(sliceOf(html, '<footer class="foot">', '</footer>')), 'the network list replaces the family links of the footer (said once)');
  const fam = familyFor({ slug: 'x', live: true }, [{ slug: 'b', city: 'B', live: false, iata: 'BBB', geo: { lat: 50, lon: 5 } }, { slug: 'a', city: 'A', live: true, iata: 'AAA', geo: { lat: 48, lon: 2 } }], { family: [{ label: 'BOOM Rome', href: '/' }], rome: { geo: shared.rome.geo } });
  check(fam.map((f) => f.href).join() === '/a,/' && fam[0].label === 'A' && fam[0].iata === 'AAA' && fam[0].geo.lat === 48 && fam[1].iata === 'ROM' && fam[1].geo === shared.rome.geo,
    'familyFor: live sisters only, alphabetical, labelled with the city (the heading says "Other desks") with their IATA and coordinates, then BOOM Rome (ROM, the hub)');
  check(sliceOf(html, '<section class="sec" id="network"', '</section>').includes('<p class="net-c">Every desk answers from Rome.</p>'), 'the caption: "Every desk answers from Rome."');
  // BOOM Desks (03/11/2026): the map shows EVERY desk — the live sisters with an arc from Rome, this desk
  // with its gold arc (on a draft too), the desks not open as a hollow dot with NO arc; Rome wears its ring
  for (const s of SLUGS) {
    const h = PAGE[s], map = sliceOf(h, '<svg class="hz"', '</svg>');
    const xy = (g) => HZ.cam.xy(g);
    const [mx, my] = xy(CITY[s].geo), [rx, ry] = HZ.hub, [vx, vy, vw, vh] = HZ.view;
    const dots = [...map.matchAll(/<circle class="(d(?: me| off)?|d-ring|hub|hub-r)" cx="([\d.]+)" cy="([\d.]+)" r="([\d.]+)"( fill="none")?/g)].map((m) => [m[1], +m[2], +m[3], +m[4], !!m[5]]);
    const arcs = [...map.matchAll(/<path class="arc( me)?" data-k="([a-z]{3})" pathLength="1" fill="none" d="(M[\d.]+ [\d.]+C[^"]+)"\/>/g)];
    const inside = dots.every(([, x, y]) => x >= 0 && x <= 640 && y >= vy && y <= vy + vh);
    const me = dots.find((d) => d[0] === 'd me'), myRing = dots.find((d) => d[0] === 'd-ring'), hub = dots.find((d) => d[0] === 'hub'), ring = dots.find((d) => d[0] === 'hub-r');
    const others = SLUGS.filter((x) => x !== s).map((x) => CITY[x]);
    const liveSis = others.filter((x) => x.live === true), offSis = others.filter((x) => x.live !== true);
    check(map.startsWith(`<svg class="hz" viewBox="${HZ.view.join(' ')}" aria-hidden="true" focusable="false">`) && vx === 0 && vw === 640 && inside
      && me && me[1] === mx && me[2] === my && me[3] === 4 && myRing && myRing[1] === mx && myRing[2] === my && myRing[3] === ARC_ME_R && myRing[4] && hub && hub[1] === rx && hub[2] === ry
      && liveSis.every((x) => { const [px, py] = xy(x.geo); return dots.some((d) => d[0] === 'd' && d[1] === px && d[2] === py && d[3] === ARC_DOT_R); })
      && arcs.length === liveSis.length + 1 && arcs.every((a) => a[3].startsWith(`M${rx} ${ry}C`) && HZ.arcs.get(a[2].toUpperCase()).d === a[3]) && arcs.filter((a) => a[1]).length === 1 && arcs[arcs.length - 1][1] === ' me' && arcs[arcs.length - 1][2] === CITY[s].iata.toLowerCase()
      && SLUGS.every((x) => validGeo(CITY[x].geo)) && validGeo(shared.rome.geo),
      `${s}: the Horizon's dots are the camera's projection of the real coordinates, inside the cropped frame (this desk ${mx},${my} with its ${ARC_ME_R}px ring; ROM ${rx},${ry}); one lifted arc from Rome per LIVE sister (${liveSis.length}), each the model's own cubic, and this desk's in gold, drawn last`);
    check(offSis.length >= 1 && offSis.every((x) => { const [px, py] = xy(x.geo); return dots.some((d) => d[0] === 'd off' && d[1] === px && d[2] === py && d[3] === ARC_DOT_R && d[4]) && !arcs.some((a) => a[2] === x.iata.toLowerCase()); })
      && dots.filter((d) => d[0] === 'd off').length === offSis.length && !new RegExp(`id="hzd-(?:${offSis.map((x) => x.iata.toLowerCase()).join('|')})"`).test(map),
      `${s}: the desks not open (${offSis.map((x) => x.iata).join(', ')}) are hollow dots (fill="none") at their real coordinates, with NO arc and no glow (an arc means "operated from Rome")`);
    check(ring && ring[1] === rx && ring[2] === ry && ring[3] === 10 && ring[4] && map.indexOf('class="hub-r"') > map.indexOf('class="hub"') && !/hub-r r2/.test(map) && /<text class="m-l hub"[^>]*>ROM<\/text>/.test(map),
      `${s}: Rome, the hub, wears its ring (r 10, hollow — the second ring is the hub page's) and its code`);
    // the globe: the earth disc under the limb (three strokes), the sea and the land dot matrices, the graticule, the seas that fit, the night EMPTY
    check(/<use class="earth" href="#hzEarth"\/><rect class="sea" width="640" height="520" fill="url\(#hzSea\)" clip-path="url\(#hzEc\)"\/>/.test(map) && /<path class="grat" d="M/.test(map)
      && /<use class="limb l3" href="#hzLimb"\/><use class="limb l2" href="#hzLimb"\/><use class="limb l1" href="#hzLimb"\/>/.test(map) && (map.match(/<g class="hz-nite"><\/g>/g) || []).length === 1 && !/<image\b|hz-term|hz-pl/.test(map)
      && HZ.seas.length >= 2 && HZ.seas.every((sea) => map.includes(`>${sea.t}</text>`)) && map.indexOf('class="m-s"') < map.indexOf('<path class="arc'),
      `${s}: the globe is drawn (earth, limb, sea and land patterns, graticule, ${HZ.seas.map((x) => x.t).join(' · ')}), the night layer served empty — the hour draws it`);
    // the coast: Natural Earth in degrees (cities/_europe.json rings) projected by the camera, as a dot matrix clipped to it, under the arcs; the same drawing as the hub
    if (EUROPE) check(/<path id="hzCoast" d="M-?\d+ -?\d+l[-\d ]+z/.test(map) && /<rect class="land" width="640" height="520" fill="url\(#hzDots\)" clip-path="url\(#hzLc\)"\/><use class="coast" href="#hzCoast"\/>/.test(map)
      && map.indexOf('class="land"') > map.indexOf('class="sea"') && map.indexOf('class="land"') < map.indexOf('<path class="arc') && sliceOf(map, '<path id="hzCoast"', '/>') === sliceOf(sliceOf(read('desks.html'), '<svg class="hz"', '</svg>'), '<path id="hzCoast"', '/>'),
      `${s}: the coast lies under the network (land dots clipped to the projected coast, before the arcs), the very same path as the hub's`);
    const offLab = [...map.matchAll(/<text class="m-l off"[^>]*>([A-Z]{3})<\/text>/g)].map((m) => m[1]);
    check(offLab.join() === offSis.map((x) => x.iata).join() && /<text class="m-l me"[^>]*>/.test(map) && [...map.matchAll(/<text class="m-l[^"]*"[^>]*>([A-Z]{3})/g)].length === SLUGS.length + 1,
      `${s}: each desk not open carries its code, dimmed (m-l off): ${offLab.join(', ')}; this desk's in gold; one label per desk and the hub`);
    // the script's data: the camera (15 numbers), the crop, each live desk's calendar facts — never a person
    const data = JSON.parse(sliceOf(h.slice(h.indexOf('</svg>', h.indexOf('<svg class="hz"'))), '<script type="application/json" class="hz-data">', '</script>').replace('<script type="application/json" class="hz-data">', '') || '{}');
    const liveHere = [...liveSis, ...(CITY[s].live === true ? [CITY[s]] : [])];
    check(Array.isArray(data.c) && data.c.length === 15 && data.c.every(Number.isFinite) && JSON.stringify(data.v) === JSON.stringify(HZ.view) && Object.keys(data.d).sort().join() === liveHere.map((x) => x.iata.toLowerCase()).sort().join()
      && liveHere.every((x) => data.d[x.iata.toLowerCase()].h === hkOf(x.slug)) && (!data.d.lon || (data.d.lon.z === 'Europe/London' && data.d.lon.f === '08:00' && data.d.lon.t === '18:00')) && (!data.d.ams || !('z' in data.d.ams)) && JSON.stringify(data.d) === JSON.stringify(hzCal(liveHere)),
      `${s}: the map's data script carries the camera, the crop and the live desks' calendar facts (${Object.keys(data.d).join(', ')}: holiday key, and only what differs from Rome's 09–19)`);
    const key = sliceOf(h, '<p class="net-k"', '</p>');
    check(key === `<p class="net-k" aria-hidden="true">${HZ_KEY}` && ['live desk', 'not open', 'Rome, the hub'].every((t) => key.includes(t)) && /<span class="k-x" hidden><i class="k-g"><\/i>open now<\/span><span class="k-x" hidden><i class="k-n"><\/i>night, now<\/span>$/.test(key)
      && h.indexOf('<p class="net-k"') > h.indexOf('</svg>', h.indexOf('<svg class="hz"')) && h.indexOf('<p class="net-k"') < h.indexOf('<ul class="net">'),
      `${s}: the legend after the map — live desk · not open · Rome, the hub, plus the two the script reveals (open now, night) served hidden`);
    // the list: the family, then (live page) the desks not open as plain text, BOOM Rome, then every desk
    const ul = sliceOf(h, '<ul class="net">', '</ul>');
    const codes = [...ul.matchAll(/<li(?: class="(off|all)")?>(?:<a href="([^"]*)">)?<b data-instr>([A-Z]{3})<\/b> ([^<]+)/g)].map((m) => ({ cls: m[1] || '', href: m[2], code: m[3], label: m[4] }));
    const live = CITY[s].live === true;
    const famSis = live ? liveSis : others;
    const want = [...famSis.map((x) => x.iata), ...(live ? offSis.map((x) => x.iata) : []), 'ROM', 'ALL'];
    check(codes.map((c) => c.code).join() === want.join(), `${s}: the Network list reads ${want.join(' · ')}`, codes.map((c) => c.code).join());
    check(codes.filter((c) => c.cls === 'off').every((c) => !c.href && c.label === `${others.find((x) => x.iata === c.code).city} · not open`) && (live ? codes.filter((c) => c.cls === 'off').length === offSis.length : codes.every((c) => c.cls !== 'off')),
      live ? `${s}: the desks not open are named, never linked: ${codes.filter((c) => c.cls === 'off').map((c) => c.label).join(' · ')}` : `${s}: a draft lists every sister as a link (no "not open" line)`);
    const all = codes[codes.length - 1];
    check((ul.match(/<li class="all">/g) || []).length === 1 && all.cls === 'all' && all.href === '/desks' && all.label === 'Every BOOM desk', `${s}: "ALL · Every BOOM desk" once, last, linking /desks`);
    if (live) check(!/href="(?:https:\/\/www\.boomrome\.com)?\/(?:berlin|paris)(?=[#"?/])/.test(h), `${s}: a live page links no desk that is not open (Berlin, Paris), anywhere`);
    const netWords = words(visibleText(sliceOf(atLoadParts(h).html, '<section class="sec" id="network"', '</section>')));
    check(netWords === (live ? 35 : 31) && netWords <= BUDGET.network, `${s}: the Network section is ${netWords} words at load (${live ? 'live 35' : 'draft 31'}, ≤ ${BUDGET.network})`);
    const bc = [...h.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((m) => JSON.parse(m[1])).find((b) => b['@type'] === 'BreadcrumbList') || {};
    const items = bc.itemListElement || [];
    check(items.length === 3 && items.map((i) => i.position).join() === '1,2,3' && items[0].item === `${shared.siteUrl}/` && items[1].name === 'BOOM Desks' && items[1].item === `${shared.siteUrl}/desks` && items[2].name === CITY[s].city && items[2].item === `${shared.siteUrl}/${s}`,
      `${s}: the breadcrumb runs Home → BOOM Desks (/desks) → ${CITY[s].city}`, JSON.stringify(items.map((i) => i.item)));
  }
  // v1.6 review (visual F9), on the Horizon: an arc never passes over a desk it does not serve.
  // Read from what is DRAWN (the cubic path, each dot with the mark it carries: 3px, this desk's
  // 10px ring), and the same arc on every page (one lift and lean per desk, chosen over all of them)
  const drawnD = {};
  for (const s of SLUGS) {
    const map = sliceOf(PAGE[s], '<svg class="hz"', '</svg>');
    const dots = [...map.matchAll(/<circle class="(d|d off|d-ring)" cx="([\d.]+)" cy="([\d.]+)" r="([\d.]+)"/g)].map((m) => ({ key: `${m[2]},${m[3]}`, xy: [+m[2], +m[3]], r: +m[4] }));
    const arcs = [...map.matchAll(/<path class="arc(?: me)?" data-k="([a-z]{3})"[^>]*d="([^"]+)"\/>/g)].map((m) => ({ k: m[1].toUpperCase(), d: m[2] }));
    for (const a of arcs) (drawnD[a.k] = drawnD[a.k] || new Set()).add(a.d);
    // the dot an arc serves is the one under its end
    const keyed = arcs.map((a) => { const p = hzPathPts(a.d, 8), e = p[p.length - 1]; return { key: (dots.find((d) => Math.hypot(d.xy[0] - e[0], d.xy[1] - e[1]) < 0.6) || {}).key, d: a.d }; });
    const bad = hzViolations(keyed, dots);
    check(arcs.length >= 2 && keyed.every((a) => a.key) && dots.some((d) => d.r === ARC_ME_R) && dots.length === SLUGS.length && bad.length === 0,
      `${s}: every arc drawn from Rome clears every other desk's dot by ≥ ${ARC_CLEAR}px — the hollow dots of the desks not open included (this desk's ${ARC_ME_R}px ring counted)`, bad.join('; '));
  }
  check(Object.keys(drawnD).length === SLUGS.length && Object.values(drawnD).every((set) => set.size === 1), 'the arc to a desk is the same on every page (one lift and lean per desk, chosen over all of them)',
    JSON.stringify(Object.entries(drawnD).filter(([, v]) => v.size > 1).map(([k]) => k)));
  // the check bites: a dot 4px off the middle of the real ROM → LON arc is the violation the build refuses
  {
    const lon = HZ.arcs.get('LON'), pts = hzPathPts(lon.d, 40), mid = pts[Math.floor(pts.length / 2)];
    const bad = hzViolations([{ key: 'LON', d: lon.d }], [{ key: 'X', xy: [mid[0] + 4, mid[1]], r: ARC_DOT_R }, { key: 'LON', xy: lon.to, r: ARC_DOT_R }]);
    check(bad.length === 1 && /^ROM → LON passes -?\d+\.\dpx from X$/.test(bad[0]) && hzViolations([{ key: 'LON', d: lon.d }], [{ key: 'Y', xy: [mid[0], mid[1] + 40], r: ARC_DOT_R }]).length === 0,
      `(hzViolations catches an arc within ${ARC_CLEAR}px of a dot it does not serve — "${bad[0]}" — and clears one 40px away)`);
    const lifts = new Set([...HZ.arcs.values()].map((a) => a.lift));
    check(HZ.arcs.size === SLUGS.length && lifts.size === 1 && HZ_LIFT.includes([...lifts][0]) && [...HZ.arcs.values()].every((a) => HZ_LEAN.includes(a.lean) && /^M[\d.]+ [\d.]+C/.test(a.d) && hzPathPts(a.d).length > 20),
      `one lift serves every desk (${[...lifts][0]}: the height stays proportional to the distance), the arcs are cubics from Rome; leans only where needed (${[...HZ.arcs.values()].filter((a) => a.lean).map((a) => `${a.key} ${a.lean}`).join(', ') || 'none'})`);
    check(HZ_CAM.pad.l === 0.09 && HZ_CAM.pad.r === 0.06 && HZ.view[0] === 0 && HZ.view[2] === 640 && HZ.view[1] > 0 && HZ.view[1] + HZ.view[3] <= 520,
      `the camera's side paddings are the Stage 2 ones (pins ≥ 44px at 320); the frame is cropped top and bottom only (viewBox ${HZ.view.join(' ')})`);
  }
}
// a desk no arc can serve is a build error, never an arc through a sister: one set 6 km from
// Milan ends every arc (its own, and Milan's) inside the other's ring, whatever lift or lean
refuses((c) => { c.geo = { lat: CITY.milan.geo.lat + 0.05, lon: CITY.milan.geo.lon + 0.05 }; check(validGeo(c.geo), '(coordinates 6 km from Milan are a valid geo: only the arcs refuse them)'); },
  /network map: no bow takes the arc ROM → [A-Z]{3} clear of the other desks|draws an arc over a desk/, 'a desk placed where every arc from Rome would cross a sister\'s dot is refused by the build (no arc through a sister)');

// BOOM Desks (03/11/2026): a LIVE page never links a desk that is not open —
// the build refuses it, from the template and from a city's own data
tplRefuses('<p class="net-c">Every desk answers from Rome.</p>', '<p class="net-c">Every desk answers from Rome. <a href="/paris">Paris</a></p>', /a live page links a desk that is not open \(href="\/paris/,
  'MUTATION: a live page linking a desk that is not open (href="/paris", from the template) is refused by the build');
tplRefuses('<p class="net-c">Every desk answers from Rome.</p>', '<p class="net-c">Every desk answers from Rome. <a href="https://www.boomrome.com/berlin#fares">Berlin</a></p>', /a live page links a desk that is not open/,
  'a live page linking a desk that is not open by its absolute URL is refused too');
refuses((c) => { c.bref.rows[0].ddHtml += ' See <a href="/berlin">Berlin</a>.'; }, /a live page links a desk that is not open \(href="\/berlin/, 'a live desk\'s own data linking a desk that is not open is refused', 'london');
check(throws(() => render(CITY.paris, shared, template.replace('<p class="net-c">Every desk answers from Rome.</p>', '<p class="net-c">Every desk answers from Rome. <a href="/berlin">Berlin</a></p>')), /not open/) === 'did not throw',
  'a draft may link another draft (the review sees the suite)');

// the company's identity, said once: a REA or a VAT number in a desk's copy
// is the entity's own (cities/_shared.json) — the build refuses a typed variant
refuses((c) => { c.bref.rows[0].ddHtml = c.bref.rows[0].ddHtml.replace('REA RM-1710623', 'REA RM-1234567'); check(/REA RM-1234567/.test(c.bref.rows[0].ddHtml), '(the mutation reaches Milan\'s "Who" row)'); },
  /"REA RM-1234567" is not the company's REA \(RM-1710623/, 'MUTATION: milan\'s "Who" row with REA RM-1234567 is refused by renderCity (the identity is said once)', 'milan');
refuses((c) => { c.footer.statement += ' P.IVA 12345678901.'; }, /"VAT 12345678901" is not the company's VAT number \(17322991005/, 'a VAT / P.IVA number other than the entity\'s is refused', 'milan');
tplRefuses('<p class="proof">', '<p class="proof">REA RM-9999999 · ', /"REA RM-9999999" is not the company's REA/, 'a REA typed into the template is refused too (the output is read back)');

// P0 (BOOM Desks): the Organization and each desk's Service are ONE function
// each — every page carries exactly what they return (the hub repeats them)
{
  const strip = (o) => JSON.parse(JSON.stringify(o));
  const all = SLUGS.map((x) => CITY[x]);
  for (const s of SLUGS) {
    const g = ([...PAGE[s].matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((m) => JSON.parse(m[1])).find((b) => Array.isArray(b['@graph'])) || {})['@graph'] || [];
    const o = g.find((n) => n['@type'] === 'RealEstateAgent'), sv = g.find((n) => n['@type'] === 'Service');
    check(JSON.stringify(o) === JSON.stringify(strip(orgNode(shared, all))) && JSON.stringify(sv) === JSON.stringify(strip(serviceNode(CITY[s], shared, `${shared.siteUrl}/${s}`, `${shared.siteUrl}/#organization`))),
      `${s}: the page's Organization is orgNode() and its Service (with the Offers) is serviceNode(), byte for byte`);
  }
  check(numberWord(1) === 'one' && numberWord(5) === 'five' && numberWord(12) === 'twelve' && throws(() => numberWord(13), /one to twelve/) === true && throws(() => numberWord(0), /one to twelve/) === true,
    'numberWord: one…twelve, and nothing else (a count in words is derived, never typed)');
  check(listJoin(['Amsterdam', 'Barcelona', 'London']) === 'Amsterdam, Barcelona and London' && listJoin(['Berlin', 'Paris']) === 'Berlin and Paris' && listJoin(['London']) === 'London' && listJoin([]) === '',
    'listJoin: "A, B and C", "A and B", "A"');
  check(dateLong('2026-11-03') === '3 November 2026' && dateLong('2027-01-09') === '9 January 2027' && throws(() => dateLong('03/11/2026'), /YYYY-MM-DD/) === true,
    'dateLong: "3 November 2026" from a fixed month table (never Intl)');
  check(homeCountryOf(shared) === 'IT' && isHomeDesk(CITY.milan, shared) && SLUGS.filter((x) => x !== 'milan').every((x) => !isHomeDesk(CITY[x], shared)),
    'the home country is the organization\'s address (IT): Milan is the home-country desk, no other');
}

// ── Milan: what it is (BOOM Desks, 03/11/2026) — the founder: «in Milan we
// are a pure real estate agency as an Italian SRL … but keep it always like
// one of the desks». The home-country desk says so, and nothing more.
{
  const mil = PAGE.milan, M = CITY.milan;
  const WHO = 'BOOM Milan, the tenant-side desk of <b>Egidi Immobiliare S.r.l.</b>, an Italian real estate agency registered with the Rome Chamber of Commerce (REA RM-1710623). In Milan it works under the same Italian law as our agency in Rome. Hired by the tenant, paid by the tenant only.';
  const STMT = 'BOOM Milan is a desk of Egidi Immobiliare S.r.l., an Italian real estate agency registered in Rome (REA RM-1710623), under the same Italian law as in Rome. On this desk we act solely for the tenant: we do not list properties, represent landlords, or receive remuneration from landlords or their agents.';
  const Q6 = 'Is BOOM Milan a real estate agency?';
  const A6 = 'Yes. BOOM Milan is a desk of Egidi Immobiliare S.r.l., an Italian real estate agency registered with the Rome Chamber of Commerce (REA RM-1710623), under the same Italian law as our agency in Rome. On this desk we work for the tenant only: you hire us and pay us, never the landlord.';
  const HOME = 'Operated by Egidi Immobiliare S.r.l., an Italian real estate agency, under the same Italian law as in Rome';
  const DEF = 'Operated by Egidi Immobiliare S.r.l., an Italian real estate agency registered in Rome';
  check(M.bref.rows[0].dt === 'Who' && M.bref.rows[0].ddHtml === WHO && mil.includes(`<dt>Who</dt><dd>${WHO}</dd>`), 'milan: the "Who" row says what it is — an Italian real estate agency registered with the Rome Chamber of Commerce (REA RM-1710623), the same Italian law as in Rome');
  check(M.footer.statement === STMT && mil.includes(`<p class="stmt">${esc(STMT)}</p>`), 'milan: the footer statement — a desk of the Italian agency, under the same Italian law as in Rome, acting solely for the tenant');
  const mg = ([...mil.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((m) => JSON.parse(m[1])).find((b) => Array.isArray(b['@graph'])) || {})['@graph'] || [];
  const mf = (mg.find((n) => n['@type'] === 'FAQPage') || {}).mainEntity || [];
  check(M.faq.items.length === 6 && M.faq.items[5].q === Q6 && M.faq.items[5].a === A6 && mil.includes(`<span class="t">${esc(Q6)}</span></summary><p>${esc(A6)}</p>`)
    && mf.length === 6 && mf[5].name === Q6 && mf[5].acceptedAnswer.text === A6, 'milan: the sixth question "Is BOOM Milan a real estate agency?" — visible and in the FAQPage, word for word');
  check(mil.includes(`<p class="proof">${esc(HOME)} · <a class="lnk" href="${shared.rome.profileUrl}"`), 'milan: the proof line under the pass says the home-country desk (an Italian real estate agency, the same Italian law as in Rome)');
  check(SLUGS.filter((x) => x !== 'milan').every((x) => PAGE[x].includes(`<p class="proof">${esc(DEF)} · <a class="lnk" href="${shared.rome.profileUrl}"`) && !PAGE[x].includes(HOME)),
    'the seven other desks keep the default proof line, byte for byte ("an Italian real estate agency registered in Rome": which registry, never a Valencian or Spanish one)');
  const flipped = clone(M); flipped.country = 'XX';
  const fh = render(flipped).html;
  check(fh.includes(`<p class="proof">${esc(DEF)} · `) && !fh.includes(HOME), 'MUTATION: Milan with another country reverts to the default proof line (the home-country desk is derived, never typed)');
  // never printed: a Milan office, a licence or a registration in Milan, the Milan Chamber, Rome's fees
  const BANNED = [/\b(?:office|branch|sede|team|based)\s+in\s+(?!Rome\b)[A-Z]\w*/, /\b(?:licensed|registered)\s+in\s+(?!Rome\b)\w+/i, /Milan Chamber of Commerce/i, /our Milan team/i, /licensed agent/i, /same fees as Rome/i, /Italian consumer law applies/i];
  for (const x of SLUGS) {
    const strs = (v) => (typeof v === 'string' ? [v] : v && typeof v === 'object' ? Object.values(v).flatMap(strs) : []);
    const said = [visibleText(PAGE[x]), ...[...PAGE[x].matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].flatMap((m) => strs(JSON.parse(m[1])))].join(' \n ');
    const hit = BANNED.map((re) => said.match(re)).find(Boolean);
    check(!hit, `${x}: no office, branch, team or licence outside Rome, no "Milan Chamber of Commerce", no "same fees as Rome"`, hit && hit[0]);
  }
}

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
refuses((c) => { c.pricing.plans[0].includes[0] += ', and a very long extra clause about everything else we do for you on the Full Search, from the brief to the keys, the paperwork and the first week'; }, /ticket is \d+ words, over 60/, 'a ticket over its 60 words is refused');
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
  const XY = SLUGS.map((s) => [s, ...HZ.cam.xy(CITY[s].geo)]);
  const [, vy, , vh] = HZ.view;
  check(XY.every(([, x, y]) => x >= 20 && x <= 620 && y >= vy + 10 && y <= vy + vh - 10) && validGeo(shared.rome.geo) && !validGeo({ lat: 52, lon: 40 }) && !validGeo({ lat: 64, lon: -21 }) && !validGeo({ lat: '52', lon: 5 }),
    `every desk projects inside the Horizon's cropped frame (${XY.map(([s, x, y]) => `${s} ${Math.round(x)},${Math.round(y)}`).join(' · ')}); Moscow and Reykjavik would not`);
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
  // v1.7 (CI fonts): a pair member whose condition has three parts carries f-c3, so the closed pair breaks it after
  // its first part and both stubs start on one line; Full Search (not in the pair) and two-part conditions do not
  for (const s of SLUGS) {
    const marks = Object.fromEntries(CITY[s].pricing.plans.map((p) => [p.id, new RegExp(`data-plan-price="${p.id}">[^<]*</span><span class="f-cond f-c3">`).test(PAGE[s])]));
    const want = Object.fromEntries(CITY[s].pricing.plans.map((p) => [p.id, p.id !== 'full-search' && p.condition.split(' · ').length > 2]));
    check(JSON.stringify(marks) === JSON.stringify(want), `${s}: the three-part conditions of the pair, and only those, carry f-c3`, JSON.stringify({ marks, want }));
  }
  { const css = read('assets/src/boom-city.css');
    check(/@media \(min-width:360px\) and \(max-width:389px\)\{\.bps:not\(\.pair-open\)[^{]*\.f-cond\{letter-spacing:\.03em\}\}/.test(css) && /@media \(min-width:360px\) and \(max-width:599px\)\{\.bps:not\(\.pair-open\)[^{]*\.f-c3 br\{display:inline\}\}/.test(css),
      'the closed pair: .03em tracking under 390, and the three-part condition breaks after its first part below 600 (CI fonts: the stubs stood 11.7 px apart)'); }
  check(CITY.berlin.hero.faresHead.span === 'Nothing charged today' && /data-plan-price="full-search">€500<\/span><span class="f-cond">flat ·<br> incl\. VAT · on signing<\/span>/.test(PAGE.berlin),
    'berlin: nothing is charged today, and Full Search says on its own row that it is due only once you sign (WoVermRG §2–§3)');
  check(/Catalan or Spanish/.test(CITY.barcelona.checkoutCopy.fine) && /fulls oficials/i.test(PAGE.barcelona), 'barcelona: documents in Catalan or Spanish on request, the official complaint forms named');
  for (const s of ['madrid', 'barcelona', 'valencia']) {
    const h = PAGE[s];
    check(h.includes('<b id="faresH">Optional, chosen in writing</b>') && h.includes('<b>You hire us; we do not act for the landlord.</b>'), `${s}: the prices open "Optional, chosen in writing"; the must-state in bold`);
    check(/<details class="lane rv" id="check-fees" style="--i:0"><summary><span class="ln" aria-hidden="true">01<\/span> <span class="at" data-instr>LAU art\. 20<\/span> <span class="t">[^<]+<\/span><\/summary>/.test(h) && CITY[s].checks.items[0].id === 'fees',
      `${s}: the check "Who pays the agent · LAU art. 20" is the FIRST Pre-flight lane`);
  }
  check(!/AICAT/.test(PAGE.barcelona.replace(/<!--[\s\S]*?-->/g, '')), 'barcelona: no AICAT registration is claimed anywhere (there is no number to print)');
  // v1.7 review: LAU art. 20 is an ORDER — "Optional, chosen in writing" is read before the first price in #fares
  for (const s of ['madrid', 'barcelona', 'valencia']) {
    const fares = sliceOf(PAGE[s], '<!-- FARES -->', '<!-- /FARES -->');
    const hAt = fares.indexOf('id="faresH"'), pAt = fares.search(/data-plan-price=/);
    check(hAt > -1 && pAt > -1 && hAt < pAt, `${s}: in #fares the head "Optional, chosen in writing" (#faresH) comes BEFORE the first price (LAU art. 20)`, `head at ${hAt}, first price at ${pAt}`);
  }
  // v1.7 review, third round: every sentence about registration or licences is REVIEWED (cities/_claims.json,
  // default deny). Two rounds of regexes chased each other (round 1 refused true copy about the lease, round 2 let
  // "Registered with the Generalitat Valenciana." through); now an unlisted sentence is refused whatever its shape.
  {
    const claims = loadClaims(R);
    const page = (t) => `<!DOCTYPE html><html><head><title>t</title></head><body><main><p>${t}</p></main></body></html>`;
    const sortE = (a) => [...a].sort((x, y) => (x.text < y.text ? -1 : x.text > y.text ? 1 : 0));
    const withEntries = (add) => lintClaims({ ...claims, allowed: sortE([...claims.allowed, ...add]) });
    // (a) the real build is clean: every trigger sentence on the eight desks and /desks is reviewed; no selling desk names a register
    const SELLERS = SLUGS.filter((s) => CITY[s].checkout === true);
    check(SELLERS.join() === 'amsterdam,barcelona,london,madrid,milan,valencia', `the selling desks are ${SELLERS.join(', ')}`);
    const hubHtml = read('desks.html');
    const used = new Set();
    for (const [s, h] of [...SLUGS.map((x) => [x, PAGE[x]]), ['desks', hubHtml]]) {
      const bad = claimProblems(h, { claims, sell: SELLERS.includes(s) });
      check(!bad.length, `${s}: every sentence about registration or licences is in ${CLAIMS_FILE}${SELLERS.includes(s) ? ', no register the desk does not hold, no partner line' : ''}`, bad.map((p) => `${p.why}: "${p.text}"`).join(' | '));
      for (const x of reviewSentences(h)) used.add(x.text);
    }
    // the extractor reads each meta and each JSON string on its own, never concatenated
    {
      const h = '<html><head><meta name="description" content="Paid by you"><meta property="og:description" content="registered with the Generalitat"><script type="application/ld+json">{"a":"Tenant side","b":"Licensed in Spain."}</script></head><body><p>Hello <b>registered</b>in Rome.</p><div aria-label="BOOM, registered in Valencia"></div><script>var x = "We are licensed in Spain";</script></body></html>';
      const r = reviewSentences(h);
      const has = (t, w) => r.some((x) => x.text === t && x.where === w);
      check(has('registered with the Generalitat', 'meta') && has('Licensed in Spain', 'ld') && has('BOOM, registered in Valencia', 'attr') && has('We are licensed in Spain', 'script') && !r.some((x) => /Paid by you registered/.test(x.text)),
        'reviewSentences: each meta, each JSON-LD string, attributes and inline-script strings separately (never concatenated), normalised', JSON.stringify(r));
    }
    { const empty = fs.mkdtempSync(path.join(os.tmpdir(), 'boom-claims-')); check(throws(() => loadClaims(empty), /cities\/_claims\.json: is missing: every sentence about registration or licences is reviewed there \(default deny\)/) === true, 'no cities/_claims.json, no page: default deny'); }
    // (f) no stale entries
    const stale = claims.allowed.filter((e) => !used.has(e.text)).map((e) => e.text);
    check(!stale.length, `${CLAIMS_FILE}: every one of the ${claims.allowed.length} entries is printed on at least one built page (no stale entry)`, stale.join(' | '));
    check(claims.allowed.length >= 50 && CLAIM_KINDS.every((k) => claims.allowed.some((e) => e.kind === k)) && claims.allowed.every((e) => e.kind !== 'partner' || !SELLERS.some((s) => reviewSentences(PAGE[s]).some((x) => x.text === e.text))),
      `${CLAIMS_FILE}: ${claims.allowed.length} reviewed sentences, every kind used, no partner line on a desk that sells`);
    // (b) the claims of both regex rounds and the verifier's misses: refused on a desk that sells (unreviewed or banned)
    const KO = ['we are registered with the Comunitat Valenciana', 'we are listed in the RAICV', 'we are authorised by the Generalitat', 'BOOM is licensed in Spain',
      'BOOM Valencia is registered with the regional registry', 'a registered Italian agency', 'licensed to operate in Spain', 'a licensed agency in Valencia',
      'registered as an agent in Valencia', 'a Valencia-registered agency', 'an accredited Valencian agency', 'authorised to broker leases in Valencia',
      'registered real estate agency in Valencia', 'member of the Valencian register', "we're registered with the Generalitat", 'our agents are certified in Spain',
      'Registered with the Generalitat Valenciana.', 'Licensed in the Netherlands.', 'Registered with the Generalitat de Catalunya as an estate agency.', 'BOOM, registered in Valencia, answers from Rome.',
      'BOOM — licensed in Spain.', 'Accredited by the Generalitat Valenciana.', 'Registered in Spain under number V-1234.', 'Fully licensed and insured in Spain.', 'BOOM Amsterdam, licensed by the gemeente.',
      'Registered with the KvK (Dutch Chamber of Commerce).', 'We are an Italian real estate agency registered in Valencia.', 'an agency licensed in Spain', 'an agency registered in the Netherlands',
      'The Valencia desk is registered with the Generalitat.', 'We hold a licence in Spain.', "We've been licensed in Spain since 2024.", 'Our Valencia desk is licensed by the Generalitat.',
      'Our team is licensed in Spain.', 'Our licensed team in Valencia.', 'BOOM Desks Valencia S.L. is registered with the Generalitat.', 'Egidi Immobiliare srl is registered in Valencia.',
      'We were granted a licence by the Generalitat.', 'We have a licence from the Generalitat.', 'Our agents hold a licence in Valencia.', 'BOOM holds a Valencian agent licence.',
      'The desk holds a Spanish licence.', 'We operate under licence in Spain.', 'We are KvK-registered.', 'BOOM is a member of a government-approved redress scheme.',
      'We are regulated by the Property Ombudsman.', 'BOOM is a member of ARLA Propertymark.'];
    const koMiss = KO.filter((t) => !claimProblems(page(t), { claims, sell: true }).length);
    check(!koMiss.length, `the ${KO.length} claims of both rounds and the verifier's misses (subject-free footers, the agency after its noun, licences as nouns, memberships) are refused on a desk that sells`, koMiss.join(' | '));
    check(['Registered with the Generalitat Valenciana.', 'We are an Italian real estate agency registered in Valencia.', 'BOOM is a member of a government-approved redress scheme.', 'We are regulated by the Property Ombudsman.', 'We hold a licence in Spain.', 'We are KvK-registered.', 'Fully licensed and insured in Spain.', 'The Valencia desk is registered with the Generalitat.']
      .every((t) => claimProblems(page(t), { claims, sell: false }).length), 'the eight named claims are refused on a draft desk and on /desks too (default deny is not a selling-desk rule)');
    check(throws(() => claimGuard(page('Registered with the Generalitat Valenciana.'), { claims, sell: true }, 'cities/valencia.json'), /cities\/valencia\.json: 1 sentence\(s\) about registration or licences not reviewed in cities\/_claims\.json: "Registered with the Generalitat Valenciana" \(text\) — if it does not say that BOOM or the company holds a registration, licence or membership outside Rome, add it to cities\/_claims\.json with its kind and a note; if it does, it cannot ship/) === true,
      'the refusal names the desk, quotes the sentence and says what to do');
    // (c) true sentences are refused by default, and pass once a person adds them with a non-claim kind (the workflow, on an in-memory copy)
    const TRUE = [['The lease is registered with the Agenzia delle Entrate within 30 days', 'lease'], ['Egidi Immobiliare S.r.l. is registered under REA RM-1710623.', 'company-rome'],
      ['Students enrolled at the Universidad Complutense qualify.', 'tenant'], ['BOOM is registered as a European Union trade mark.', 'trade-mark'], ['Your fianza is lodged with the regional register of deposits.', 'tenant'],
      ['The company is registered at Viale Liegi 42, Rome.', 'company-rome'], ['BOOM is registered with the EUIPO as a trade mark.', 'trade-mark'],
      ["We're a Rome-registered agency.", 'company-rome'], ['Ask whether the agency is licensed.', 'law'], ['Only pay a holding deposit to a registered letting agent.', 'law'],
      ['Most homes on Idealista are listed by licensed agencies.', 'law'], ['The deposit goes to the Catalan register of tourist dwellings.', 'law'], ['BRP: registration in the Dutch register of persons.', 'tenant'],
      ["The landlord's agent is authorised to act for the landlord, not for you.", 'law'], ['we are not licensed in Spain', 'law'], ['We are not a Spanish-registered agency.', 'law'],
      ['Portals: Funda and Pararius list most homes; registered agents post first.', 'law'], ['Once you are registered with the gemeente you get a BSN.', 'tenant'], ['beware of unlicensed agents', 'law'], ['we check the lease is registered', 'lease']];
    const trueBad = TRUE.filter(([t, kind]) => {
      const before = claimProblems(page(t), { claims, sell: true });
      if (!before.length || before.some((p) => p.why !== 'unreviewed')) return true;
      try { return claimProblems(page(t), { claims: withEntries(before.map((p) => ({ text: p.text, kind, note: 'reviewed in the test: not a claim about us' }))), sell: true }).length > 0; } catch { return true; }
    });
    check(!trueBad.length, `the ${TRUE.length} true sentences the regexes refused are reported as unreviewed (default deny) and pass once added to a copy of ${CLAIMS_FILE} with their kind (lease, tenant, company-rome, trade-mark, law)`, trueBad.map(([t]) => t).join(' | '));
    // fourth round: "listed", "approved", "member", "permit" are in the vocabulary now; true sentences with them are reviewed like the rest
    {
      const T4 = [['Homes listed on Rightmove go fast.', 'listing'], ['The landlord must approve the tenant before signing.', 'law'], ['Unregistered leases are void in Italy until registered.', 'lease'],
        ['The landlord lodges the deposit with the Generalitat Valenciana.', 'deposit'], ['Your household members can live with you.', 'tenant']];
      const bad4 = T4.filter(([t, kind]) => {
        const before = claimProblems(page(t), { claims, sell: true });
        if (!before.length || before.some((p) => p.why !== 'unreviewed')) return true;
        try { return claimProblems(page(t), { claims: withEntries(before.map((p) => ({ text: p.text, kind, note: 'reviewed in the test: not a claim about us' }))), sell: true }).length > 0; } catch { return true; }
      });
      check(!bad4.length, 'fourth round: sentences with "listed", "approve", "Unregistered", "Generalitat", "members" are reviewed (default deny) and pass once listed with their kind (listing, law, lease, deposit, tenant)', bad4.map(([t]) => t).join(' | '));
      check(["rent within the bands of Milan's local agreement", 'We read the agreement before you sign', 'Shortlisted, still abroad', 'All prices include VAT'].every((t) => !hasClaimVocab(t)),
        'fourth round: "agreement" (agréé is accented only), "shortlisted" (a word inside another) and plain copy are not in the vocabulary');
    }
    // (d) the lint: a reviewed file cannot carry a claim
    const lintRefuses = (e, re) => throws(() => withEntries([{ note: 'a lint probe, refused', ...e }]), re) === true;
    check(lintRefuses({ text: 'we are registered with the Comunitat Valenciana', kind: 'tenant' }, /kind tenant, but the company is the subject/), 'lint: "we are registered with the Comunitat Valenciana" as kind tenant is refused (the company as subject)');
    check(lintRefuses({ text: 'The tenant checks the RAICV listing', kind: 'law' }, /names a register or a scheme no desk holds \(RAICV\)/), 'lint: an entry naming RAICV is refused, whatever its kind');
    check(lintRefuses({ text: 'Egidi Immobiliare S.r.l. is registered in Italy', kind: 'company-rome' }, /kind company-rome names Rome/), 'lint: a company-rome entry without Rome, REA RM-1710623 or Viale Liegi is refused');
    check(lintRefuses({ text: 'BOOM, registered in Valencia, answers from Rome', kind: 'company-rome' }, /does not land on Rome/), 'lint: a company-rome entry whose "registered" does not land on Rome is refused (Rome named later in the sentence is not enough)');
    check(lintRefuses({ text: 'We are licensed in Spain', kind: 'law' }, /no negation/) && !lintRefuses({ text: 'We are not licensed in Spain', kind: 'law' }, /./),
      'lint: a law entry with the company as subject needs a negation ("We are not licensed in Spain" passes, "We are licensed in Spain" does not)');
    check(lintRefuses({ text: 'Registered with the Generalitat Valenciana', kind: 'tenant' }, /shape of a claim \(a participle with no subject/) && lintRefuses({ text: 'Our licensed team in Valencia', kind: 'heading' }, /company is the subject/),
      'lint: the subject-free footer and "our licensed team" are refused as tenant/heading');
    check(lintRefuses({ text: 'Launching with a licensed partner in Valencia, registered in Spain', kind: 'partner' }, /does not land on Rome/) && lintRefuses({ text: 'Registration', kind: 'nothing' }, /kind must be one of/)
      && lintRefuses({ text: 'Licensed partner and licensed in Spain', kind: 'partner' }, /a licence only as "a licensed partner"/),
      'lint: a partner entry may only name "a licensed partner" and the Rome registration; an unknown kind is refused');
    check(throws(() => lintClaims({ ...claims, allowed: [...claims.allowed].reverse() }), /sorted by text/) === true && throws(() => lintClaims({ ...claims, allowed: sortE([...claims.allowed, claims.allowed[0]]) }), /listed twice/) === true
      && throws(() => withEntries([{ text: 'Paid by you', kind: 'tenant', note: 'no trigger word here' }]), /carries no registration or licence word/) === true,
      'lint: the file is sorted and unique, and holds only sentences the build reviews');
    // (e) kind partner: the drafts' wording, refused on a desk that sells
    const partnerP = page('Launching with a licensed partner.');
    check(claimProblems(partnerP, { claims, sell: true }).some((p) => p.why === 'partner') && !claimProblems(partnerP, { claims, sell: false }).length
      && throws(() => claimGuard(partnerP, { claims, sell: true }, 'cities/amsterdam.json'), /cities\/amsterdam\.json: "a licensed partner" is the wording of a desk that is not open/) === true,
      'kind partner ("Launching with a licensed partner") passes on a draft and on /desks, and is refused on a desk that sells');
    // the build itself: an unreviewed sentence in a desk's data, through render()
    refuses((c) => { c.faq.items[0].a += ' Registered with the Generalitat Valenciana.'; }, /cities\/valencia\.json: 1 sentence\(s\) about registration or licences not reviewed.*"Registered with the Generalitat Valenciana" \(text, ld\)/, 'build: a subject-free registration claim in valencia\'s FAQ is refused (it was the round-2 regression)', 'valencia');
    refuses((c) => { c.faq.items[0].a += ' We are regulated by the Property Ombudsman.'; }, /a desk that sells names a register or a licence it does not hold \(Property Ombudsman\): "We are regulated by the Property Ombudsman" \(text, ld\)/, 'build: a named scheme on a desk that sells is refused even before review (London)', 'london');
    {
      const c = clone(CITY.milan); c.checks.items[0].text += ' The lease is registered with the Agenzia delle Entrate within 30 days.';
      const r1 = throws(() => render(c), /add it to cities\/_claims\.json with its kind and a note/);
      const more = withEntries([{ text: 'The lease is registered with the Agenzia delle Entrate within 30 days', kind: 'lease', note: 'the lease registration, not ours' }]);
      let r2 = 'threw'; try { render(c, shared, template, R, { claims: more }); r2 = true; } catch (e) { r2 = e.message; }
      check(r1 === true && r2 === true, 'build: a true lease sentence added to milan is refused with "add it to cities/_claims.json…", and builds once the sentence is added (an in-memory allowlist)', `${r1} / ${r2}`);
    }
    // ── fourth round (04/11/2026): the extractor, the vocabulary, the context rules, the lint, the HTML whitelist ──
    {
      const at = (h) => reviewSentences(h);
      const has = (h, t, w) => at(h).some((x) => x.text === t && (!w || x.where === w));
      // (h1) the extractor: entities decoded BEFORE the split, NFKC, no format characters, inline tags squashed, every attribute
      check(has('<p>R&#101;gistered with the Generalitat Valenciana.</p>', 'Registered with the Generalitat Valenciana', 'text') && has('<p>Regis&shy;tered with the Generalitat Valenciana.</p>', 'Registered with the Generalitat Valenciana', 'text')
        && has('<p>Licen&#99;ed in Spain.</p>', 'Licenced in Spain') && has('<p>Member&nbsp;of the NVM.</p>', 'Member of the NVM') && has('<p>Regis&#x200D;tered in Spain.</p>', 'Registered in Spain'),
        'extractor: entities are decoded on the whole text before the split ("&#101;" and "&shy;" are no longer cut at their ";")');
      check(has('<p>Regis\u200Btered in Spain.</p>', 'Registered in Spain') && has('<p>Regis\u00ADtered in Spain.</p>', 'Registered in Spain') && has('<p>Licen\u2060sed in Spain.</p>', 'Licensed in Spain')
        && has('<p>Regis\u2028tered in Spain.</p>', 'Registered in Spain') && has('<p>Ｒｅｇｉｓｔｅｒｅｄ in Spain.</p>', 'Registered in Spain') && cleanText('Regis\uFEFFtered') === 'Registered',
        'extractor: NFKC (fullwidth letters) and no \\p{Cf} (soft hyphen, zero-width space/joiner, word joiner, BOM) nor U+2028/2029');
      check(at('<p>Regis<span>tered</span> with the Generalitat Valenciana.</p>').some((x) => x.split && x.text === 'Registered with the Generalitat Valenciana')
        && at('<p><b>Reg</b><i>istered</i> with the Generalitat Valenciana.</p>').some((x) => x.split) && at('<p><!-- x --><span>Licen</span><!-- y -->sed in Spain.</p>').some((x) => x.split)
        && !at('<p>Hello <b>registered</b>in Rome.</p>').some((x) => x.split),
        'extractor: a word split by inline tags or comments is read whole in the squashed copy, and refused (a block whose squashed copy has more vocabulary than its spaced copy)');
      check(has("<p><span title='Registered with the Generalitat Valenciana'>x</span></p>", 'Registered with the Generalitat Valenciana', 'attr') && has('<p><span title=Licensed>x</span></p>', 'Licensed', 'attr')
        && has('<p><span aria-description="Registered in Valencia">x</span></p>', 'Registered in Valencia', 'attr') && has('<p><input value="Registered in Valencia" readonly></p>', 'Registered in Valencia', 'attr')
        && has('<select><optgroup label="Licensed in Spain"><option>x</option></optgroup></select>', 'Licensed in Spain', 'attr') && has("<p><span data-x='Licensed in Spain'></span></p>", 'Licensed in Spain', 'attr')
        && !at('<p><a href="/registration" class="registered">x</a></p>').some((x) => /regist/i.test(x.text)),
        'extractor: every attribute that carries letters is read, in either quote style or none (title, aria-*, value, label, data-*), except the non-text ones (href, class, …)');
      check(has('<style>.rx::after{content:"Registered with the Generalitat Valenciana"}</style><p>x</p>', 'Registered with the Generalitat Valenciana', 'style'), 'extractor: <style> content strings are text a reader sees');
      check(has('<ul><li><b data-instr>One company</b> Egidi Immobiliare S.r.l., registered in Rome.</li></ul>', 'Egidi Immobiliare S.r.l., registered in Rome')
        && has('<ul><li><span class="tn" aria-hidden="true">MIL 08</span> <span class="tt">University enrolment, for students</span></li></ul>', 'University enrolment, for students'),
        'extractor: the END of a data-instr element and span.tn / span.tt are sentence boundaries (no instrument label inside an entry)');
      check(normSentence('A trade mark of Egidi Immobiliare S.r.l.') === 'A trade mark of Egidi Immobiliare S.r.l.' && normSentence('Paid by you.') === 'Paid by you' && normSentence('Acme Ltd.') === 'Acme Ltd.'
        && has('<p>Agència col·legiada a Barcelona.</p>', 'Agència col·legiada a Barcelona'),
        'normSentence keeps the dot that closes S.r.l. / Ltd.; a middle dot inside a word (col·legiada) is not a split');
      // (h3, h4) the vocabulary: KO on a desk that sells (every probe of both verifiers)
      const KO4 = ['R.A.I.C.V. n.º 1234.', 'A.I.C.A.T. n.º 5678.', 'K.v.K. 12345678.', 'Kvk12345678.', 'KvK12345678.', 'Member: T.P.O. and A.R.L.A.', 'Erlaubnis nach §34 c GewO.', 'Makler mit Erlaubnis nach Paragraph 34c GewO.',
        'Chamber of Commerce no. 12345678 (Amsterdam).', 'BOOM Valencia is listed with the Generalitat Valenciana as an estate agency.', 'Approved by the Generalitat Valenciana as a real estate agent.', 'Our Generalitat Valenciana agent number: CV-1234.',
        'Reg. no. CV-1234 with the Generalitat Valenciana.', 'Regd. with the Generalitat Valenciana.', 'Lic. no. CV-1234, Generalitat Valenciana.', 'BOOM Valencia appears on the Generalitat list of estate agents.',
        'Supervised by the Generalitat Valenciana.', 'BOOM London is a RICS member firm.', 'A TPO member agency, with CMP cover for your money.', 'BOOM London is a chartered letting agent in England.',
        'Signed up to a government-approved complaints scheme in England.', 'BOOM Amsterdam is an NVM member agency.', 'We hold the trade permit in Germany.', 'BOOM is an NVM member.',
        'BOOM is a TPO member and offers client money protection.', 'BOOM is FIAIP-affiliated.', 'Approved by the Generalitat.', 'we are unregulated in Spain', 'Deregistered in Spain.', 'Unregistered agent in Spain.',
        'Agencia autorizada por la Generalitat Valenciana.', 'Agencia acreditada en Valencia.', 'Agencia certificada en Madrid.', 'Agencia regulada en Madrid.', 'Miembro de la Asociación de Agentes Inmobiliarios de Madrid.',
        'Agente de la Propiedad Inmobiliaria (API) n.º 1234.', 'Dada de alta como agencia ante la Generalitat Valenciana.', 'Agència amb llicència de la Generalitat.', 'Agència habilitat per la Generalitat.',
        'Agència acreditada a Catalunya.', 'Agència autoritzada a Barcelona.', 'Agència col·legiada a Barcelona.', 'Membre de l’API de Catalunya.', 'BOOM staat ingeschreven in het Handelsregister.',
        'Erkend makelaar in Amsterdam.', 'Lid van de NVM.', 'Een NVM-makelaar voor huurders.', 'Agence agréée en Espagne.', 'Titulaire de la carte T à Madrid.', 'Agence habilitée à Madrid.',
        'Im Handelsregister eingetragen.', 'Egidi Immobiliare è iscritta al ruolo degli agenti di Milano.', 'Iscritta alla Camera di Commercio di Milano.', 'Agenzia abilitata a Milano.', 'Com licença em Lisboa.',
        'We are on the Generalitat list of agents.', 'Is BOOM Valencia approved by the Generalitat?', 'Ask our Generalitat-approved agent.', 'Lic&shy;ensed in Spain.', 'Regis&#8203;tered in Spain.', 'R E G I S T E R E D in Spain.'];
      const KO4H = ['<p>R&#101;gistered with the Generalitat Valenciana.</p>', '<p>Licen&ZeroWidthSpace;sed in Spain.</p>', '<p>Member&#160;of the NVM.</p>', '<p>Regis<wbr>tered with the Generalitat Valenciana.</p>',
        '<p>Regis<span>tered</span> with the Generalitat Valenciana.</p>', '<p><b>Reg</b><i>istered</i> with the Generalitat Valenciana.</p>', '<p><!-- x --><span>Licen</span><!-- y -->sed in Spain.</p>',
        "<p><span title='Registered with the Generalitat Valenciana'>Valencia</span></p>", "<p><img alt='Licensed in Spain' src=\"/boom-logo.svg\"></p>", "<p><a href=\"#\" title='Licensed in Spain'>Valencia</a></p>",
        '<p><span aria-description="Registered with the Generalitat Valenciana">Valencia</span></p>', '<p><input value="Registered with the Generalitat Valenciana" readonly></p>',
        '<style>.rx::after{content:"Registered with the Generalitat Valenciana"}</style><span class="rx"></span>', '<select><optgroup label="Licensed in Spain"><option>x</option></optgroup></select>',
        "<p><abbr title='Registro de Agentes de Intermediacion Inmobiliaria'>R.A.I.C.V.</abbr></p>"];
      const pg = (b) => `<!DOCTYPE html><html><head><title>t</title></head><body><main>${b}</main></body></html>`;
      const miss4 = [...KO4.filter((t) => !claimProblems(page(t), { claims, sell: true }).length), ...KO4H.filter((h) => !claimProblems(pg(h), { claims, sell: true }).length)];
      check(!miss4.length, `fourth round: the ${KO4.length + KO4H.length} probes of both verifiers (entities, zero-width, inline tags, attributes, CSS content, abbreviations, synonyms, local languages, number shapes, §34c spellings) are refused on a desk that sells`, miss4.join(' | '));
      const BAN4 = ['R.A.I.C.V. n.º 1234.', 'A.I.C.A.T. n.º 5678.', 'K.v.K. 12345678.', 'Kvk12345678.', 'Member: T.P.O. and A.R.L.A.', 'Erlaubnis nach §34 c GewO.', 'Paragraph 34c GewO applies.', 'Property Redress',
        'A RICS member firm', 'An NVM agency', 'A VBO agency', 'client money protection', 'Agente de la Propiedad Inmobiliaria', 'API n.º 12', 'colegiado', 'carte T', 'TPO', 'CMP', 'PRS', 'Kamer van Koophandel'];
      const nb4 = BAN4.filter((t) => !claimProblems(page(t), { claims, sell: true }).some((p) => p.why === 'banned'));
      check(!nb4.length && !sellHit('Within 30 days the landlord lodges it in a government-approved scheme (DPS, TDS or mydeposits) and sends you its details') && closeUp('R.A.I.C.V. and K.v.K.') === 'RAICV and KvK',
        'fourth round: the registers by name and initials (closed up: R.A.I.C.V., K.v.K., T.P.O.; KvK12345678; §34 c; Paragraph 34c) are banned on a desk that sells; the deposit schemes DPS, TDS, mydeposits are not', nb4.join(' | '));
      // (h5) the context rules: the Rome line is not continued elsewhere; a reviewed label is not followed by an unreviewed place (the label rule, fifth round)
      const CTX4 = [['<dl><dt>Who</dt><dd>Egidi Immobiliare S.r.l. is an Italian real estate agency, registered in Rome. Also in Valencia, since 2026.</dd></dl>', 'place'],
        ['<dl><dt>Who</dt><dd>Egidi Immobiliare S.r.l. is an Italian real estate agency, registered in Rome; also in Valencia.</dd></dl>', 'place'],
        ['<dl><dt>Who</dt><dd>Egidi Immobiliare S.r.l. is an Italian real estate agency, registered in Rome. And with the Comunitat, in València.</dd></dl>', 'place'],
        ['<dl><dt>Registration</dt><dd>In Valencia, with the Generalitat.</dd></dl>', 'label'], ['<dl><dt>Registration</dt><dd>In Valencia, since 2026.</dd></dl>', 'label']];
      const ctxMiss = CTX4.filter(([h, w]) => !claimProblems(pg(h), { claims, sell: true }).some((p) => p.why === w)).map(([h]) => h);
      const ctxOk = [['<dl><dt>Who</dt><dd>Egidi Immobiliare S.r.l. is an Italian real estate agency, registered in Rome. Hired by the tenant, paid by the tenant only.</dd></dl>'],
        ['<dl><dt>Registration</dt><dd>padrón · NIE</dd><dd>Registered at the town hall with your lease: the SIP health card and a school place hang on it.</dd></dl>']].filter(([h]) => claimProblems(pg(h), { claims, sell: true }).length).map(([h]) => h);
      check(!ctxMiss.length && !ctxOk.length, 'fourth round: next to the company\'s Rome line an unreviewed sentence naming another desk place is refused ("Also in Valencia, since 2026"); after the heading "Registration" an unreviewed place or authority is refused; the true rows pass', [...ctxMiss, ...ctxOk].join(' | '));
      check(throws(() => claimGuard(pg(CTX4[0][0]), { claims, sell: true }, 'cities/valencia.json'), /cities\/valencia\.json: next to the company's Rome line, a sentence names another desk place \(Valencia\) and is not reviewed: "Also in Valencia, since 2026"/) === true
        && throws(() => claimGuard(pg('<p>Regis<span>tered</span> in Spain.</p>'), { claims, sell: true }, 'x'), /a registration or licence word is split by inline tags or comments/) === true,
        'the place and split refusals name the sentence and say what to do');
      // (h6) the lint: the eight claim entries verifier B saw accepted, and more
      const L4 = [['Registered with the Generalitat Valenciana for your peace of mind', 'tenant', /participle with no subject/], ['Registered with the Generalitat Valenciana, so your deposit is safe', 'lease', /participle with no subject/],
        ['Registration with the Generalitat Valenciana', 'heading', /nominal registration/], ['As a regulated agency in Valencia we check your lease', 'lease', /agency adjective/],
        ['BOOM, which is licensed in Spain, works only for you', 'tenant', /relative clause/], ['BOOM, which is licensed in Spain, works only for you', 'law', /first person/],
        ["Valencia requires agents to register in the regional agents' register, and you can check us there", 'law', /first person/],
        ['Egidi Immobiliare S.r.l., an Italian real estate agency registered in Valencia as well as Rome', 'company-rome', /does not land on Rome/],
        ['Egidi Immobiliare S.r.l., an Italian real estate agency registered in Valencia (Rome office)', 'company-rome', /does not land on Rome/],
        ['Egidi Immobiliare S.r.l., an Italian real estate agency registered in Rome and in the Valencian agents list', 'company-rome', /after Rome it names another place/],
        ['The desk is registered under Egidi Immobiliare S.r.l. in Rome', 'company-rome', /does not land on Rome/],
        ['BOOM, with its licensed partner, holds a carte professionnelle', 'partner', /another licence|carte professionnelle or §34c stands only|holds/],
        ['Also in Valencia, since 2026', 'context', /adds to the Rome line/], ['Egidi has an office in Valencia', 'context', /adds to the Rome line/], ['In Valencia, with the Generalitat', 'context', /review it under its own kind/],
        ['a registered Italian agency', 'law', /agency adjective .* with no verb/], ['a licensed agency in Valencia', 'law', /agency adjective .* with no verb/], ['an accredited Valencian agency', 'law', /agency adjective .* with no verb/],
        ['The deposit is lodged, and we are registered with the Generalitat', 'deposit', /company is the subject/], ['Our agency, which is approved by the Generalitat', 'deposit', /relative clause|first person|company is the subject/],
        ['The listed agency in Valencia is ours', 'listing', /agency adjective|first person/], ['The tenant checks the NVM listing', 'law', /names a register .*NVM/], ['A T.P.O. member', 'law', /names a register/]];
      const lintMiss = L4.filter(([text, kind, re]) => !lintRefuses({ text, kind }, re)).map(([t, k]) => `${k}: ${t}`);
      check(!lintMiss.length, `fourth round lint: the ${L4.length} claim entries (verifier B's eight, the strict Rome seat, the partner who holds, context continuations, the law label, first person in law/deposit/listing, named registers) are refused`, lintMiss.join(' | '));
      check(['Registered at the town hall with your new lease, before the health card', 'BRP: registration in the Dutch register of persons', 'Only pay a holding deposit to a registered letting agent', 'Egidi Immobiliare S.r.l. is registered under REA RM-1710623']
        .every((t, i) => !lintRefuses({ text: t, kind: ['tenant', 'tenant', 'law', 'company-rome'][i] }, /./)), 'fourth round lint: the tenant\'s own registration at the town hall, the BRP, advice about a registered letting agent and "registered under REA RM-1710623" pass');
      // (h2) the trusted-markup fields: only <b>, <strong>, <em>, <i>, <br>, <a href="…">
      for (const [bad, what] of [['<span>x</span>', 'a span'], ['<!-- x -->', 'a comment'], ["<a href='#'>x</a>", 'a single-quoted href'], ['<a href="#" title="Licensed">x</a>', 'a title attribute'], ['<img src="/x.png">', 'an img'],
        ['<abbr title="x">R</abbr>', 'an abbr'], ['<b data-x="y">x</b>', 'a data attribute'], ['<style>p{}</style>', 'a style'], ['<input value="x">', 'an input'], ['x < y', 'a stray <']]) {
        refuses((c) => { c.bref.rows[2].ddHtml += ` ${bad}`; }, /bref\.rows\[2\]\.ddHtml: trusted markup carries only <b>, <strong>, <em>, <i>, <br> and <a href="…">/, `the trusted markup of a desk refuses ${what}`, 'valencia');
      }
      check(throws(() => htmlFieldGuard({ rows: [{ ddHtml: 'Pay <b>once</b>, <strong>flat</strong>, <em>in</em> <i>writing</i><br><a href="/terms">terms</a>.' }] }, 'x'), /./) === 'did not throw' && throws(() => htmlFieldGuard({ brief: { rows: [{ ddHtml: '<span>x</span>' }] } }, 'cities/_hub.json'), /cities\/_hub\.json: brief\.rows\[0\]\.ddHtml/) === true,
        'the trusted markup allows exactly <b>, <strong>, <em>, <i>, <br>, <a href="…">, and the hub is held to it too');
      // the build: an entity or a zero-width character inside the word is refused through render()
      refuses((c) => { c.bref.rows[2].ddHtml += ' R&#101;gistered with the Generalitat Valenciana.'; }, /cities\/valencia\.json: 1 sentence\(s\) about registration or licences not reviewed.*"Registered with the Generalitat Valenciana" \(text\)/, 'build: "R&#101;gistered with the Generalitat Valenciana." in a fact-sheet row is refused (the entity no longer cuts the word)', 'valencia');
      refuses((c) => { c.faq.items[1].a += ' Regis\u200Btered with the Generalitat Valenciana.'; }, /cities\/valencia\.json: 1 sentence\(s\) about registration or licences not reviewed.*"Registered with the Generalitat Valenciana" \(text, ld\)/, 'build: a zero-width space inside "Registered" in the FAQ is refused', 'valencia');
      refuses((c) => { c.bref.rows.splice(1, 0, { dt: 'Registration', ddHtml: 'In Valencia, since 2026.' }); }, /next to the reviewed label \("Registration"\), a sentence is not reviewed and reads as its value \(it names a desk place, an authority, a number or a code, speaks for us, or says yes, since, number, file, list, active, valid, done, ✓…\): "In Valencia, since 2026"/, 'build: a fact-sheet row "Registration" followed by "In Valencia, since 2026." is refused (the label rule)', 'valencia');
      // verifier A's surfaces: "approved" with no other trigger word, in the JSON-LD only, in a check, in a meta description
      refuses((c) => { c.service.description += ' Approved by the Generalitat Valenciana as an agent.'; }, /not reviewed in cities\/_claims\.json: "Approved by the Generalitat Valenciana as an agent" \(ld\)/, 'build: "Approved by the Generalitat Valenciana as an agent." in the Service (JSON-LD only) is refused', 'valencia');
      refuses((c) => { c.checks.items[0].text += ' We are on the Generalitat list of agents.'; }, /not reviewed in cities\/_claims\.json: "We are on the Generalitat list of agents"/, 'build: "We are on the Generalitat list of agents." in a check with no reviewed label is refused (the authority is in the vocabulary)', 'valencia');
      refuses((c) => { c.meta.description = 'Apartment search for expats in Valencia, an approved agent: a Spanish-format file, applications as listings appear, viewings attended.'; }, /not reviewed in cities\/_claims\.json: "Apartment search for expats in Valencia, an approved agent: a Spanish-format file, applications as listings appear, viewings attended" \(meta/, 'build: "an approved agent" in the meta description is refused', 'valencia');
      // (h8) the served assets: no string of assets/boom-*.js and no CSS content string carries the vocabulary
      for (const f of fs.readdirSync(path.join(R, 'assets')).filter((x) => /^boom-[\w-]+\.(?:js|css)$/.test(x))) {
        const src = read(`assets/${f}`);
        const strs = f.endsWith('.js') ? [...src.matchAll(/"((?:[^"\\\n]|\\.)*)"|'((?:[^'\\\n]|\\.)*)'|`((?:[^`\\]|\\.)*)`/g)].map((x) => x[1] ?? x[2] ?? x[3]) : [...src.matchAll(/\bcontent\s*:\s*(?:"((?:[^"\\]|\\.)*)"|'((?:[^'\\]|\\.)*)')/g)].map((x) => x[1] ?? x[2]);
        const hit = strs.filter((x) => hasClaimVocab(x));
        check(strs.length > 0 && !hit.length, `assets/${f}: none of its ${strs.length} ${f.endsWith('.js') ? 'string literals' : 'content strings'} carries registration, licence or authority vocabulary`, hit.join(' | '));
      }
    }
    // ── fifth round (04/11/2026): the number shapes read whole, the splitter's belt, the value next to a reviewed label,
    //    the local words for a licence, a certificate or a membership ──
    {
      const desk = (slug, mut) => { const c = clone(CITY[slug]); mut(c); try { render(c); return 'built clean'; } catch (e) { return e instanceof BuildError ? e.message : `threw ${e.name}: ${e.message}`; } };
      const reEsc = (t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const pg5 = (b) => `<!DOCTYPE html><html><head><title>t</title></head><body><main>${b}</main></body></html>`;
      const why5 = (h, sell = true) => claimProblems(pg5(h), { claims, sell }).map((p) => p.why);
      // (F1a) the splitter never cuts after the abbreviation of a number; it still splits a sentence, and "S.r.l. is" stays one
      const at5 = (h) => reviewSentences(pg5(`<p>${h}</p>`)).filter((x) => x.where === 'text' && !x.cut && !x.ncut).map((x) => x.text);
      const runOn = 'n. 1234. Lic. no. 4471. Regd. 1234. Agent ref. CV-1234. Núm. 1234. Nr. 1234. REG. NO. 1234.';
      check(JSON.stringify(at5('Agent no. CV-1234.')) === '["Agent no. CV-1234"]' && JSON.stringify(at5('Reg. No. 12345.')) === '["Reg. No. 12345"]'
        && JSON.stringify(at5(runOn)) === '["n. 1234","Lic. no. 4471","Regd. 1234","Agent ref. CV-1234","Núm. 1234","Nr. 1234","REG. NO. 1234"]'
        && JSON.stringify(at5('We act as an agent. What we check is the lease.')) === '["We act as an agent","What we check is the lease"]'
        && JSON.stringify(at5('Egidi Immobiliare S.r.l. is an Italian real estate agency. Rome is its seat.')) === '["Egidi Immobiliare S.r.l. is an Italian real estate agency","Rome is its seat"]',
        'fifth round: the splitter keeps "Agent no. CV-1234", "Reg. No. 12345" and no./nr./n./núm./reg./regd./lic./ref. whole, still splits "as an agent. What…", and keeps "S.r.l. is…" in one sentence', `${JSON.stringify(at5('Agent no. CV-1234.'))} ${JSON.stringify(at5(runOn))}`);
      // (F1b) the number shapes, read whole, are unreviewed sentences: refused on a desk that sells in a FAQ answer, a check text and a fact-sheet row
      const F1 = ['Agent no. CV-1234.', 'Our agent no. CV-1234 is on every invoice.', 'Agent no. 4471 in Valencia.', 'Reg. No. 12345.', 'Reg. no. 123456.', 'Reg. 123456.', 'Regd. 1234.', 'Lic. No. 4567.', 'Lic. no. 4471.',
        'Agent ref. CV-1234.', 'Reg. no. CV-1234.', 'Reg. no. NL-88123.', 'Agent number CV 1234.', 'Número de agente 1234.'];
      for (const [where, mut] of [['a FAQ answer', (c, t) => { c.faq.items[1].a += ` ${t}`; }], ['a check text', (c, t) => { c.checks.items[0].text += ` ${t}`; }], ['a fact-sheet row (ddHtml, &nbsp; as an entity)', (c, t) => { c.bref.rows[2].ddHtml += ` ${t.replace(/ /g, '&nbsp;')}`; }]]) {
        const miss = F1.filter((t) => !new RegExp(`not reviewed in cities/_claims\\.json: "${reEsc(normSentence(t))}" \\(`).test(desk('valencia', (c) => mut(c, t))));
        check(!miss.length, `fifth round: the ${F1.length} number shapes ("Agent no. CV-1234", "Reg. No. 12345", "Regd. 1234", "Lic. no. 4471", "Agent ref. CV-1234", "Reg. no." with &nbsp;, "Agent number CV 1234", "Número de agente 1234") in ${where} on valencia are refused, each read whole as one unreviewed sentence`,
          miss.map((t) => `${t} → ${desk('valencia', (c) => mut(c, t)).slice(0, 180)}`).join(' | '));
      }
      {
        const F1x = ['Agency number CV-1234.', 'Agency ref. CV-1234.', 'Ref. 1234.', 'Registration ID: CV-1234.', 'Agent code CV-1234.', 'License #1234.', 'Agent N.º 1234.', 'Agent nr 1234.', 'Iscrizione n. 1234.', 'Numero di iscrizione 1234.'];
        const miss = F1x.filter((t) => !new RegExp(`not reviewed in cities/_claims\\.json: "${reEsc(normSentence(t))}" \\(`).test(desk('valencia', (c) => { c.faq.items[1].a += ` ${t}`; })));
        check(!miss.length, `fifth round: ${F1x.length} more number shapes (agency, ref., ID, code, #, N.º, nr, "Iscrizione n.", "Numero di iscrizione") in a FAQ answer on valencia are refused, each read whole`, miss.join(' | '));
      }
      check(['REA RM-1710623', 'L. 311/2004', 'DPR 131/86', 'RDL 29/2026', 'LAU art. 20', 'Llei 11/2025', '€500, £199 and €149', '1 Nov 2026', 'Nov 2026', 'Egidi Immobiliare S.r.l.', 'e.g. Funda and Pararius',
        'No. Full Search €500, Application Pack €199 and Attended Viewing €149 per viewing', 'no fee before 2026', 'within 30 days of signing', 'No more than 3 months', 'the agency fee €500', 'the agency fee is €149 per viewing', 'agency fee 10%'].every((t) => !hasClaimVocab(t)),
        'fifth round: the true copy stays clean: law references (L. 311/2004, DPR 131/86, RDL 29/2026, LAU art. 20), prices, dates ("Nov 2026" is not "no 2026"), REA RM-1710623, S.r.l., e.g., and "No. Full Search €500…" carry no number shape');
      // (F1c) the belt: a hit the splitter cuts (a dot the lookbehind does not know, a newline) refuses the whole string
      check(why5('<p>Agent. CV-1234 in Valencia.</p>').includes('cut') && claimProblems(pg5('<script type="application/ld+json">{"d":"Our agent\\n4471 in Valencia."}</script>'), { claims, sell: true }).some((p) => p.why === 'cut' && p.where === 'ld')
        && !why5('<p>Egidi Immobiliare S.r.l., registered in Rome. Hired by the tenant, paid by the tenant only.</p>').includes('cut'),
        'fifth round: the belt refuses a string whose whole text has a hit its sentences lost ("Agent. CV-1234", "agent\\n4471" in a JSON-LD string), and not a company line with S.r.l. (closed-up copies counted apart)');
      refuses((c) => { c.faq.items[1].a += ' Agent. CV-1234 in Valencia.'; }, /a registration or licence word, a register's initials or a number shape is split by the sentence splitter \(on the page it reads as one claim\): ".*Agent\. CV-1234 in Valencia" \(text/,
        'build: "Agent. CV-1234 in Valencia." in a FAQ answer is refused by the belt, naming the whole answer', 'valencia');
      // (F2) the value next to a reviewed label: reviewed, or neutral (no vocabulary, place, three digits or code, first person, yes/since/number/file/list…)
      const F2 = [
        ['valencia', 'a fact-sheet row "Registration" / "Yes, since 2026."', (c) => c.bref.rows.splice(1, 0, { dt: 'Registration', ddHtml: 'Yes, since 2026.' }), 'Registration', 'Yes, since 2026'],
        ['valencia', 'a fact-sheet row "Registration" / "CV-1234"', (c) => c.bref.rows.splice(1, 0, { dt: 'Registration', ddHtml: 'CV-1234' }), 'Registration', 'CV-1234'],
        ['valencia', 'a fact-sheet row "Generalitat" / "On its list of agents since 2026."', (c) => c.bref.rows.splice(1, 0, { dt: 'Generalitat', ddHtml: 'On its list of agents since 2026.' }), 'Generalitat', 'On its list of agents since 2026'],
        ['barcelona', 'a fact-sheet row "INCASÒL" / "Yes, our number is on file."', (c) => c.bref.rows.splice(1, 0, { dt: 'INCASÒL', ddHtml: 'Yes, our number is on file.' }), 'INCASÒL', 'Yes, our number is on file'],
        ['valencia', 'a check "Registration", at "Generalitat", "Our file number is CV-1234; ask us for it."', (c) => { Object.assign(c.checks.items[4], { title: 'Registration', at: 'Generalitat', text: 'Our file number is CV-1234; ask us for it.' }); }, 'Generalitat', 'Our file number is CV-1234'],
        ['valencia', 'a fact-sheet row "Registration" / "CV 1234 since 2025"', (c) => c.bref.rows.splice(1, 0, { dt: 'Registration', ddHtml: 'CV 1234 since 2025' }), 'Registration', 'CV 1234 since 2025'],
        ['barcelona', 'a check "Registration", at "INCASÒL", "Our agency file is number B-5521; we show it on request."', (c) => { Object.assign(c.checks.items[4], { title: 'Registration', at: 'INCASÒL', text: 'Our agency file is number B-5521; we show it on request.' }); }, 'INCASÒL', 'Our agency file is number B-5521'],
        ['madrid', 'a check "Registration" whose legal label (before the title) is "agency file 4471"', (c) => { Object.assign(c.checks.items[4], { title: 'Registration', at: 'agency file 4471' }); }, 'Registration', 'agency file 4471'],
        ['valencia', 'the deposit check (label "fianza · Generalitat") with "Our agency number there is V-5521."', (c) => { c.checks.items[1].text = 'Habitual lease: one month. Our agency number there is V-5521.'; }, 'Generalitat', 'Our agency number there is V-5521'],
        ['barcelona', 'a fact-sheet row "fianza · INCASÒL" / "Yes, our number is on file."', (c) => c.bref.rows.splice(1, 0, { dt: 'fianza · INCASÒL', ddHtml: 'Yes, our number is on file.' }), 'INCASÒL', 'Yes, our number is on file'],
        ['valencia', 'a fact-sheet row "Registration" / "At the town hall.<br>CV-1234" (a <br> is the same value)', (c) => c.bref.rows.splice(1, 0, { dt: 'Registration', ddHtml: 'At the town hall.<br>CV-1234' }), 'Registration', 'CV-1234'],
        ['valencia', 'a fact-sheet row "Registration" / "✓"', (c) => c.bref.rows.splice(1, 0, { dt: 'Registration', ddHtml: '✓' }), 'Registration', '✓'],
        ['valencia', 'a fact-sheet row "Registration" / "Active."', (c) => c.bref.rows.splice(1, 0, { dt: 'Registration', ddHtml: 'Active.' }), 'Registration', 'Active'],
        ['valencia', 'a fact-sheet row "Registration · Yes, since 2026" (the value inside the label)', (c) => c.bref.rows.splice(1, 0, { dt: 'Registration · Yes, since 2026', ddHtml: 'On request.' }), 'Registration', 'Yes, since 2026'],
        ['valencia', 'a FAQ answer with "Registration. Yes, since 2026." inside prose', (c) => { c.faq.items[1].a += ' Registration. Yes, since 2026.'; }, 'Registration', 'Yes, since 2026']];
      const f2miss = F2.filter(([s, , mut, label, value]) => !new RegExp(`next to the reviewed label \\([^)]*"${reEsc(label)}"[^)]*\\), a sentence is not reviewed and reads as its value .*"${reEsc(value)}" \\([^)]*text`).test(desk(s, mut)));
      check(!f2miss.length, `fifth round: the ${F2.length} values next to a reviewed label ("Registration", "Generalitat", "INCASÒL", "fianza · INCASÒL"; after it, before it as a check's legal label, after a <br>) are refused on their desk, naming the label and the value`,
        f2miss.map(([s, t, mut]) => `${s}: ${t} → ${desk(s, mut).slice(0, 200)}`).join(' | '));
      // since the seventh round "Registration · CV-1234" is itself a number shape across the middle dot (the keyword "registration", the
      // code): the splitter belt refuses it before the label rule
      check(/split by the sentence splitter \(on the page it reads as one claim\): "Registration · CV-1234" \(text\)/.test(desk('valencia', (c) => c.bref.rows.splice(1, 0, { dt: 'Registration · CV-1234', ddHtml: 'On request.' }))),
        'fifth round, as of the seventh: a fact-sheet row "Registration · CV-1234" (the code inside the label) is a number shape across the middle dot, refused by the splitter belt');
      {
        const m1 = desk('valencia', (c) => { c.faq.items[1].a += ' Registration. No. CV-1234.'; });
        check(hasClaimVocab('No. CV-1234') && /: "No\. CV-1234" \((?:ld, text|text, ld)\)/.test(m1) && !/"How do I avoid/.test(m1),
          'fifth round: "Registration. No. CV-1234." in a FAQ answer is refused, "No. CV-1234" read whole (a number shape, and the value of the key); the next question is not read as a value', m1.slice(0, 300));
        const m2 = desk('valencia', (c) => { c.service.description += ' Registration. Yes, since 2026.'; });
        check(/next to the reviewed label \("Registration"\), a sentence is not reviewed and reads as its value .*"Yes, since 2026" \(ld\)/.test(m2),
          'fifth round: "Registration. Yes, since 2026." in the Service description (JSON-LD only) is refused: inside a string the sentence after a key is its value', m2.slice(0, 300));
        const m3 = desk('valencia', (c) => { c.service.description += ' Registration. CV-1234.'; });
        check(/split by the sentence splitter .*Registration\. CV-1234\. .*" \(ld\)/.test(m3), 'fifth round: "Registration. CV-1234." in the Service description is refused by the belt ("registration" + a code read across the dot)', m3.slice(0, 300));
      }
      // the label rule's scope: inside a table only a <th> is a label; the build's codes (span.tn) are skipped; the block before is read only when it is a label
      check(!why5('<table><tr><th>Deposit</th><td>fianza · INCASÒL</td><td>since 2024</td><td>art. 11 L. 392/1978</td></tr></table>').length
        && why5('<table><tr><th>Registration</th><td>CV-1234</td></tr></table>').includes('label')
        && !why5('<ol><li><span class="tn">MIL 08</span> <span class="tt">University enrolment, for students</span></li><li><span class="tn">MIL 09</span> <span class="tt">Payslips</span></li></ol>').length
        && why5('<details><summary><span class="ln">05</span> <span class="at">agency file 4471</span> <span class="t">Registration</span></summary><p>Your lease needs the full address.</p></details>').includes('label')
        && !why5('<p>We check the lease and the address with the town hall before you sign it, every time.</p><dl><dt>Registration</dt><dd>padrón · NIE</dd></dl>').length,
        'fifth round: the label rule\'s scope — a table cell is the value of its row head (never a label of its own), a <th> is a label, the paper codes (MIL 08) are skipped, the block before a label is read when it is a label too ("agency file 4471"), not when it is prose');
      check(['padrón', 'NIE', 'BRP', 'Right to Rent', 'The deposit', 'Your lease needs the full address, cadastral reference and both signatures, or the town hall refuses it', '05', 'Opening', 'Agenzia delle Entrate'].every(neutralValue)
        && !['Yes, since 2026', 'CV-1234', 'CV 1234 since 2025', 'B 5521', 'agency file 4471', 'On its list of agents since 2026', 'Yes, our number is on file', 'In Valencia', 'In Wales', 'We hold one', 'Our file',
          'Active', 'Valid until March', '✓', 'Sí', 'Ja', 'Desde 2024', 'Dal 2024', 'Seit 2024', 'Depuis 2024', 'Nummer 12', 'Número 12', 'Lista', 'On its listing', 'On record', 'In the directory', 'On the roster'].some(neutralValue),
        'fifth round: a value is neutral with no vocabulary, desk place, three digits or code, first person, nor yes/since/number/file/list/listing/record/directory/roster/active/valid/✓ in the desk languages');
      // kind follower: the true values next to a label, each needed by a built page, linted
      const followers = claims.allowed.filter((e) => e.kind === 'follower');
      const notNeeded = followers.filter((f) => { const less = { ...claims, allowed: claims.allowed.filter((e) => e !== f) }; return ![...SLUGS.map((x) => [x, PAGE[x]]), ['desks', hubHtml]].some(([x, h]) => claimProblems(h, { claims: less, sell: SELLERS.includes(x) }).some((p) => p.why === 'label' && p.text === f.text)); });
      check(followers.length === 6 && !notNeeded.length, `fifth round: the ${followers.length} followers of ${CLAIMS_FILE} ("We confirm it before you sign", "we ask for the receipt", "The rest we go through on the free call"…) are each the value of a reviewed label on a built page (remove one and that page is refused)`, notNeeded.map((e) => e.text).join(' | '));
      check([['Yes, since 2026', /kind follower/], ['In Valencia', /kind follower names a desk place/], ['CV-1234', /kind follower carries a number of three digits or a code/], ['We hold one', /never says that we hold/], ['We are on it', /never says that we hold/],
        ['On its list of agents', /kind follower says "list"/], ['Registered with us', /kind follower carries a registration/], ['Done', /kind follower says "Done"/]].every(([text, re]) => lintRefuses({ text, kind: 'follower' }, re))
        && !lintRefuses({ text: 'We read it with you before you sign', kind: 'follower' }, /./),
        'fifth round lint: a follower may speak for us ("We read it with you before you sign"), nothing else of a value: no vocabulary, desk place, number or code, yes/since/file/list/done, nor "we hold / we are on"');
      // (F3) the vocabulary: the local words for a licence, a certificate, a sworn or affiliated agent, and the approval synonyms
      const F3 = [['amsterdam', 'Makelaar met vergunning.'], ['amsterdam', 'Gecertificeerd makelaar in Amsterdam.'], ['amsterdam', 'SCVM-gecertificeerd.'], ['amsterdam', 'Aangesloten bij de vereniging van makelaars.'], ['amsterdam', 'Beëdigd makelaar.'],
        ['valencia', 'Somos una agencia homologada en Valencia.'], ['valencia', 'Agencia afiliada a la asociación de agentes de Valencia.'], ['madrid', 'Agencia asociada al colegio de agentes.'], ['valencia', 'Con permiso municipal para operar.'],
        ['barcelona', 'Agència associada al Col·legi d’Agents de Barcelona.'], ['milan', 'Agenzia certificata a Milano.'], ['milan', "Agenzia associata all'associazione agenti immobiliari di Milano."], ['milan', 'Agente con patentino a Milano.'],
        ['milan', 'Socio Fimaa Milano.'], ['milan', 'With Fimaa Milano since 2024.'], ['valencia', 'BOOM is permitted to broker leases in Valencia.'], ['valencia', 'BOOM is entitled to work as an agent in Spain.'],
        ['valencia', 'Endorsed by the Valencia city council.'], ['valencia', 'Vetted by the Valencian consumer office.'], ['london', 'Endorsed by the London Assembly.'], ['london', 'TrustMark letting agent.'],
        ['london', 'We are signed up to an independent complaints scheme for letting agents.'], ['london', 'Our agents are qualified under English law.'], ['paris', 'Agence certifiée à Paris.'], ['paris', 'Affiliée à la FNAIM.'], ['paris', 'Adhérent FNAIM.'],
        ['berlin', 'Zertifizierter Makler in Berlin.'], ['berlin', 'IHK-geprüfter Makler.']];
      const f3miss = F3.filter(([s, t]) => !/not reviewed in cities\/_claims\.json|names a register or a licence it does not hold/.test(desk(s, (c) => { c.faq.items[1].a += ` ${t}`; })));
      check(!f3miss.length, `fifth round: the ${F3.length} local-language and synonym claims (vergunning, gecertificeerd, aangesloten, beëdigd; homologada, afiliada, asociada, associada, permiso; certificata, associata, patentino, Fimaa; permitted, entitled, endorsed, vetted, TrustMark, complaints scheme, qualified under; certifiée, affiliée, adhérent, FNAIM; zertifiziert, IHK) are refused on their desk (the six that sell, the Paris and Berlin drafts)`,
        f3miss.map(([s, t]) => `${s}: ${t}`).join(' | '));
      check(/names a register or a licence it does not hold \(Fimaa\)/.test(desk('milan', (c) => { c.faq.items[1].a += ' Socio Fimaa Milano.'; })) && ['IHK', 'FNAIM', 'IVD', 'Fimaa', 'fiaip', 'Aicat', 'raicv'].every((t) => sellHit(`${t} member`)),
        'fifth round: on a desk that sells, "Fimaa" (any case, as a word), IHK, FNAIM and IVD are names it cannot ship, reviewed or not');
      {
        const hub = JSON.parse(read('cities/_hub.json')); hub.rules.note += ' Our desks are homologated.';
        const r = throws(() => renderHub({ template: read('cities/_hub.html'), shared, hub, cities: SLUGS.map((s) => clone(CITY[s])), assetVersion: { css: 'testcss000', desksCss: 'testdcss00', desksJs: 'testdjs000' }, frags, root: R, weigh: false }), /cities\/_hub\.json: 1 sentence\(s\) about registration or licences not reviewed.*"Our desks are homologated"/);
        check(r === true, 'fifth round: "Our desks are homologated." in the hub\'s rules note is refused on /desks', r);
      }
      check(['erkenning', 'toelating', 'Zulassung', 'Genehmigung', 'convenzionata', 'permís', 'omologata', 'qualified as an agent', 'endorsement', 'gecertificeerde', 'certifié', 'IVD-Makler', 'FIAIP-affiliated', 'iscritta all\'albo', 'Iscrizione al REA', 'Eintragung', 'inschrijving', 'immatriculée'].every(hasClaimVocab)
        && !['associated', 'associate', 'agreement', 'energy certificate', 'allowed', 'qualified', 'qualify', 'Nov 2026', 'permission', 'Our association'].some(hasClaimVocab),
        'fifth round: erkenning, toelating, Zulassung, Genehmigung, convenzionata, permís, omologata, "qualified as", albo, iscrizione, Eintragung, inschrijving, immatriculée are vocabulary; "associated", "associate", "agreement", "energy certificate", "allowed", a bare "qualified" are not');
      check(['Wales', 'Welsh', 'Scotland', 'Scottish'].every((t) => PLACE_RE.test(t)) && why5('<dl><dt>Who</dt><dd>Egidi Immobiliare S.r.l. is an Italian real estate agency, registered in Rome. Also in Wales.</dd></dl>').includes('place')
        && ['PRS', 'FNAIM', 'IVD', 'IHK'].every((n) => lintRefuses({ text: `The tenant checks the ${n} register`, kind: 'law' }, new RegExp(`names a register or a scheme no desk holds \\(${n}\\)`))),
        'fifth round: Wales, Welsh, Scotland, Scottish are desk places (the place rule); an entry naming PRS, FNAIM, IVD or IHK is refused by the lint');
    }
    // ── sixth round (04/11/2026, the last): the belt ACROSS blocks (a number shape, a registration word or a register's
    //    initials split between a label and its value), two reviewed short labels that compose, a label that asks who, and
    //    the number shapes' precision (the code's letters upper case; amounts, measures and years after in/since not codes) ──
    {
      const desk = (slug, mut) => { const c = clone(CITY[slug]); mut(c); try { render(c); return 'built clean'; } catch (e) { return e instanceof BuildError ? e.message : `threw ${e.name}: ${e.message}`; } };
      const reEsc = (t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const pg6 = (b) => `<!DOCTYPE html><html><head><title>t</title></head><body><main>${b}</main></body></html>`;
      const why6 = (h, sell = true) => claimProblems(pg6(h), { claims, sell }).map((p) => p.why);
      const row = (dt, dd, at) => (c) => { c.bref.rows.splice(at, 0, { dt, ddHtml: dd }); };
      const XCUT = 'split between a label and its value \\(on the page they read as one claim\\): ';
      const PAIR = /another reviewed label of four words or fewer, or a label that asks who or what status, reads as its value — two labels make a claim neither was reviewed for/;
      // (G1) the fifth round's verifier built these clean: a number shape split between a fact-sheet row's label and its value,
      // on the six desks that sell (at several rows, Valencia's first row included) and on the two drafts
      const G1 = [['valencia', 0, 'Agent no.', 'CV-1234'], ['valencia', 2, 'Agent no.', 'CV-1234'], ['valencia', 6, 'Agent no.', 'CV-1234.'], ['valencia', 2, 'Reg. no.', '123456'], ['valencia', 6, 'Reg. no.', '123456'],
        ['valencia', 2, 'Agency number', 'CV 1234'], ['valencia', 6, 'Agent ref.', 'CV-1234'], ['valencia', 2, 'Número de agente', '1234'], ['valencia', 6, 'No.', 'CV-1234'], ['valencia', 2, 'Agent ID', 'CV-1234'],
        ['valencia', 6, 'Agent', 'CV-1234'], ['valencia', 2, 'Agent', 'CV-1234'], ['madrid', 6, 'Agent no.', 'M-4471'], ['london', 6, 'Agent no.', '4471'], ['amsterdam', 6, 'No.', '12345678'], ['milan', 6, 'Reg. no.', 'MI-123456'],
        ['barcelona', 6, 'Agent no.', 'B-5521'], ['barcelona', 2, 'Número de agente', '5521'], ['berlin', 2, 'Agent no.', 'CV-1234'], ['paris', 5, 'No.', '12345']];
      const g1miss = G1.filter(([s, at, dt, dd]) => !new RegExp(`${XCUT}.*"${reEsc(normSentence(`${dt} ${dd}`))}" \\(text\\)`).test(desk(s, row(dt, dd, at))));
      check(!g1miss.length, `sixth round: the ${G1.length} fact-sheet rows that split a number shape between the label and its value ({dt "Agent no.", dd "CV-1234"}, "Reg. no." | "123456", "Agency number" | "CV 1234", "Agent ref.", "Número de agente" | "1234", "No." | "12345678", "Agent ID", "Agent" | "CV-1234") are refused on the six desks that sell and on the two drafts, the join quoted`,
        g1miss.map(([s, at, dt, dd]) => `${s}@${at} ${dt}|${dd} → ${desk(s, row(dt, dd, at)).slice(0, 160)}`).join(' | '));
      // a <br> or a newline inside one value, a check's legal label and title, a FAQ question and its answer
      const G1b = [
        ['valencia', 'a fact-sheet value "… Agent no.<br>CV-1234."', (c) => { c.bref.rows[4].ddHtml += ' Agent no.<br>CV-1234.'; }, 'Agent no. CV-1234'],
        ['valencia', 'a fact-sheet value "… Reg.<br>123456."', (c) => { c.bref.rows[4].ddHtml += ' Reg.<br>123456.'; }, 'Reg. 123456'],
        ['valencia', 'a fact-sheet value "… Our agent\\n4471 handles it."', (c) => { c.bref.rows[4].ddHtml += ' Our agent\n4471 handles it.'; }, 'Our agent 4471 handles it'],
        ['madrid', 'a fact-sheet value whose long first line ends "… one agent" and whose next line is "4471, on every invoice."', (c) => { c.bref.rows[4].ddHtml += ' Every file of yours goes to one agent\n4471, on every invoice.'; }, 'one agent 4471, on every invoice'],
        ['valencia', 'a check whose legal label is "Agent no." and whose title is "CV-1234"', (c) => { Object.assign(c.checks.items[4], { at: 'Agent no.', title: 'CV-1234' }); }, 'Agent no. CV-1234'],
        ['valencia', 'a FAQ item "What is your agent number in Valencia?" / "CV-1234."', (c) => { c.faq.items.splice(3, 0, { q: 'What is your agent number in Valencia?', a: 'CV-1234.' }); }, 'What is your agent number in Valencia? CV-1234'],
        ['london', 'a FAQ item "Your agent number?" / "4471."', (c) => { c.faq.items.splice(2, 0, { q: 'Your agent number?', a: '4471.' }); }, 'Your agent number? 4471'],
        ['valencia', 'a fact-sheet row "Agent number in Valencia" / "CV-1234" (a number key, the code apart)', row('Agent number in Valencia', 'CV-1234', 6), 'Agent number in Valencia CV-1234']];
      const g1bmiss = G1b.filter(([s, , mut, join]) => !new RegExp(`${XCUT}.*${reEsc(join)}" \\(text(?:, ld)?\\)`).test(desk(s, mut)));
      check(!g1bmiss.length, `sixth round: the ${G1b.length} splits inside one value (a <br>, a newline — whatever the first line's length), between a check's legal label and its title, and between a FAQ question and its answer (a number key, "agent number", and a code) are refused, the join quoted`,
        g1bmiss.map(([s, t, mut]) => `${s}: ${t} → ${desk(s, mut).slice(0, 200)}`).join(' | '));
      // the register's initials split between a label and its value: a ban on a desk that sells, the belt on /desks
      check(/names a register or a licence it does not hold \(RAICV\): "R A I C V"/.test(desk('valencia', row('R A I', 'C V', 2))) && why6('<dl><dt>R A I</dt><dd>C V</dd></dl>', false).includes('xcut'),
        'sixth round: "R A I" | "C V" (the initials split between a label and its value) is refused on a desk that sells (RAICV, closed up across the two) and by the belt across blocks on a draft');
      {
        const hub = JSON.parse(read('cities/_hub.json')); hub.brief.rows[0] = { dt: 'R A I', dd: 'C V' };
        const r = throws(() => renderHub({ template: read('cities/_hub.html'), shared, hub, cities: SLUGS.map((s) => clone(CITY[s])), assetVersion: { css: 'testcss000', desksCss: 'testdcss00', desksJs: 'testdjs000' }, frags, root: R, weigh: false }), /cities\/_hub\.json: a registration or licence word, a register's initials or a number shape is split between a label and its value .*"R A I C V" \(text\)/);
        check(r === true, 'sixth round: on /desks a fact-sheet row "R A I" | "C V" is refused by the belt across blocks', r);
        const r2 = ['Registration|Generalitat', 'Generalitat|Registration', 'Who|A licensed partner'].map((x) => { const [dt, dd] = x.split('|'); const h = JSON.parse(read('cities/_hub.json')); h.brief.rows[0] = { dt, dd }; return throws(() => renderHub({ template: read('cities/_hub.html'), shared, hub: h, cities: SLUGS.map((s) => clone(CITY[s])), assetVersion: { css: 'testcss000', desksCss: 'testdcss00', desksJs: 'testdjs000' }, frags, root: R, weigh: false }), /cities\/_hub\.json: next to the reviewed label/); });
        check(r2.every((x) => x === true), 'sixth round: on /desks a fact-sheet row "Registration" | "Generalitat", "Generalitat" | "Registration" or "Who" | "A licensed partner" is refused next to its reviewed label', r2.join(' | '));
      }
      // the belt across blocks on the nine built pages: every join read, none refused (prices, dates, the Rome company line
      // with VAT IT17322991005 and REA RM-1710623 under "Operated by", the Who rows, the papers' codes, the hours)
      {
        let n = 0; const fired = [], kinds = {};
        for (const [x, h] of [...SLUGS.map((y) => [y, PAGE[y]]), ['desks', hubHtml]]) {
          const joins = []; reviewSentences(h, { joins });
          for (const j of joins) { n++; kinds[j.how] = (kinds[j.how] || 0) + 1; if (j.cut) fired.push(`${x}: ${j.parts.join(' | ')}`); }
        }
        check(n > 1000 && kinds.label > 0 && kinds.line > 0 && kinds.summary > 0 && !fired.length, `sixth round: on the nine built pages the belt across blocks reads ${n} joins (${Object.entries(kinds).map(([k, v]) => `${k} ${v}`).join(', ')}) and refuses none`, fired.join(' | '));
        check(['Who', 'Operated by', 'Egidi Immobiliare S.r.l.', 'Passport or EU ID', 'Email or WhatsApp number', 'Valentino Egidi tenant-side agent'].every((l) => !joinCut([l, 'VAT IT17322991005, REA RM-1710623, 00186 Roma, AMS 02, Mon–Fri 09:00–19:00']))
          && joinCut(['Agent no.', 'CV-1234']) === 'hits' && joinCut(['What is your agent number in Valencia?', 'CV-1234.']) === 'number' && joinCut(['ID', 'CV-1234']) === 'number' && !joinCut(['Agent number', 'Since 2026, €500 and 2,500 m² of flats']),
          'sixth round: joinCut — a label that is no number key (Who, Operated by, the company, "EU ID", "WhatsApp number", the hours) never makes a value\'s code a claim; "Agent no." | "CV-1234" is a hit, a number key and a code apart is a split; a year, a price, a measure are no code');
      }
      // (G2) two reviewed short labels compose a claim; a label that asks who makes the key its answer
      const G2 = [
        ['valencia', 'a fact-sheet row "Registration" / "Generalitat"', row('Registration', 'Generalitat', 6)],
        ['barcelona', 'a fact-sheet row "Registration" / "INCASÒL"', row('Registration', 'INCASÒL', 6)],
        ['berlin', 'a fact-sheet row "Registration" / "§34c GewO" (draft)', row('Registration', '§34c GewO', 5)],
        ['valencia', 'a fact-sheet row "Generalitat" / "Registration"', row('Generalitat', 'Registration', 6)],
        ['valencia', 'a fact-sheet row "Registration" / "Generalitat. We confirm it in writing before you sign." (row 2)', row('Registration', 'Generalitat. We confirm it in writing before you sign.', 2)],
        ['valencia', 'a fact-sheet row "Registration" / "Generalitat. We confirm it in writing before you sign." (row 6)', row('Registration', 'Generalitat. We confirm it in writing before you sign.', 6)],
        ['valencia', 'a fact-sheet row "Registration" / "Generalitat. We confirm it in writing before you sign." (last row)', row('Registration', 'Generalitat. We confirm it in writing before you sign.', 99)],
        ['valencia', 'a check "Registration" (legal label) / "Generalitat" (title) / "The details are on request."', (c) => { Object.assign(c.checks.items[4], { at: 'Registration', title: 'Generalitat', text: 'The details are on request.' }); }],
        ['valencia', 'a check "Generalitat" / "Registration" / "The details are on request."', (c) => { Object.assign(c.checks.items[4], { at: 'Generalitat', title: 'Registration', text: 'The details are on request.' }); }],
        ['valencia', 'a check "Generalitat" / "Registration" / "Ask the landlord for the receipt."', (c) => { Object.assign(c.checks.items[4], { at: 'Generalitat', title: 'Registration', text: 'Ask the landlord for the receipt.' }); }],
        ['barcelona', 'a check "Registration" / "INCASÒL" / "The details are on request."', (c) => { Object.assign(c.checks.items[4], { at: 'Registration', title: 'INCASÒL', text: 'The details are on request.' }); }],
        ['berlin', 'a check "Registration" / "§34c GewO" / "The details are on request." (draft)', (c) => { Object.assign(c.checks.items[3], { at: 'Registration', title: '§34c GewO', text: 'The details are on request.' }); }],
        ['valencia', 'a FAQ answer ending "Registration. Generalitat."', (c) => { c.faq.items[2].a += ' Registration. Generalitat.'; }],
        ['berlin', 'a fact-sheet row "Who" / "A licensed partner" (draft)', row('Who', 'A licensed partner', 5)],
        ['paris', 'a fact-sheet row "Status" / "A licensed partner" (draft)', row('Status', 'A licensed partner', 5)]];
      const g2miss = G2.filter(([s, , mut]) => !PAIR.test(desk(s, mut)));
      check(!g2miss.length, `sixth round: the ${G2.length} compositions of two reviewed short labels ("Registration" — "Generalitat", "INCASÒL", "§34c GewO", either way round, in a fact-sheet row, a check, a FAQ answer) and the drafts' "Who" / "Status" — "A licensed partner" are refused on their desk`,
        g2miss.map(([s, t, mut]) => `${s}: ${t} → ${desk(s, mut).slice(0, 200)}`).join(' | '));
      check(why6('<dl><dt>Registration · Generalitat</dt><dd>On request.</dd></dl>').filter((w) => w === 'pair').length === 2 && why6('<dl><dt>Registration</dt><dd>Generalitat</dd></dl>').includes('pair')
        && why6('<dl><dt>Who</dt><dd>A licensed partner</dd></dl>', false).includes('pair') && why6('<dl><dt>Operated by</dt><dd>Generalitat</dd></dl>').includes('pair')
        && !why6('<ol><li><span class="s" data-instr>Opening</span> <span class="w"><b class="dh">A licensed partner</b> <span class="dp">We open with a licensed partner, not around the rule.</span></span></li></ol>', false).length
        && !why6('<dl><dt>Registration</dt><dd>We confirm it before you sign.</dd></dl>').length
        && !why6('<details><summary><span class="at" data-instr>fianza · Generalitat</span> <span class="t">The deposit</span></summary><p>Habitual lease: one month. The landlord lodges it with the Generalitat Valenciana; we ask for the deposit receipt.</p></details>').length,
        'sixth round: two reviewed short labels in one block are each refused ("Registration · Generalitat"), and so is one as the value of another or of "Who" / "Operated by"; the drafts\' how step ("Opening" — "A licensed partner"), a follower value and the true deposit check pass');
      // (G3) the number shapes' precision: the code's letters upper case, no amount, measure or year after in/since
      // the lead's four, then two that only the upper-case rule protects (no amount, no measure, no year after them)
      const G3 = ['Find your agent in 2026.', 'An agency 100% on your side.', 'Hire an agent for 300 euros.', 'The agency fee 300 € is paid by the landlord.', 'The agency has 1200 homes.', 'Your agent saw 300 flats in a week.'];
      const g3bad = G3.flatMap((t) => [['a FAQ answer', (c) => { c.faq.items[1].a += ` ${t}`; }], ['a check text', (c) => { c.checks.items[0].text += ` ${t}`; }]].map(([w, mut]) => [t, w, desk('valencia', mut)])).filter(([, , r]) => r !== 'built clean');
      check(!g3bad.length && G3.every((t) => !hasClaimVocab(t)) && ['AGENT IN 2026', 'Agency since 2019, on your side', 'Agency 2500 EUR', 'The agency is 1500 metres away', 'An agent 100 percent on your side', 'agency fee 10%'].every((t) => !hasClaimVocab(t)),
        `sixth round: "${G3.join('", "')}" build clean in a FAQ answer and a check text on valencia (with the i flag the code's letters took "in", "for", "fee", "has", "saw"), and no amount, measure or year after in/since reads as a code`,
        g3bad.map(([t, w, r]) => `${t} in ${w}: ${r.slice(0, 160)}`).join(' | '));
      check(['Our agent number is 1234.', 'Our agent no. is CV-1234.', 'Agent no. cv-1234.', 'Agent N. 1234.'].every((t) => new RegExp(`not reviewed in cities/_claims\\.json: "${reEsc(normSentence(t))}" \\(`).test(desk('valencia', (c) => { c.faq.items[1].a += ` ${t}`; })))
        && JSON.stringify(reviewSentences(pg6('<p>Agent N. 1234. Iscrizione N. 5678.</p>')).filter((x) => x.where === 'text' && !x.cut && !x.ncut).map((x) => x.text)) === '["Agent N. 1234","Iscrizione N. 5678"]',
        'sixth round: the copula ("Our agent number is 1234", "Our agent no. is CV-1234") and a lower-case code joined to its digits ("cv-1234") are number shapes; "Agent N. 1234" stays one sentence (an upper-case "N." is a number abbreviation), refused as unreviewed');
    }
    // ── seventh round (04/11/2026): the number key and its code wherever they stand — a label of any length with its value, in
    //    either order, on any line of a block, across the house separators, anywhere in one string, on every line of a FAQ
    //    answer, and across a page's title and its description or a JSON-LD node's name and its description ──
    {
      const desk = (slug, mut) => { const c = clone(CITY[slug]); mut(c); try { render(c); return 'built clean'; } catch (e) { return e instanceof BuildError ? e.message : `threw ${e.name}: ${e.message}`; } };
      const reEsc = (t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const pg7 = (b) => `<!DOCTYPE html><html><head><title>t</title></head><body><main>${b}</main></body></html>`;
      const why7 = (h, sell = true) => claimProblems(pg7(h), { claims, sell }).map((p) => p.why);
      const row = (dt, dd, at) => (c) => { c.bref.rows.splice(at, 0, { dt, ddHtml: dd }); };
      const XCUT = 'split between a label and its value \\(on the page they read as one claim\\): ';
      const NCUT = 'stand in one block or string \\(on the page the code reads as that number\\): ';
      const UNREV = 'not reviewed in cities/_claims\\.json: ';
      const refused = (msg, list) => list.filter(([s, , mut, quote, at]) => !new RegExp(`${msg}.*${reEsc(quote)}${at ? `[^"]*" \\(${at}` : ''}`).test(desk(s, mut)));
      const say = (miss, list) => miss.map(([s, t, mut]) => `${s}: ${t} → ${desk(s, mut).slice(0, 220)}`).join(' | ');
      // (P1) a number key in a label of five words or more: a fact-sheet row on the six desks that sell and on both drafts, a how step's heading
      const P1 = [
        ['valencia', 'row 2 "Our agent number in Valencia" / "CV-1234."', row('Our agent number in Valencia', 'CV-1234.', 2), '"Our agent number in Valencia CV-1234" (text'],
        ['valencia', 'row 6 "Our agent number in Valencia" / "CV-1234."', row('Our agent number in Valencia', 'CV-1234.', 6), '"Our agent number in Valencia CV-1234" (text'],
        ['valencia', 'row 6 "Agent number of our Valencia desk" / "CV-1234"', row('Agent number of our Valencia desk', 'CV-1234', 6), '"Agent number of our Valencia desk CV-1234" (text'],
        ['madrid', 'row 6 "Our agent number in Madrid" / "M-4471."', row('Our agent number in Madrid', 'M-4471.', 6), '"Our agent number in Madrid M-4471" (text'],
        ['london', 'row 6 "Our agency number in England" / "4471."', row('Our agency number in England', '4471.', 6), '"Our agency number in England 4471" (text'],
        ['milan', 'row 6 "Our agent number in Milan" / "MI-123456."', row('Our agent number in Milan', 'MI-123456.', 6), '"Our agent number in Milan MI-123456" (text'],
        ['amsterdam', 'row 6 "Our agent number in Amsterdam" / "12345678."', row('Our agent number in Amsterdam', '12345678.', 6), '"Our agent number in Amsterdam 12345678" (text'],
        ['barcelona', 'row 6 "Our agent number in Barcelona" / "B-5521."', row('Our agent number in Barcelona', 'B-5521.', 6), '"Our agent number in Barcelona B-5521" (text'],
        ['berlin', 'row 5 "Our agent number in Berlin" / "B-4471." (draft)', row('Our agent number in Berlin', 'B-4471.', 5), '"Our agent number in Berlin B-4471" (text'],
        ['paris', 'row 5 "Our agent number in Paris" / "P-4471." (draft)', row('Our agent number in Paris', 'P-4471.', 5), '"Our agent number in Paris P-4471" (text'],
        ['valencia', 'a how step headed "Our agent number in Spain" whose text is "CV-1234, on every letter we send."', (c) => { Object.assign(c.how.steps[1], { h: 'Our agent number in Spain', p: 'CV-1234, on every letter we send.' }); }, '"Our agent number in Spain CV-1234, on every letter we send" (text'],
        ['madrid', 'a how step headed "Our agent number in Spain" whose text is "M-4471, on every letter we send."', (c) => { Object.assign(c.how.steps[1], { h: 'Our agent number in Spain', p: 'M-4471, on every letter we send.' }); }, '"Our agent number in Spain M-4471, on every letter we send" (text']];
      const p1miss = refused(XCUT, P1);
      check(!p1miss.length, `seventh round: the ${P1.length} labels of five words or more that carry a number key ("Our agent number in Valencia" / "CV-1234." on the six desks that sell and on both drafts, a how step's heading "Our agent number in Spain" / "CV-1234, …") are joined with their value and refused, the join quoted`, say(p1miss, P1));
      // (P3) the other way round: the code in the label, the number key in the value — short or long label, a row or a check
      const P3 = [
        ['valencia', 'row 2 "CV-1234" / "Our agent number in Valencia."', row('CV-1234', 'Our agent number in Valencia.', 2), '"CV-1234 Our agent number in Valencia" (text'],
        ['valencia', 'row 6 "CV-1234" / "Our agent number in Valencia."', row('CV-1234', 'Our agent number in Valencia.', 6), '"CV-1234 Our agent number in Valencia" (text'],
        ['madrid', 'row 6 "M-4471" / "Our agent number in Madrid."', row('M-4471', 'Our agent number in Madrid.', 6), '"M-4471 Our agent number in Madrid" (text'],
        ['berlin', 'row 5 "B-4471" / "Our agent number in Berlin." (draft)', row('B-4471', 'Our agent number in Berlin.', 5), '"B-4471 Our agent number in Berlin" (text'],
        ['valencia', 'a check whose legal label is "CV-1234" and whose title is "Our agent number"', (c) => { Object.assign(c.checks.items[4], { at: 'CV-1234', title: 'Our agent number', text: 'Shown on every letter we send.' }); }, '"CV-1234 Our agent number" (text'],
        ['valencia', 'row 6 "Printed on every letter we send: CV-1234" / "Our agent number in Valencia." (a long label)', row('Printed on every letter we send: CV-1234', 'Our agent number in Valencia.', 6), '"Printed on every letter we send: CV-1234 Our agent number in Valencia" (text']];
      const p3miss = refused(XCUT, P3);
      check(!p3miss.length, `seventh round: the ${P3.length} reversed splits (the code in the label, the number key in the value: "CV-1234" / "Our agent number in Valencia.", a check {at "CV-1234", title "Our agent number"}, a long label ending on the code) are refused on the desk page, the join quoted`, say(p3miss, P3));
      // (P4, and its siblings in a fact-sheet row) the code on a later line of the value's block: a FAQ answer with a newline, a value with a <br>
      const P4 = [
        ['valencia', 'a FAQ item "Do you have an agent number in Valencia?" / "Yes.⏎CV-1234."', (c) => { c.faq.items.splice(3, 0, { q: 'Do you have an agent number in Valencia?', a: 'Yes.\nCV-1234.' }); }, '"Do you have an agent number in Valencia? Yes. CV-1234" (text'],
        ['valencia', 'a FAQ item "What is your agent number in Valencia?" / "Ask us.⏎CV-1234."', (c) => { c.faq.items.splice(3, 0, { q: 'What is your agent number in Valencia?', a: 'Ask us.\nCV-1234.' }); }, '"What is your agent number in Valencia? Ask us. CV-1234" (text'],
        ['london', 'a FAQ item "Your agent number?" / "We print it on every letter.⏎4471."', (c) => { c.faq.items.splice(2, 0, { q: 'Your agent number?', a: 'We print it on every letter.\n4471.' }); }, '"Your agent number? We print it on every letter. 4471" (text'],
        ['valencia', 'a check titled "Our agent number" whose text is "Ask us.⏎CV-1234, on every letter."', (c) => { Object.assign(c.checks.items[4], { title: 'Our agent number', text: 'Ask us.\nCV-1234, on every letter.' }); }, 'Our agent number Ask us. CV-1234, on every letter" (text'],
        ['valencia', 'a check whose legal label is "Our agent number", titled "In Valencia", whose text is "Ask us.⏎CV-1234, on every letter." (only the summary reads the label with the answer\'s second line)', (c) => { Object.assign(c.checks.items[4], { at: 'Our agent number', title: 'In Valencia', text: 'Ask us.\nCV-1234, on every letter.' }); }, '"Our agent number In Valencia Ask us. CV-1234, on every letter" (text'],
        ['valencia', 'a fact-sheet row "Our agent number" / "In Valencia:<br>CV-1234."', row('Our agent number', 'In Valencia:<br>CV-1234.', 6), '"Our agent number In Valencia: CV-1234" (text'],
        ['madrid', 'a fact-sheet row "M-4471" / "On every letter.<br>Our agent number in Madrid."', row('M-4471', 'On every letter.<br>Our agent number in Madrid.', 6), '"M-4471 On every letter. Our agent number in Madrid" (text'],
        ['valencia', 'a fact-sheet value "Our agent number<br>in Valencia." before a row labelled "CV-1234"', (c) => { c.bref.rows.splice(6, 0, { dt: 'Ours', ddHtml: 'Our agent number<br>in Valencia.' }, { dt: 'CV-1234', ddHtml: 'On every letter.' }); }, '"Our agent number in Valencia. CV-1234" (text']];
      const p4miss = refused(XCUT, P4);
      check(!p4miss.length, `seventh round: the ${P4.length} codes on a later line of the value's block (a FAQ answer "Yes.⏎CV-1234.", a check's text, a fact-sheet value "In Valencia:<br>CV-1234.", either order, the key on a first line) are joined with the question, the title or the label and refused`, say(p4miss, P4));
      // (P2) the house separators between the keyword and the code: the number shape is read whole, and the guard refuses it (unreviewed,
      // or the splitter belt for the spaced ·), on the six desks that sell and on a draft, wherever the string stands
      const GUARD = `(?:${UNREV}|split by the sentence splitter \\(on the page it reads as one claim\\): |${XCUT}|${NCUT})`;
      const P2 = [];
      for (const [city, code] of [['valencia', 'CV-1234'], ['madrid', 'M-4471'], ['london', '4471'], ['milan', 'MI-123456'], ['amsterdam', '12345678'], ['barcelona', 'B-5521']]) P2.push([city, `a fact-sheet value "… Agent no. — ${code}."`, (c) => { c.bref.rows[4].ddHtml += ` Agent no. — ${code}.`; }, `Agent no. — ${code}`]);
      // ('[' and '{' are a placeholder and a token in a desk's JSON, refused before the guard: they stay in the unit list SEPS)
      for (const [sep, close] of [[' – ', ''], [' · ', ''], [' • ', ''], [' / ', ''], [' | ', ''], [' (', ')'], [' “', '”'], [' "', '"'], [" '", "'"], [' ‘', '’'], [' «', '»'], ['-', ''], [': ', '']]) {
        const x = `Agent no.${sep}CV-1234${close}`;
        P2.push(['valencia', `a fact-sheet value "… ${x}."`, (c) => { c.bref.rows[4].ddHtml += ` ${x}.`; }, x]);
      }
      P2.push(
        ['valencia', 'the Who row, after the company\'s Rome line, "Agent number (CV-1234)."', (c) => { c.bref.rows[0].ddHtml += ' Agent number (CV-1234).'; }, 'Agent number (CV-1234)'],
        ['madrid', 'the Who row "… Agent number (M-4471)."', (c) => { c.bref.rows[0].ddHtml += ' Agent number (M-4471).'; }, 'Agent number (M-4471)'],
        ['london', 'the Who row "… Agency number — 4471."', (c) => { c.bref.rows[0].ddHtml += ' Agency number — 4471.'; }, 'Agency number — 4471'],
        ['valencia', 'a check\'s legal label "Agent no. · CV-1234"', (c) => { c.checks.items[3].at = 'Agent no. · CV-1234'; }, 'Agent no. · CV-1234'],
        ['madrid', 'a check\'s legal label "Agent no. · M-4471"', (c) => { c.checks.items[3].at = 'Agent no. · M-4471'; }, 'Agent no. · M-4471'],
        ['valencia', 'a check\'s legal label "Agent no. (CV-1234)"', (c) => { c.checks.items[3].at = 'Agent no. (CV-1234)'; }, 'Agent no. (CV-1234)'],
        ['valencia', 'a check\'s legal label "Agent number · CV-1234"', (c) => { c.checks.items[3].at = 'Agent number · CV-1234'; }, 'Agent number · CV-1234'],
        ['valencia', 'a check\'s legal label "Reg. no. · 123456"', (c) => { c.checks.items[3].at = 'Reg. no. · 123456'; }, 'Reg. no. · 123456'],
        ['valencia', 'a FAQ answer "… Our agent no. · CV-1234."', (c) => { c.faq.items[2].a += ' Our agent no. · CV-1234.'; }, 'Our agent no. · CV-1234'],
        ['valencia', 'a check text "… Our agency number (CV-1234) is on every letter."', (c) => { c.checks.items[3].text += ' Our agency number (CV-1234) is on every letter.'; }, 'Our agency number (CV-1234) is on every letter'],
        ['valencia', 'the footer statement "… Agent number (CV-1234)."', (c) => { c.footer.statement += ' Agent number (CV-1234).'; }, 'Agent number (CV-1234)'],
        ['valencia', 'meta.description "… Agent number (CV-1234)."', (c) => { c.meta.description += ' Agent number (CV-1234).'; }, 'Agent number (CV-1234)'],
        ['valencia', 'the Service description (JSON-LD) "… Agent no. · CV-1234."', (c) => { c.service.description += ' Agent no. · CV-1234.'; }, 'Agent no. · CV-1234'],
        ['paris', 'a fact-sheet value "… Agent no. · P-4471." (draft)', (c) => { c.bref.rows[4].ddHtml += ' Agent no. · P-4471.'; }, 'Agent no. · P-4471']);
      const p2miss = refused(GUARD, P2);
      check(!p2miss.length, `seventh round: the ${P2.length} number shapes across a house separator (—, –, ·, •, /, |, (, straight and curly quotes, «, -, a colon) are refused on the six desks that sell and on a draft, in a fact-sheet value, the Who row after the company's Rome line, a check's legal label or text, a FAQ answer, the footer, the meta description and the JSON-LD, the string quoted`, say(p2miss, P2));
      // (P2, the belt) a number key and a code in one string with no number shape at all — a word, a sentence or a comma between, or the
      // code first: no other rule reads them, the block-level check refuses them
      const P2n = [
        ['valencia', 'a FAQ answer "… Our agent number in Valencia — CV-1234."', (c) => { c.faq.items[2].a += ' Our agent number in Valencia — CV-1234.'; }, 'Our agent number in Valencia — CV-1234', 'text, ld'],
        ['valencia', 'a FAQ answer "… CV-1234 is our agent number in Valencia." (the code first)', (c) => { c.faq.items[2].a += ' CV-1234 is our agent number in Valencia.'; }, 'CV-1234 is our agent number in Valencia', 'text, ld'],
        ['valencia', 'a FAQ answer "… Our agent no. today is CV-1234." (a word between)', (c) => { c.faq.items[2].a += ' Our agent no. today is CV-1234.'; }, 'Our agent no. today is CV-1234', 'text, ld'],
        ['valencia', 'a FAQ answer "… Agent no. cv 1234." (lower-case letters spaced from the digits)', (c) => { c.faq.items[2].a += ' Agent no. cv 1234.'; }, 'Agent no. cv 1234', 'text, ld'],
        ['valencia', 'a fact-sheet value of two sentences "… Our agent number in Valencia. CV-1234."', (c) => { c.bref.rows[4].ddHtml += ' Our agent number in Valencia. CV-1234.'; }, 'Our agent number in Valencia. CV-1234', 'text'],
        ['madrid', 'a check text "… Our agency number, printed on every letter: M-4471."', (c) => { c.checks.items[3].text += ' Our agency number, printed on every letter: M-4471.'; }, 'Our agency number, printed on every letter: M-4471', 'text'],
        ['london', 'the Who row "… Our agency number is on every invoice — 4471."', (c) => { c.bref.rows[0].ddHtml += ' Our agency number is on every invoice — 4471.'; }, 'Our agency number is on every invoice — 4471', 'text'],
        ['valencia', 'the footer statement "… Our agent number in Valencia — CV-1234."', (c) => { c.footer.statement += ' Our agent number in Valencia — CV-1234.'; }, 'Our agent number in Valencia — CV-1234', 'text'],
        ['valencia', 'meta.description "… Our agent number in Valencia — CV-1234."', (c) => { c.meta.description += ' Our agent number in Valencia — CV-1234.'; }, 'Our agent number in Valencia — CV-1234', 'meta'],
        ['valencia', 'the Service description (JSON-LD) "… CV-1234 is our agent number."', (c) => { c.service.description += ' CV-1234 is our agent number.'; }, 'CV-1234 is our agent number', 'ld'],
        ['paris', 'a fact-sheet value "… Our agent number in Paris — P-4471." (draft)', (c) => { c.bref.rows[4].ddHtml += ' Our agent number in Paris — P-4471.'; }, 'Our agent number in Paris — P-4471', 'text'],
        ['valencia', 'a fact-sheet value "Our agent number<br>in Valencia<br>CV-1234." (the key and the code two lines apart in one block)', (c) => { c.bref.rows.splice(6, 0, { dt: 'Ours', ddHtml: 'Our agent number<br>in Valencia<br>CV-1234.' }); }, 'Our agent number in Valencia CV-1234', 'text'],
        ['milan', 'a fact-sheet value "CV-1234<br>printed on every letter<br>is our agent number." (the code first, two lines apart)', (c) => { c.bref.rows.splice(6, 0, { dt: 'Ours', ddHtml: 'MI-123456<br>printed on every letter<br>is our agent number.' }); }, 'MI-123456 printed on every letter is our agent number', 'text']];
      const p2nmiss = refused(NCUT, P2n);
      check(!p2nmiss.length, `seventh round: the ${P2n.length} blocks and strings with a number key and a code and no number shape (a word, a sentence, a comma or two <br> lines between, the code first) are refused by the block-level check on the desks that sell and on a draft, in a FAQ answer, a fact-sheet value, a check text, the Who row, the footer, the meta description and the JSON-LD`, say(p2nmiss, P2n));
      // the bridge itself: a separator between the keyword and the number word, where no number key is read
      const P2b = [['valencia', 'a FAQ answer "… Our agent — number CV-1234."', (c) => { c.faq.items[2].a += ' Our agent — number CV-1234.'; }, '"Our agent — number CV-1234" (text, ld'],
        ['valencia', 'a FAQ answer "… Agent: number CV-1234."', (c) => { c.faq.items[2].a += ' Agent: number CV-1234.'; }, '"Agent: number CV-1234" (text, ld']];
      const p2bmiss = refused(UNREV, P2b);
      check(!p2bmiss.length, 'seventh round: a number shape bridges the separators between its keyword and its number word too ("Our agent — number CV-1234", "Agent: number CV-1234"), refused as unreviewed', say(p2bmiss, P2b));
      const SEPS = ['Agent no. — CV-1234', 'Agent no. – CV-1234', 'Agent no. · CV-1234', 'Agent no. • CV-1234', 'Agent no. / CV-1234', 'Agent no. | CV-1234', 'Agent no. (CV-1234)', 'Agent no. [CV-1234]', 'Agent no. {CV-1234}', 'Agent no. “CV-1234”', 'Agent no. "CV-1234"', "Agent no. 'CV-1234'", 'Agent no. ‘CV-1234’', 'Agent no. «CV-1234»', 'Agent no.-CV-1234', 'Agent no.: CV-1234', 'Agent number (CV-1234)', 'Agency number — 4471', 'Reg. no. · 123456', 'Número de agente — 1234', 'Agent — number CV-1234', 'Agent: no. CV-1234'];
      const SEP_TRUE = ['Who pays the agent: no one but you.', 'An agency (100%) on your side.', 'Agent (since 2019).', 'Agent — since 2026.', 'Hire an agent (300 euros).', 'An agency (2,500 homes).', 'The agent — €500, flat.', 'Your agent · Mon–Fri 09:00–19:00.'];
      check(SEPS.every((t) => hasClaimVocab(t)) && SEP_TRUE.every((t) => !hasClaimVocab(t)),
        'seventh round: a number shape bridges the house separators between its keyword, its number word and its code (—, –, -, ·, •, /, |, an opening parenthesis, bracket or brace, straight and curly quotes, guillemets, the colon); an amount, a measure, a year after since, the hours or "no one" after a separator are no code',
        [...SEPS.filter((t) => !hasClaimVocab(t)), ...SEP_TRUE.filter(hasClaimVocab)].join(' | '));
      const KEYED = ['Our agent number in Valencia — CV-1234.', 'Our agency number (CV-1234) is on every letter.', 'CV-1234 is our agent number.', 'Our agent no. today is CV-1234.', 'Agent no. cv 1234.', 'Our agent number in Valencia. CV-1234.', 'Número de agente es 1234.', 'Registration ID: AB 4471.'];
      const UNKEYED = ['Yes. BOOM Milan is a desk of Egidi Immobiliare S.r.l., an Italian real estate agency registered in Rome (REA RM-1710623).', 'Operated by Egidi Immobiliare S.r.l. — VAT IT17322991005, REA RM-1710623, Viale Liegi 42, 00198 Roma.', 'Your agent number? We have none outside Rome.', 'Ask the agent for the agency number; the lease is registered within 30 days, in 2026.', 'Agent number questions: Mon–Fri 09:00–19:00.', 'WhatsApp +39 331 325 1961 · Email or WhatsApp number'];
      check(KEYED.every(numKeyCode) && !UNKEYED.some(numKeyCode), 'seventh round: numKeyCode — a number key and a code in one string, in either order and whatever stands between (a word, a sentence, a separator); the company lines with VAT IT17322991005 and REA RM-1710623, a key with no code, a year, the hours and a phone number are not one',
        [...KEYED.filter((t) => !numKeyCode(t)), ...UNKEYED.filter(numKeyCode)].join(' | '));
      check(why7('<p>Agent n<b>o.</b> in Valencia: CV-1234.</p>').includes('split') && why7('<p>Agent no. in Valencia — CV-1234.</p>').includes('ncut') && why7('<dl><dt>Our agent number in Valencia</dt><dd>CV-1234.</dd></dl>', false).includes('xcut')
        && why7('<dl><dt>CV-1234</dt><dd>Our agent number in Valencia.</dd></dl>', false).includes('xcut') && why7('<dl><dt>Our agent number</dt><dd>In Valencia:<br>CV-1234.</dd></dl>', false).includes('xcut')
        && why7('<details><summary>Do you have an agent number in Valencia?</summary><p>Yes.\nCV-1234.</p></details>', false).includes('xcut'),
        'seventh round: a number key made whole by removing inline tags is a split; the number key and the code in one string, a long label, the reversed order, a <br> in the value and a newline in a FAQ answer are refused on a draft too');
      // (P5) a page's title and its description, read together (a search snippet), and a JSON-LD node's name or serviceType with its description
      const P5 = [
        ['valencia', 'the <title> "… — BOOM agent no." and the meta description "CV-1234. …"', (c) => { c.meta.title = 'Valencia rental agent for expats — BOOM agent no.'; c.meta.description = `CV-1234. ${c.meta.description}`; }, '— BOOM agent no. CV-1234. Apartment search'],
        ['valencia', 'og:title "BOOM Valencia — agent no." and og:description "CV-1234. …"', (c) => { c.meta.ogTitle = 'BOOM Valencia — agent no.'; c.meta.ogDescription = `CV-1234. ${c.meta.ogDescription}`; }, 'BOOM Valencia — agent no. CV-1234. Tenant-side rental search'],
        ['valencia', 'the Service serviceType "Tenant-side rental search agent no." and its description "CV-1234. …"', (c) => { c.service.serviceType = 'Tenant-side rental search agent no.'; c.service.description = `CV-1234. ${c.service.description}`; }, 'Tenant-side rental search agent no. CV-1234. Rental search'],
        ['madrid', 'the <title> "… — our agent number" and the meta description "M-4471. …"', (c) => { c.meta.title = 'Madrid rental agent for expats — our agent number'; c.meta.description = `M-4471. ${c.meta.description}`; }, '— our agent number M-4471. Apartment search']];
      const p5miss = refused(XCUT, P5);
      check(!p5miss.length, `seventh round: the ${P5.length} number shapes split between a page's title and its description (<title> and meta description, og:title and og:description) or between a JSON-LD node's serviceType and its description are refused, the pair quoted`, say(p5miss, P5));
      // on /desks: a number typed in the hub's copy is refused by the hub's own rule before the guard ("types a number"); the guard itself
      // reads the hub page the same way (a long number-key label with its code, a separator, the code first, injected into the built hub)
      {
        const errOf = (mut) => { const h = JSON.parse(read('cities/_hub.json')); mut(h); try { renderHub({ template: read('cities/_hub.html'), shared, hub: h, cities: SLUGS.map((s) => clone(CITY[s])), assetVersion: { css: 'testcss000', desksCss: 'testdcss00', desksJs: 'testdjs000' }, frags, root: R, weigh: false }); return 'built clean'; } catch (e) { return e.message; } };
        const typed = errOf((h) => { h.footer.statement += ' Our agent number in Valencia — CV-1234.'; });
        const inHub = (frag) => claimProblems(hubHtml.replace(/<\/main>/i, `${frag}</main>`), { claims }).map((p) => p.why);
        check(/cities\/_hub\.json: footer\.statement: .*types a number/.test(typed)
          && inHub('<dl><dt>Our agent number in Valencia</dt><dd>CV-1234.</dd></dl>').includes('xcut') && inHub('<dl><dt>CV-1234</dt><dd>Our agent number in Valencia.</dd></dl>').includes('xcut')
          && inHub('<p>Our agent number in Valencia — CV-1234.</p>').includes('ncut') && inHub('<p>Agent no. · CV-1234.</p>').includes('cut') && !inHub('').length,
          'seventh round: on /desks a typed code is refused by the hub\'s number rule; on the built hub page the guard refuses a long number-key label with its code, the reversed pair, a number key and a code in one string and a separator, and the hub as built is clean', typed.slice(0, 200));
      }
      // the nine built pages: every join, pair and string read, none refused; the true copy that stays clean
      {
        const kinds = {}, fired = [];
        let strings = 0;
        for (const [x, h] of [...SLUGS.map((y) => [y, PAGE[y]]), ['desks', hubHtml]]) {
          const joins = [], all = reviewSentences(h, { joins });
          for (const j of joins) { kinds[j.how] = (kinds[j.how] || 0) + 1; if (j.cut) fired.push(`${x} ${j.how}: ${j.parts.join(' | ')}`); }
          for (const s of all) { if (s.ncut || s.cut || s.xcut || s.split) fired.push(`${x} ${s.where}: ${s.text}`); }
          const blocks = new Map();
          for (const s of all) blocks.set(`${s.where}|${s.block}`, `${blocks.get(`${s.where}|${s.block}`) || ''} ${s.text}`);
          strings += blocks.size;
          for (const [k, t] of blocks) if (numKeyCode(t)) fired.push(`${x} ${k}: ${t.trim()}`);
        }
        check(kinds.meta === 3 * (SLUGS.length + 1) && kinds.ld > 100 && !kinds.block && !fired.length,
          `seventh round: on the nine built pages ${Object.values(kinds).reduce((a, b) => a + b, 0)} joins are read (${Object.entries(kinds).map(([k, v]) => `${k} ${v}`).join(', ')}) and ${strings} blocks and strings, and nothing is refused: no long label, no reversed pair, no multi-line value, no title and description carries a number key with a code`, fired.join(' | '));
        check(joinCut(['Our agent number in Valencia', 'CV-1234.']) === 'number' && joinCut(['CV-1234', 'Our agent number in Valencia.']) === 'number' && joinCut(['Valencia rental agent — BOOM agent no.', 'CV-1234. Apartment search']) === 'hits'
          && !joinCut(['VAT IT17322991005, REA RM-1710623', 'Email or WhatsApp number']) && !joinCut(['Operated by', 'Egidi Immobiliare S.r.l. — VAT IT17322991005, REA RM-1710623, 00186 Roma'])
          && !joinCut(['Is BOOM Milan a real estate agency?', 'Yes. BOOM Milan is a desk of Egidi Immobiliare S.r.l., an Italian real estate agency registered in Rome (REA RM-1710623).'])
          && !joinCut(['Who', 'BOOM Milan, the tenant-side rental desk of BOOM — operated by Egidi Immobiliare S.r.l. (REA RM-1710623)'])
          && !joinCut(['€199', 'flat · incl. VAT']) && !joinCut(['Passport or EU ID', 'AMS 02']) && !joinCut(['AMS 02', 'Passport or EU ID']),
          'seventh round: joinCut reads either order ("Our agent number in Valencia" | "CV-1234.", "CV-1234" | "Our agent number in Valencia.") and a title with its description; the company lines with VAT IT17322991005 and REA RM-1710623 under "Operated by", "Who" and "Is BOOM Milan a real estate agency?", a fare\'s "€199" | "flat · incl. VAT" and "Passport or EU ID" | "AMS 02" stay clean');
      }
    }
    // ── eighth round (04/11/2026, the last): a code written grouped or as a number and its year, the build's indexes between two
    //    lines, the hub's row heads with every cell of their row, and the Spanish and Italian "agente" ──
    {
      const desk = (slug, mut) => { const c = clone(CITY[slug]); mut(c); try { render(c); return 'built clean'; } catch (e) { return e instanceof BuildError ? e.message : `threw ${e.name}: ${e.message}`; } };
      const reEsc = (t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const pg8 = (b) => `<!DOCTYPE html><html><head><title>t</title></head><body><main>${b}</main></body></html>`;
      const why8 = (h, sell = true) => claimProblems(pg8(h), { claims, sell }).map((p) => p.why);
      const row = (dt, dd, at) => (c) => { c.bref.rows.splice(at, 0, { dt, ddHtml: dd }); };
      const faq = (k, t) => (c) => { c.faq.items[k].a += ` ${t}`; };
      const XCUT = 'split between a label and its value \\(on the page they read as one claim\\): ';
      const UNREV = 'not reviewed in cities/_claims\\.json: ';
      // the quote is the END of the quoted sentence, with its closing quote and where it stands
      const refused = (msg, list) => list.filter(([s, , mut, quote]) => !new RegExp(`${msg}.*${reEsc(quote)}`).test(desk(s, mut)));
      const say = (miss, list) => miss.map(([s, t, mut]) => `${s}: ${t} → ${desk(s, mut).slice(0, 220)}`).join(' | ');
      // (P1) a grouped code ("1.234", "1,234", "12 345", "CV-12.345", "12.345.678", "1,234,567") after a number word, a number
      // abbreviation (nº, n., no.) or with its letters and a hyphen after a bare keyword, and a number with its year ("45/2026")
      const P1 = [];
      for (const t of ['Agent no. 1,234.', 'Agent no. 1.234.', 'Agent no. 12 345.', 'Agent no. CV-12.345.', 'Our agent number is 12.345.', 'Agent number: 1,234,567.', 'Agente inmobiliario nº 1.234.', 'Nº 1.234.', 'Agent no. 45/2026.'])
        P1.push(['valencia', `a FAQ answer "… ${t}"`, faq(2, t), `"${normSentence(t)}" (text, ld)`]);
      P1.push(['london', 'a FAQ answer "… Agency number 12,345."', faq(2, 'Agency number 12,345.'), '"Agency number 12,345" (text, ld)'],
        ['london', 'a FAQ answer "… Agency no. 12,345."', faq(2, 'Agency no. 12,345.'), '"Agency no. 12,345" (text, ld)'],
        ['amsterdam', 'a FAQ answer "… Agent no. 12.345.678."', faq(2, 'Agent no. 12.345.678.'), '"Agent no. 12.345.678" (text, ld)'],
        ['milan', 'a FAQ answer "… Agente n. 1.234."', faq(2, 'Agente n. 1.234.'), '"Agente n. 1.234" (text, ld)'],
        ['madrid', 'a FAQ answer "… Agent CV-12.345." (letters and a hyphen after a bare keyword)', faq(2, 'Agent CV-12.345.'), '"Agent CV-12.345" (text, ld)'],
        ['valencia', 'the Who row, after the company\'s Rome line, "… Agent no. 1.234."', (c) => { c.bref.rows[0].ddHtml += ' Agent no. 1.234.'; }, '"Agent no. 1.234" (text)'],
        ['paris', 'a FAQ answer "… Agent no. 1.234." (draft)', faq(1, 'Agent no. 1.234.'), '"Agent no. 1.234" (text, ld)'],
        ['berlin', 'a FAQ answer "… Agent no. 45/2026." (draft)', faq(1, 'Agent no. 45/2026.'), '"Agent no. 45/2026" (text, ld)']);
      const p1miss = refused(UNREV, P1);
      check(!p1miss.length, `eighth round: the ${P1.length} grouped codes and numbers with their year ("Agent no. 1.234", "1,234", "12 345", "CV-12.345", "Our agent number is 12.345", "1,234,567", "Agente inmobiliario nº 1.234", "Nº 1.234", "Agente n. 1.234", "Agent no. 12.345.678", "Agent CV-12.345", "Agent no. 45/2026") are number shapes, refused as unreviewed on the six desks that sell (a FAQ answer, the Who row after the company's Rome line) and on both drafts`, say(p1miss, P1));
      const P1L = [
        ['valencia', 'row 6 "Agent no." / "1.234"', row('Agent no.', '1.234', 6), '"Agent no. 1.234" (text'],
        ['valencia', 'row 6 "Our agent number in Valencia" / "12.345"', row('Our agent number in Valencia', '12.345', 6), '"Our agent number in Valencia 12.345" (text'],
        ['madrid', 'row 6 "Agent no." / "1,234"', row('Agent no.', '1,234', 6), '"Agent no. 1,234" (text'],
        ['barcelona', 'row 6 "Agent no." / "B-1.234"', row('Agent no.', 'B-1.234', 6), '"Agent no. B-1.234" (text'],
        ['valencia', 'row 6 "Agent no." / "45/2026"', row('Agent no.', '45/2026', 6), '"Agent no. 45/2026" (text'],
        ['london', 'row 6 "Our agency number" / "12 345"', row('Our agency number', '12 345', 6), '"Our agency number 12 345" (text'],
        ['berlin', 'row 5 "Our agent number in Berlin" / "12.345" (draft)', row('Our agent number in Berlin', '12.345', 5), '"Our agent number in Berlin 12.345" (text']];
      const p1lmiss = refused(XCUT, P1L);
      check(!p1lmiss.length, `eighth round: the ${P1L.length} grouped codes and numbers with their year under a number key ({dt "Agent no.", dd "1.234"}, "Our agent number in Valencia" | "12.345", "1,234", "B-1.234", "45/2026", "12 345") are refused on the desks that sell and on a draft, the join quoted`, say(p1lmiss, P1L));
      // the true copy: a grouped number with no number word before it, an amount, a measure, a date, a phone number, two years, a law
      const NOCODE8 = ['An agency (2,500 homes).', 'Rents run €1,500 – €2,000/month.', '12,000 students a year.', '1.500 € per month.', 'No 1,000 listings to scroll.', 'There is no 10,000-word contract.',
        'Llei 11/2025 and RDL 29/2026.', 'art. 11 L. 392/1978', 'The academic year 2026/2027.', 'Agent since 22/10/2026.', 'Agency fee 1,500 €.', 'Agency (1.234 m²).'];
      const KEYFREE8 = ['Our agent number? None outside Rome; rents run €1,500 – €2,000/month.', "Your agent's number: +34 612 345 678.", 'Our agency number since 22/10/2026.', 'Agent number questions: 1.500 € per month.',
        'Our agent number covers 2025/2026.', 'WhatsApp +39 331 325 1961 · Email or WhatsApp number'];
      check(NOCODE8.every((t) => !hasClaimVocab(t)) && !KEYFREE8.some(numKeyCode) && !joinCut(['Agent no.', '1.500 €']) && !joinCut(['Our agent number', '+34 612 345 678'])
          && !joinCut(['Our agent number', '22/10/2026']) && !joinCut(['Operated by', 'Egidi Immobiliare S.r.l. — VAT IT17322991005, REA RM-1710623, Viale Liegi 42, 00198 Roma'])
          && !joinCut(['Who', 'BOOM Milan, the tenant-side rental desk of BOOM — operated by Egidi Immobiliare S.r.l. (REA RM-1710623)'])
          && !joinCut(['Is BOOM Milan a real estate agency?', 'Yes. BOOM Milan is a desk of Egidi Immobiliare S.r.l., an Italian real estate agency registered in Rome (REA RM-1710623).'])
          && JSON.stringify(claimHits('Agente de la Propiedad Inmobiliaria')) === '["agente de la propiedad inmobiliaria"]' && cleanText('N&ordm; 1.234 · № 5') === 'Nº 1.234 · Nº 5',
        'eighth round: the true copy stays clean — "An agency (2,500 homes)", "€1,500 – €2,000/month", "12,000 students a year", "1.500 € per month", "No 1,000 listings" (the English "no", no dot), laws, two years, a date, a phone number, an amount or a measure after a key; the company lines with VAT IT17322991005 and REA RM-1710623 under "Operated by", "Who" and "Is BOOM Milan a real estate agency?"; "Agente de la Propiedad Inmobiliaria" keeps its one hit; the ordinal of "Nº" and the sign № keep their mark',
        [...NOCODE8.filter(hasClaimVocab), ...KEYFREE8.filter(numKeyCode)].join(' | '));
      // (P2) the build's indexes between two lines: a paper's code ("VLC 08"), a lane number ("03"), a question number
      const P2 = [
        ['valencia', 'two papers "Our agent number" / "CV-1234" (the build\'s "VLC 08" between)', (c) => { c.papers.items.splice(6, 2, 'Our agent number', 'CV-1234'); }, '"Our agent number CV-1234" (text'],
        ['madrid', 'two papers "Our agent number, for the landlord" / "M-4471 on every letter" ("MAD 08" between)', (c) => { c.papers.items.splice(6, 2, 'Our agent number, for the landlord', 'M-4471 on every letter'); }, '"Our agent number, for the landlord M-4471 on every letter" (text'],
        ['madrid', 'a check\'s text ending "Ask for our agent number." and the next check\'s legal label "M-4471" (the lane "03" between)', (c) => { c.checks.items[1].text += ' Ask for our agent number.'; c.checks.items[2].at = 'M-4471'; }, 'Ask for our agent number. M-4471" (text'],
        ['valencia', 'an answer ending "Ask for our agent number." and the next question "CV-1234: is it on every letter we send?" (the question number between)', (c) => { c.faq.items[1].a += ' Ask for our agent number.'; c.faq.items[2].q = 'CV-1234: is it on every letter we send?'; }, 'Ask for our agent number. CV-1234: is it on every letter we send?" (text'],
        ['paris', 'two papers "Our agent number" / "P-4471" (draft)', (c) => { c.papers.items.splice(6, 2, 'Our agent number', 'P-4471'); }, '"Our agent number P-4471" (text']];
      const p2miss = refused(XCUT, P2);
      check(!p2miss.length && why8('<ol><li><span class="tn" aria-hidden="true">VLC 07</span> <span class="tt">Our agent number</span></li><li><span class="tn" aria-hidden="true">VLC 08</span> <span class="tt">CV-1234</span></li></ol>').includes('xcut')
          && why8('<details><summary><span class="ln" aria-hidden="true">01</span> <span class="at" data-instr>fianza</span> <span class="t">The deposit</span></summary><p>Ask for our agent number.</p></details><details><summary><span class="ln" aria-hidden="true">02</span> <span class="at" data-instr>M-4471</span> <span class="t">The rent</span></summary><p>We check.</p></details>').includes('xcut'),
        `eighth round: the ${P2.length} keys and codes with a build index between them (two papers with the span.tn "VLC 08" between, a check's text and the next check's legal label with the lane "03" between, an answer and the next question with its number between) are refused on the desks that sell and on a draft, the join quoted`, say(p2miss, P2));
      // (P3) /desks: a row head with a number key is the label of every cell of its row (the render, and the built hub with a row injected)
      {
        const hubOf = (hmut, cmut) => { const h = JSON.parse(read('cities/_hub.json')); hmut(h); const cs = SLUGS.map((s) => { const c = clone(CITY[s]); if (cmut[s]) cmut[s](c); return c; }); try { renderHub({ template: read('cities/_hub.html'), shared, hub: h, cities: cs, assetVersion: { css: 'testcss000', desksCss: 'testdcss00', desksJs: 'testdjs000' }, frags, root: R, weigh: false }); return 'built clean'; } catch (e) { return e.message; } };
        const move = (id, head) => (h) => { h.rules.rows = [...h.rules.rows.map((r) => (r.ids ? { ...r, ids: r.ids.filter((x) => x !== id) } : r)), { head, ids: [id] }]; };
        const P3 = [
          ['a row head "Agent number" over Madrid\'s rent check at "M-4471" (the fourth cell)', move('rent', 'Agent number'), { madrid: (c) => { c.checks.items[2].at = 'M-4471'; } }, '"Agent number M-4471" (text)'],
          ['a row head "Our agent number, desk by desk" over Madrid\'s "M-4471"', move('rent', 'Our agent number, desk by desk'), { madrid: (c) => { c.checks.items[2].at = 'M-4471'; } }, '"Our agent number, desk by desk M-4471" (text)'],
          ['a row head "Agent number" over Milan\'s charges check at "MI-123456" (the fifth cell)', move('charges', 'Agent number'), { milan: (c) => { c.checks.items[3].at = 'MI-123456'; } }, '"Agent number MI-123456" (text)'],
          ['a row head "Agent number" over Amsterdam\'s check at "AMS-1234" (the first cell)', move('wws', 'Agent number'), { amsterdam: (c) => { c.checks.items[2].at = 'AMS-1234'; } }, '"Agent number AMS-1234" (text)']];
        const p3miss = P3.filter(([, hm, cm, quote]) => !new RegExp(`cities/_hub\\.json: .*${XCUT}.*${reEsc(quote)}`).test(hubOf(hm, cm)));
        const inHub = (frag) => claimProblems(hubHtml.replace(/<\/main>/i, `${frag}</main>`), { claims }).map((p) => p.why);
        const tr = (head, cells) => `<table class="rtab"><tbody><tr><th scope="row">${head}</th>${cells.map((c) => `<td>${c}</td>`).join('')}</tr></tbody></table>`;
        const joinsOf = (h) => { const j = []; reviewSentences(h, { joins: j }); return j; };
        check(!p3miss.length && inHub(tr('Agent number', ['—', '—', '—', 'M-4471', '—'])).includes('xcut') && inHub(tr('M-4471', ['—', '—', 'Our agent number'])).includes('xcut')
            && inHub(tr('Our agent number, desk by desk', ['—', '—', 'In Valencia', 'CV-12.345'])).includes('xcut') && !inHub('').length && !joinsOf(hubHtml).some((j) => j.how === 'row'),
          `eighth round: on /desks a row head with a number key is the label of every cell of its row — the ${P3.length} rules tables built from _hub.json and the desks (the code in the first, fourth or fifth cell, a long head) are refused, and so are rows injected into the built hub (the code in a later cell, the code in the head and the key in a cell, a grouped code); the hub as built has no row head with a key or a code`,
          p3miss.map(([t, hm, cm]) => `${t} → ${hubOf(hm, cm).slice(0, 220)}`).join(' | '));
      }
      // (P4) the Spanish and Italian "agente", and the abbreviated words of the number before it
      const P4 = [];
      for (const t of ['Agente: CV-1234.', 'Agente CV-1234.', 'Nº de agente CV-1234.', 'Nº de agente: CV-1234.', 'N.º de agente: 1234.', 'Núm. de agente: 1234.', 'Nro. de agente: 1234.', 'Número agente: 1234.', 'Código de agente: CV-1234.', 'ID de agente: CV-1234.', 'Nº de agente 1.234.'])
        P4.push(['valencia', `a FAQ answer "… ${t}"`, faq(2, t), `"${normSentence(t)}" (text, ld)`]);
      for (const t of ['Agente: MI-1234.', 'Codice agente: MI-1234.', 'N. agente MI-1234.', 'Numero agente MI-1234.']) P4.push(['milan', `a FAQ answer "… ${t}"`, faq(2, t), `"${normSentence(t)}" (text, ld)`]);
      P4.push(['berlin', 'a FAQ answer "… Agente: B-1234." (draft)', faq(1, 'Agente: B-1234.'), '"Agente: B-1234" (text, ld)']);
      const p4miss = refused(UNREV, P4);
      const P4L = [
        ['madrid', 'row 6 "Nº de agente" / "M-4471"', row('Nº de agente', 'M-4471', 6), '"Nº de agente M-4471" (text'],
        ['barcelona', 'row 6 "Agente" / "B-5521"', row('Agente', 'B-5521', 6), '"Agente B-5521" (text'],
        ['valencia', 'row 6 "Nº de agente" / "1234"', row('Nº de agente', '1234', 6), '"Nº de agente 1234" (text'],
        ['valencia', 'row 6 "Nº de agente" / "1.234"', row('Nº de agente', '1.234', 6), '"Nº de agente 1.234" (text'],
        ['milan', 'row 6 "Codice agente" / "MI-1234"', row('Codice agente', 'MI-1234', 6), '"Codice agente MI-1234" (text']];
      const p4lmiss = refused(XCUT, P4L);
      check(!p4miss.length && !p4lmiss.length, `eighth round: the ${P4.length + P4L.length} number shapes and labels with the Spanish and Italian "agente" ("Agente: CV-1234", "Nº de agente CV-1234", "N.º de agente: 1234", "Núm. de agente", "Nro. de agente", "Número agente", "Código de agente", "ID de agente", "Codice agente", "N. agente", "Numero agente"; {dt "Nº de agente", dd "M-4471"}, {dt "Agente", dd "B-5521"}) are refused on the desks that sell and on a draft; "Agente de la Propiedad Inmobiliaria" with no code keeps its verdict`,
        [say(p4miss, P4), say(p4lmiss, P4L)].filter(Boolean).join(' | '));
      // the nine built pages: no join holds a build index, the hub has no row join, nothing is refused
      {
        const kinds = {}, fired = [], idx = [];
        for (const [x, h] of [...SLUGS.map((y) => [y, PAGE[y]]), ['desks', hubHtml]]) {
          const joins = [], all = reviewSentences(h, { joins });
          for (const j of joins) {
            kinds[j.how] = (kinds[j.how] || 0) + 1;
            if (j.cut) fired.push(`${x} ${j.how}: ${j.parts.join(' | ')}`);
            if (j.parts.some((p) => /^(?:\d{1,2}|[A-Z]{3} \d{2})$/.test(p))) idx.push(`${x} ${j.how}: ${j.parts.join(' | ')}`);
          }
          for (const s of all) if (s.ncut || s.cut || s.xcut || s.split) fired.push(`${x} ${s.where}: ${s.text}`);
        }
        check(!fired.length && !idx.length && !kinds.row && kinds.label > 1000,
          `eighth round: on the nine built pages ${Object.values(kinds).reduce((a, b) => a + b, 0)} joins are read (${Object.entries(kinds).map(([k, v]) => `${k} ${v}`).join(', ')}), none holds a build index (a paper's code, a lane, question or step number), none is refused, and no row head of the hub carries a number key or a code`,
          [...fired, ...idx].slice(0, 8).join(' | '));
      }
    }
    // (g) the page-level mirror, a literal copy independent of the build: no selling desk names a register it does not hold
    const HELD = /\bRAICV\b|Registro de Agentes|\bAICAT\b|Registre d['’]Agents|carte professionnelle|\bcarte T\b|§\s*34\s*c|Paragraph\s*34\s*c|Property Ombudsman|Property Redress|redress scheme|Propertymark|\bARLA\b|\bNAEA\b|\bKvK|Kamer van Koophandel|\bTPO\b|\bCMP\b|client money protection|\bRICS\b|\bNVM\b|\bVBO\b|Agente de la Propiedad|colegiad|\bFIMAA\b|\bFIAIP\b|\bPRS\b|\bFNAIM\b|\bIVD\b|\bIHK\b/i;
    for (const s of SELLERS) {
      const said = reviewSentences(PAGE[s]).map((x) => x.text).join(' \n ');
      const m = said.match(HELD);
      check(!m, `${s}: no register or licence it does not hold (RAICV, AICAT, carte professionnelle, carte T, §34c, redress scheme, Property Ombudsman, Propertymark, ARLA, NAEA, KvK, TPO, CMP, RICS, NVM, VBO, Agente de la Propiedad, colegiado, FIMAA, FIAIP, PRS, FNAIM, IVD, IHK)`, m ? m[0] : '');
    }
    // the hub runs the same guard
    {
      const hub = JSON.parse(read('cities/_hub.json')); hub.footer.statement += ' Accredited by the Generalitat Valenciana.';
      const r = throws(() => renderHub({ template: read('cities/_hub.html'), shared, hub, cities: SLUGS.map((s) => clone(CITY[s])), assetVersion: { css: 'testcss000', desksCss: 'testdcss00', desksJs: 'testdjs000' }, frags, root: R, weigh: false }), /cities\/_hub\.json: 1 sentence\(s\) about registration or licences not reviewed.*"Accredited by the Generalitat Valenciana"/);
      check(r === true, 'the hub (/desks) refuses an unreviewed sentence too', r);
    }
    const llms = read('llms.txt');
    check(!/registered Italian agency/i.test(llms) && /Operated by Egidi Immobiliare S\.r\.l\., an Italian real estate agency registered in Rome/.test(llms),
      'llms.txt: the desks paragraph says "an Italian real estate agency registered in Rome", never "the registered Italian agency"');
  }
  {
    // the PFS plancia: every LIVE desk has its voice in the client modal's market select (pfs-command.html #cm-market),
    // or saving a Full Search client of that desk would rewrite it to 'roma' and the radar would push Rome listings
    const cm = (read('pfs-command.html').match(/<select id="cm-market">([\s\S]*?)<\/select>/) || [])[1] || '';
    const missing = SLUGS.filter((s) => CITY[s].live === true && !cm.includes(`<option value="${s}">`));
    check(cm && !missing.length, 'pfs-command.html: every live desk has an <option> in the client modal\'s market select (#cm-market)', `missing: ${missing.join(', ')}`);
  }
  check(['madrid', 'barcelona', 'valencia'].every((s) => !/seguro de impago|rent[- ]default insurance|rent guarantee insurance/i.test(JSON.stringify(CITY[s]))), 'the Spanish desks never list rent-default insurance among the papers (a landlord may not require it: RDL 29/2026)');
  check(/Generalitat/.test(CITY.valencia.checks.items.find((k) => k.id === 'deposit').text) && /deposit receipt/.test(CITY.valencia.checks.items.find((k) => k.id === 'deposit').text) && /\btoday\b/.test(CITY.valencia.checks.items.find((k) => k.id === 'rent').text),
    'valencia: the deposit is lodged with the Generalitat (ask for the receipt); the no-stressed-zone line is dated ("today") and held on the hub');
  for (const s of ['paris', 'berlin']) {
    const extra = CITY[s].pricing.plans.flatMap((p) => ['negotiat', 'template', 'cover letter'].filter((w) => p.offerDescription.toLowerCase().includes(w) && !p.includes.join(' ').toLowerCase().includes(w)).map((w) => `${p.id}: ${w}`));
    check(!extra.length, `${s}: its Offers (JSON-LD) promise nothing its tickets do not show (no negotiation, templates or cover letter the page never names)`, extra.join(', '));
  }
}

// ── 8b · Stage 0 (04/11/2026): the served assets are the sources without their comments ──
// The commented sources live in assets/src/ (never deployed); the build EMITS
// assets/<name> from them. The served copy must be the source minus its
// comments (the scanner and an independent line-based oracle agree), it must
// parse (node --check), the pages must link it by ITS hash, the weights must
// be measured on it, and nothing served may reference the sources.
{
  const gz = (s) => zlib.gzipSync(Buffer.from(s), { level: 9 }).length;
  // the oracle: whole-line comments only, no knowledge of strings — it agrees with the
  // scanner on these files because none of them has a comment inside a literal
  const naive = (src, kind) => {
    const keep = []; let inB = false;
    for (const l of src.split('\n')) {
      if (inB) { if (l.includes('*/')) { inB = false; const rest = l.slice(l.indexOf('*/') + 2); if (rest.trim()) keep.push(rest.trimStart()); } continue; }
      if (/^\s*\/\*/.test(l)) { if (l.includes('*/')) { const rest = l.slice(l.indexOf('*/') + 2); if (rest.trim()) keep.push(l.match(/^\s*/)[0] + rest.trimStart()); } else inB = true; continue; }
      if (kind === 'js' && /^\s*\/\//.test(l)) continue;
      keep.push(l);
    }
    return keep.join('\n').replace(/\n{4,}/g, '\n\n');
  };
  check(SERVED_ASSETS.map((a) => a.name).join() === 'boom-city.css,boom-city.js,boom-onda.js,boom-map.js,boom-desks.css,boom-desks.js' && SERVED_ASSETS.every((a) => a.kind === path.extname(a.name).slice(1)),
    'SERVED_ASSETS: the six files of the desks and the hub (the map\'s script since v1.7), each with its kind');
  for (const a of SERVED_ASSETS) {
    const src = path.join(R, 'assets/src', a.name), out = path.join(R, 'assets', a.name);
    check(fs.existsSync(src) && fs.existsSync(out), `assets/src/${a.name} (the source) and assets/${a.name} (served) both exist`);
    const source = fs.readFileSync(src, 'utf8'), served = fs.readFileSync(out, 'utf8');
    check(served === stripComments(source, a.kind), `assets/${a.name} is assets/src/${a.name} minus its comments, byte for byte`);
    check(served === naive(source, a.kind), `assets/${a.name}: an independent line-based oracle agrees with the scanner`);
    check(/^\/\*/.test(source) && !/^[ \t]*\/\*/m.test(served) && !(a.kind === 'js' && /^[ \t]*\/\//m.test(served)) && gz(served) < gz(source),
      `assets/${a.name}: the banner and every whole-line comment stay in the source, none is served (${(gz(source) / 1024).toFixed(1)} → ${(gz(served) / 1024).toFixed(1)} KB gz)`);
    if (a.kind === 'js') {
      const r = spawnSync(process.execPath, ['--check', out], { encoding: 'utf8' });
      check(r.status === 0, `node --check assets/${a.name}: the served script parses`, r.stderr);
      check(/^\(function \(\) \{\n  'use strict';\n/.test(served), `assets/${a.name} opens with its IIFE and 'use strict' first: only comments went`);
    }
  }
  const em = emittedAssets(R);
  check(em.length === 6 && em.every((a) => !a.stale && a.gzKb < a.sourceGzKb), 'emittedAssets(R): no served copy is stale against its source (the committed assets are the build\'s)');
  const sha = (f) => crypto.createHash('sha256').update(fs.readFileSync(path.join(R, f))).digest('hex').slice(0, 10);
  check(SLUGS.every((s) => PAGE[s].includes(`/assets/boom-city.css?v=${sha('assets/boom-city.css')}`) && PAGE[s].includes(`/assets/boom-city.js?v=${sha('assets/boom-city.js')}`)) && sha('assets/boom-city.css') !== sha('assets/src/boom-city.css'),
    'every desk page links the CSS and the JS by the hash of the SERVED file, never the source\'s');
  check(Math.abs(pages[0].weight.cssKb * 1024 - gz(fs.readFileSync(path.join(R, 'assets/boom-city.css')))) < 1 && Math.abs(pages[0].weight.jsKb * 1024 - gz(fs.readFileSync(path.join(R, 'assets/boom-city.js')))) < 1,
    'the weights are measured on the served files');
  const servedHtml = fs.readdirSync(R).filter((f) => f.endsWith('.html')).map((f) => read(f)).join('\n') + read('cities/_template.html') + read('cities/_hub.html') + read('vercel.json');
  check(!/assets\/src\//.test(servedHtml), 'no page, template or header rule references assets/src/');
  check(read('.vercelignore').split(/\r?\n/).map((l) => l.trim()).includes('/assets/src/'), '.vercelignore keeps /assets/src/ off the site');

  // the stripper, case by case
  const S = (x, k) => stripComments(x, k);
  check(S('a{content:"/* not */"}/* yes */\nb{}\n', 'css') === 'a{content:"/* not */"}\nb{}\n', 'CSS: a /* inside a string stays, the block after it goes');
  check(S('a{background:url(data:image/svg+xml,/*x*/)}\n', 'css') === 'a{background:url(data:image/svg+xml,/*x*/)}\n', 'CSS: an unquoted url(…) is one token, nothing in it is a comment');
  check(S("/* don't */\na{}\n", 'css') === 'a{}\n' && S('x{} /* tail */\ny{}\n', 'css') === 'x{}\ny{}\n' && S('  /* lead */ a{}\n', 'css') === '  a{}\n' && S('a{}\n/* one\n   two */\nb{}\n', 'css') === 'a{}\nb{}\n',
    'CSS: whole-line blocks go with their line, a trailing block goes with the blanks before it, a leading one keeps the indent, an apostrophe in a comment opens no string');
  check(S("var u = 'https://x'; // tail\n", 'js') === "var u = 'https://x'; // tail\n" && S('foo(1, /* arg */ 2);\n', 'js') === 'foo(1, /* arg */ 2);\n' && S("var r = /\\/\\*/; /* keep mid */\n", 'js') === "var r = /\\/\\*/; /* keep mid */\n",
    'JS: a // mid-line (https:// included) and a block mid-line are never touched, nor a /* in a regex literal');
  check(S('  // only\nvar a = 1;\n', 'js') === 'var a = 1;\n' && S('/* block */\nvar a = 1;\n', 'js') === 'var a = 1;\n' && S('/* a */ var b = 2;\n', 'js') === 'var b = 2;\n' && S('a();\n// c\nb();\n', 'js') === 'a();\nb();\n',
    'JS: a line that is only a // comment and a block that begins a line go, leaving no blank line');
  check(S('var t = `\n/* css */\n// not a comment\n`;\n', 'js') === 'var t = `\n/* css */\n// not a comment\n`;\n' && S("var s = '\\n'; var q = \"/* no */\";\n", 'js') === "var s = '\\n'; var q = \"/* no */\";\n",
    'JS: nothing inside a template literal or a string is a comment, even at the start of a line');
  check(S('var t = `a${\n/* c */\n1}b`;\n', 'js') === 'var t = `a${\n1}b`;\n', 'JS: a comment inside a ${…} expression is code, and goes');
  check(S("/* banner */\n(function () {\n  'use strict';\n})();\n", 'js') === "(function () {\n  'use strict';\n})();\n", "JS: the banner goes and 'use strict' stays first");
  check(S('var x = a / b / c; // c\n', 'js') === 'var x = a / b / c; // c\n' && S("var re = /https?:\\/\\//; // scheme\n", 'js') === "var re = /https?:\\/\\//; // scheme\n" && S('var y = s.replace(/\\/\\//g, "");\n', 'js') === 'var y = s.replace(/\\/\\//g, "");\n',
    'JS: a division is not a regex and a regex is not a comment');
  check(S('var y = 1;\n\n\n\n\nvar z = 2;\n', 'js') === 'var y = 1;\n\nvar z = 2;\n' && S('a{}\n\n\nb{}\n', 'css') === 'a{}\n\n\nb{}\n', 'three or more blank lines fold to one; fewer stay as written');
  check(throws(() => S('a{} /* oops\n', 'css'), /unterminated comment/) === true && throws(() => S("var s = 'oops\n", 'js'), /unterminated string/) === true && throws(() => S('x', 'txt'), /kind must be/) === true,
    'the stripper refuses what it cannot follow (an unterminated comment or string, an unknown kind) instead of guessing');
}

// ── 8b · Stage 2 (04/11/2026): the Horizon's script, loaded on view ──────
{
  const gz = (x) => zlib.gzipSync(Buffer.from(x), { level: 9 }).length;
  const sha = (f) => crypto.createHash('sha256').update(fs.readFileSync(path.join(R, f))).digest('hex').slice(0, 10);
  const mapJs = read('assets/src/boom-map.js'), served = read('assets/boom-map.js');
  check(SERVED_ASSETS.some((a) => a.name === 'boom-map.js' && a.kind === 'js' && a.of === 'desk') && served === stripComments(mapJs, 'js'), 'assets/boom-map.js is a served asset emitted from assets/src/ like the others (Stage 0)');
  check(MAP_KB === 3.5 && gz(served) / 1024 <= MAP_KB && pages.every((p) => p.weight.mapKb <= MAP_KB && Math.abs(p.weight.mapKb * 1024 - gz(served)) < 1),
    `the map's script is ${(gz(served) / 1024).toFixed(2)} KB gzipped, under its own ${MAP_KB} KB line, measured on the served file`);
  const base = ['assets/boom-city.css', 'assets/boom-city.js', 'assets/boom-onda.js', 'assets/boom-map.js', 'js/boom-consent.js', 'js/boom-track.js'].reduce((n, f) => n + gz(fs.readFileSync(path.join(R, f))), 0);
  check(pages.every((p) => p.weight.totalKb <= WEIGHT_KB.total && Math.abs(p.weight.totalKb * 1024 - (gz(p.html) + base)) < 2),
    `every page's total counts the map and holds the ${WEIGHT_KB.total} KB cap WITH it (${pages.map((p) => `${p.slug} ${p.weight.totalKb.toFixed(1)}`).join(' · ')})`);
  check(SLUGS.every((s) => { const cfg = JSON.parse((PAGE[s].match(/window\.BOOM_CITY = (\{[\s\S]*?\});\s*<\/script>/) || [])[1] || '{}'); return cfg.MAP === `/assets/boom-map.js?v=${sha('assets/boom-map.js')}`; }),
    'every desk page carries the map script\'s versioned URL (the hash of the served file) in its config');
  const cityJs = read('assets/src/boom-city.js'), desksJs = read('assets/src/boom-desks.js');
  check([cityJs, desksJs].every((j) => /var hzMap = document\.querySelector\('svg\.hz'\), hzIn = false;/.test(j) && /rootMargin: '600px 0px'/.test(j) && /if \(es\.some\(function \(e\) \{ return e\.isIntersecting; \}\)\) \{ hzIO\.disconnect\(\); hzGo\(\); \}/.test(j) && !/es\[0\]\.isIntersecting/.test(j) && /if \(hzIn \|\| !hzMap \|\| ![CD]\.MAP\) return; hzIn = true;/.test(j))
    && /e\.src = C\.MAP; e\.async = true;/.test(cityJs) && /e\.src = D\.MAP; e\.async = true;/.test(desksJs),
    'boom-city.js and boom-desks.js inject the map script once, when the map nears the screen (600px ahead) — on ANY entry of the batch, never es[0] alone');
  // the script: one rAF chain, the stagger ≥ 260ms, never two planes on an arc, nothing under reduced motion, the night every minute from the desk calendar
  check((mapJs.match(/requestAnimationFrame\(/g) || []).length === 2 && /raf = raf \|\| requestAnimationFrame\(step\);/.test(mapJs) && /raf = fl\.length \? requestAnimationFrame\(step\) : 0;/.test(mapJs) && !/setInterval|\.animate\(|@keyframes/.test(mapJs),
    'boom-map.js: ONE requestAnimationFrame chain for every plane (a flight joins the list; the chain ends when the list is empty); no interval, no CSS animation');
  const stagger = +((mapJs.match(/fly\(k, i \* (\d+), !seen\)/) || [])[1] || 0);
  check(/if \(es\.some\(function \(e\) \{ return e\.isIntersecting; \}\)\) \{ io\.disconnect\(\);/.test(mapJs) && !/es\[0\]/.test(mapJs),
    'boom-map.js: the first-view flights start on ANY intersecting entry of the batch (never es[0] alone: a batch can lead with a stale entry)');
  check(/return !!\(drawn \|\| \/L\/\.test\(d\)\);/.test(mapJs) && /var dark = night\(sun\(\+now\)\);/.test(mapJs) && /x\.hidden = !!x\.querySelector\('\.k-n'\) && !dark;/.test(mapJs),
    'boom-map.js: the "night, now" key shows only when night() drew a veil pixel or a terminator segment in the frame; "open now" always');
  // v1.7 review, second round: the till's and the forced-colors guards bite here too, where the browser suite is skipped
  {
    const cityJs = read('assets/src/boom-city.js'), cityCss = read('assets/src/boom-city.css');
    const closeH = (cityJs.match(/till\.addEventListener\('close', function \(\) \{([\s\S]*?)\n    \}\);/) || [])[1] || '';
    check(/var fd = opener && opener\.closest && opener\.closest\('details\.fare'\);/.test(closeH) && /if \(fd && !fd\.open && document\.contains\(fd\)\) \{ fares\.forEach\(function \(o\) \{ o\.open = o === fd; \}\); last = fd; sync\(\); \}/.test(closeH),
      'boom-city.js (source): closing the till reopens the CLOSED ticket that holds its opener (the focus never falls to <body>)');
    check(/opener\.focus\(\{ preventScroll: true \}\)/.test(closeH) && /var or = opener\.getBoundingClientRect\(\);\s*if \(or\.top < topLim\(\) \|\| or\.bottom > innerHeight - stripH\(\)\) opener\.scrollIntoView\(\{ block: 'center', behavior: 'instant' \}\);/.test(closeH),
      'boom-city.js (source): the focus returned to the opener is SEEN — under the header or below the strip, it is scrolled to the centre');
    const deepF = (cityJs.match(/function deep\(\) \{([\s\S]*?)\n  \}/) || [])[1] || '';
    check(/if \(till && till\.open\) \{\s*scrollTo\(\{ left: tillX, top: tillY, behavior: 'instant' \}\);[\s\S]*?return;\s*\}/.test(deepF) && /tillX = scrollX; tillY = scrollY;/.test(cityJs),
      'boom-city.js (source): a link followed with the till open returns early and puts the page behind back where the till found it (recorded in openTill)');
    const fcPair = (cityCss.match(/@media \(forced-colors:active\) and \(min-width:360px\) and \(max-width:939px\)\{([\s\S]*?)\}\}/) || [])[1] || '';
    const bare = cityCss.replace(/@media \(forced-colors:active\) and \(min-width:360px\) and \(max-width:939px\)\{[\s\S]*?\}\}/, '');
    check(/\.bps:not\(\.pair-open\):not\(:has\(>\.bp:not\(\.eroe\)>\[open\]\)\)>\.bp:not\(\.eroe\) \.f-r::before\{border-left:0;border-top:1px dashed CanvasText/.test(fcPair) && !/\.bp:not\(\.eroe\) \.f-r::before\{border-left:0/.test(bare),
      'boom-city.css (source): the forced-colors horizontal economy tear lives ONLY inside the 360–939 pair block (no unscoped ".bp:not(.eroe) .f-r::before{border-left:0")');
    check(cityCss.includes('@media (forced-colors:active) and (min-width:940px){.eroe{border:1px solid ButtonText}.eroe>.fare{border:0}}'),
      'boom-city.css (source): in forced colors at ≥940 First class has ONE frame, the ticket\'s own border (the closed waitlist Full Search kept open corners above a separate foot)');
  }
  check(stagger >= 260 && /if \(!a \|\| reduce \|\| fl\.some\(function \(f\) \{ return f\.a === a; \}\)\) return;/.test(mapJs), `boom-map.js: the first view sends the planes ${stagger}ms apart (≥ 260), never two on one arc`);
  check(/var reduce = matchMedia\('\(prefers-reduced-motion: reduce\)'\)\.matches/.test(mapJs) && /if \(!reduce && window\.IntersectionObserver\)/.test(mapJs), 'boom-map.js: under reduced motion no plane flies and no arc is drawn in');
  check(/60080 - Date\.now\(\) % 60000/.test(mapJs) && /if \(!document\.hidden\) timer = setTimeout/.test(mapJs) && /addEventListener\('visibilitychange'/.test(mapJs)
    && /CAL\.deskWindow\(now, \{ timeZone: x\.z \|\| 'Europe\/Rome', hours: \{ from: x\.f \|\| '09:00', to: x\.t \|\| '19:00' \}, days: x\.w \|\| \[1, 2, 3, 4, 5\] \}, x\.h\)/.test(mapJs) && /g\.classList\.toggle\('on', !!w\.open\)/.test(mapJs),
    'boom-map.js: the night and the open-now glow are redrawn on each minute boundary while the tab is visible, from the desk calendar (the board\'s)');
  check(/if \(!svg \|\| svg\.hzOn\) return;/.test(mapJs) && /svg\.hzOn = 1;/.test(mapJs) && /window\.BOOM_MAP = \{ fly: fly, sun: sun \};/.test(mapJs) && /setAttribute\('transform', 'translate\(/.test(mapJs) && !/\.style\.(left|top|width|height)\b/.test(mapJs),
    'boom-map.js runs once per map, moves a plane by its transform attribute only, and exposes fly() to the hub\'s pins');
  check(/\.hz-pl\{fill:var\(--gold-hi\)\}/.test(read('assets/src/boom-city.css')) && /\.hz-term\{fill:none;stroke:rgba\(255,215,0,\.5\);stroke-dasharray:3 5\}/.test(read('assets/src/boom-city.css')),
    'boom-city.css styles the plane and the terminator the script adds (gold, a dashed line)');
  // served immutable, like the other emitted assets
  const rule = JSON.parse(read('vercel.json')).headers.find((h) => /boom-\(city/.test(h.source));
  check(rule && new RegExp(`^${rule.source}$`).test('/assets/boom-map.js') && new RegExp(`^${rule.source}$`).test('/assets/boom-city.js') && rule.headers.some((x) => x.key === 'Cache-Control' && /immutable/.test(x.value)),
    'vercel.json serves /assets/boom-map.js immutable, in the same rule as the other emitted assets (it carries ?v=)');
  check(SLUGS.every((s) => PAGE[s].includes(`<p class="net-k" aria-hidden="true">${HZ_KEY}</p>`)) && read('desks.html').includes(`<figcaption class="m-legend" aria-hidden="true">${HZ_KEY}</figcaption>`),
    'the map\'s key is one copy on every desk and the hub (HZ_KEY)');
  check(!/comet|hmap-svg|netDots|seaDots|landDots|mapXY|HUB_VIEWBOX|bowArcs|BOW_FIRST/.test(read('build-cities.mjs') + read('assets/src/boom-city.css') + read('assets/src/boom-desks.css') + read('assets/src/boom-desks.js')),
    'the flat map is gone: no comet, no fixed viewBox, no equirectangular projection, no bows, in the build or the assets');
}

// ── 9 · the build never overwrites a page it did not make ────────────────
{
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'boom-cities-'));
  for (const d of ['cities', 'assets/src', 'css', 'js', 'design/pages-deco']) fs.mkdirSync(path.join(tmp, d), { recursive: true });
  // the SOURCES only: the build emits the served assets/boom-*.{css,js} from them (Stage 0)
  for (const f of ['cities/_template.html', 'cities/_shared.json', 'cities/paris.json', 'assets/src/boom-city.css', 'assets/src/boom-city.js', 'assets/src/boom-onda.js', 'assets/src/boom-map.js',
    'css/boom-scroll.css', 'js/boom-scroll.js', 'js/boom-consent.js', 'js/boom-track.js', 'js/desk-calendar.js', 'design/pages-deco/solari-engine.html', 'og-paris.png', 'cities/_claims.json']) fs.copyFileSync(path.join(R, f), path.join(tmp, f));
  fs.writeFileSync(path.join(tmp, 'paris.html'), '<!doctype html><title>hand-made</title>');
  check(throws(() => writeAll({ root: tmp }), /not generated by this script — refusing/) === true && fs.readFileSync(path.join(tmp, 'paris.html'), 'utf8').includes('hand-made'),
    'a root page without the GENERATED mark is never overwritten');
  fs.unlinkSync(path.join(tmp, 'paris.html'));
  const first = writeAll({ root: tmp });
  const again = writeAll({ root: tmp, check: true });
  check(first[0].stale === true && again[0].stale === false, 'write then --check: the build is deterministic');
  const tCss = path.join(tmp, 'assets', 'boom-city.css'), tSrc = path.join(tmp, 'assets/src', 'boom-city.css');
  check(['boom-city.css', 'boom-city.js', 'boom-onda.js', 'boom-map.js'].every((f) => fs.readFileSync(path.join(tmp, 'assets', f), 'utf8') === stripComments(fs.readFileSync(path.join(tmp, 'assets/src', f), 'utf8'), path.extname(f).slice(1))),
    'the build emitted the four served assets from assets/src/, comments stripped (Stage 0)');
  fs.appendFileSync(tSrc, '/* a note in the source */\n');   // the source ends with a newline: a whole comment line
  check(writeAll({ root: tmp, check: true })[0].stale === false && emittedAssets(tmp).every((a) => !a.stale), 'a comment added to the SOURCE changes no served byte: neither the asset nor the page goes stale');
  fs.appendFileSync(tSrc, '\n.changed{color:red}\n');
  const chk = emitAssets({ root: tmp, check: true });
  check(writeAll({ root: tmp, check: true })[0].stale === true && chk.find((a) => a.name === 'boom-city.css').stale === true && chk.filter((a) => a.stale).length === 1,
    'a rule added to the source makes the served CSS stale and the page stale (the hash in the URL is the emitted file\'s)');
  writeAll({ root: tmp });
  check(fs.readFileSync(tCss, 'utf8').includes('.changed{color:red}') && !fs.readFileSync(tCss, 'utf8').includes('a note in the source'), 'the build re-emits the served CSS: the rule is served, the comment is not');
  fs.appendFileSync(tCss, '\n/* by hand */\n');
  check(emitAssets({ root: tmp, check: true }).find((a) => a.name === 'boom-city.css').stale === true && writeAll({ root: tmp, check: true })[0].stale === false,
    'a served copy edited by hand is reported stale by --check, while the page (hashed on the emitted text) is not');
  writeAll({ root: tmp });
  check(fs.readFileSync(tCss, 'utf8') === stripComments(fs.readFileSync(tSrc, 'utf8'), 'css'), 'the next build restores the served copy from the source');
  fs.renameSync(path.join(tmp, 'assets/src', 'boom-onda.js'), path.join(tmp, 'onda.bak'));
  check(throws(() => writeAll({ root: tmp }), /assets\/src\/boom-onda\.js: is missing/) === true, 'a missing source is a refusal that names it, never a page built on a stale served copy');
  fs.renameSync(path.join(tmp, 'onda.bak'), path.join(tmp, 'assets/src', 'boom-onda.js'));
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
  check(!/AWS|SendGrid/.test(pv) && /Firebase/.test(pv) && /Vercel/.test(pv) && /Telegram/.test(pv) && /Anthropic/.test(pv) && /EmailJS/.test(pv) && /City desks \(Amsterdam, Barcelona, London, Madrid, Milan, Valencia\)/.test(pv),
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
  // v1.7 (04/11): the reply ends with the desk url, then one more line for the lead who has decided — the till link
  check(/^Hi Anna, Valentino here from BOOM/.test(reply) && reply.includes('move to Amsterdam') && reply.endsWith(`${CITY_MARKETS.amsterdam.url}\nIf you'd rather start now: ${CITY_MARKETS.amsterdam.url}#pay-full-search`) && !reply.includes('/apartments') && !/Roma/.test(reply),
    'the pre-written WhatsApp reply is English, about Amsterdam, links /amsterdam and then /amsterdam#pay-full-search ("If you\'d rather start now") — never the Rome catalogue');
  check((reply.match(/#pay-/g) || []).length === 1 && reply.split('\n').length === 4, 'the till link is one line, the last, once');
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
  check(waReply.endsWith(`${CITY_MARKETS.madrid.url}\nIf you'd rather start now: ${CITY_MARKETS.madrid.url}#pay-full-search`), 'the WhatsApp-born lead of a selling desk gets the same till link');
  for (const s of ['paris', 'berlin']) {
    const wl = cityReplyText({ market: s, name: 'Ana', intent: 'city_waitlist', message: '' });
    check(wl.length > 40 && !/#pay-|call/i.test(wl) && wl.includes(CITY_MARKETS[s].url), `${s} (waitlist): the ready reply never carries #pay- (no till exists) nor "call"`, wl);
  }
  check(!/#pay-/.test(cityReplyText({ market: 'amsterdam', name: 'Bo', paid: true, city: { serviceLabel: 'Full Search' } })) && !/#pay-/.test(cityReplyText({ market: 'amsterdam', name: 'Bo', city: { abandoned: true, serviceLabel: 'Full Search' } })),
    'the paid and the abandoned-checkout replies never carry #pay-');
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


// ── THE HUB (BOOM Desks, /desks, 03/11/2026): every desk on one page,
// built from the same JSONs, refusing instead of lying ─────────────────────
{
  console.log('\n  \x1b[1mTHE HUB\x1b[0m  /desks — the board, the map, the fares, the rules, the questions, the fact sheet');
  const HUBT = read('cities/_hub.html');
  const HUBJ = JSON.parse(read('cities/_hub.json'));
  const LIVE = SLUGS.filter((s) => CITY[s].live === true);
  const DRAFT = SLUGS.filter((s) => CITY[s].live !== true);
  check(typeof renderHub === 'function' && typeof buildHub === 'function' && HUB_WEIGHT_KB && HUB_BUDGET && typeof orgNode === 'function' && typeof serviceNode === 'function' && HUB_FILE === 'desks.html' && HUB_PATH === '/desks',
    'build-cities.mjs exports renderHub, buildHub, HUB_WEIGHT_KB, HUB_BUDGET, orgNode and serviceNode (HUB_FILE desks.html, HUB_PATH /desks)');
  // the caps, set once with the hub, never raised to fit
  check(HUB_WEIGHT_KB.total <= 78 && HUB_WEIGHT_KB.page <= 28 && HUB_WEIGHT_KB.css <= 6 && HUB_WEIGHT_KB.js <= 6
    && HUB_BUDGET.body <= 980 && HUB_BUDGET.prose <= 740 && HUB_BUDGET.instr <= 280 && HUB_BUDGET.first <= 120 && HUB_BUDGET.lead <= 30 && HUB_BUDGET.node <= 24 && HUB_BUDGET.dd <= 45 && HUB_BUDGET.faqA <= 42
    && HUB_BUDGET.board <= 120 && HUB_BUDGET.map <= 90 && HUB_BUDGET.fares <= 230 && HUB_BUDGET.rules <= 160 && HUB_BUDGET.faq <= 70 && HUB_BUDGET.brief <= 240,
    'the hub\'s caps are where the spec set them (78 KB gz: page 28, CSS 6, JS 6; 980 words: prose 740, instruments 280; first screen 120; sections board 120 · map 90 · fares 230 · rules 160 · faq 70 · brief 240)');
  const HB = buildHub({ root: R, pages });
  const W = writeAll({ root: R, check: true });
  const wHub = W.find((x) => x.file === 'desks.html');
  check(wHub && !wHub.stale && fs.readFileSync(path.join(R, 'desks.html'), 'utf8') === HB.html && HB.html.includes(GENERATED_MARK) && W.filter((x) => x.file !== 'desks.html').length === 8,
    'writeAll(--check) covers desks.html next to the eight desks; the committed page is what the data builds and carries the GENERATED mark');
  check(buildAll({ root: R }).length === 8, 'buildAll() still returns the eight desk pages only');
  check(HB.weight.totalKb <= HUB_WEIGHT_KB.total && HB.weight.pageKb <= HUB_WEIGHT_KB.page && HB.weight.cssKb <= HUB_WEIGHT_KB.css && HB.weight.jsKb <= HUB_WEIGHT_KB.js,
    `desks.html: ${HB.weight.totalKb.toFixed(1)} KB gz first-party (≤ ${HUB_WEIGHT_KB.total}) · the page ${HB.weight.pageKb.toFixed(1)} (≤ ${HUB_WEIGHT_KB.page}) · boom-desks.css ${HB.weight.cssKb.toFixed(1)} · boom-desks.js ${HB.weight.jsKb.toFixed(1)} (≤ 6 each)`);
  check(HB.words <= HUB_BUDGET.body && HB.prose <= HUB_BUDGET.prose && HB.instr <= HUB_BUDGET.instr && Object.entries(HB.sections).every(([k, v]) => v <= HUB_BUDGET[k]),
    `desks.html: ${HB.words} words at load (prose ${HB.prose} · instruments ${HB.instr}); per section ${Object.entries(HB.sections).map(([k, v]) => `${k} ${v}/${HUB_BUDGET[k]}`).join(' · ')}`);
  const H = HB.html, V = visibleText(H);
  const sm = read('sitemap.xml');
  const lastmod = (sm.match(/<loc>https:\/\/www\.boomrome\.com\/desks<\/loc>\s*<lastmod>([\d-]+)<\/lastmod>/) || [])[1];

  // head
  const title = (H.match(/<title>([^<]*)<\/title>/) || [])[1] || '';
  const desc = (H.match(/<meta name="description" content="([^"]*)"/) || [])[1] || '';
  check(title.length <= 62 && title === HUBJ.meta.title && desc.length >= 110 && desc.length <= 165 && desc.includes('Amsterdam, Barcelona, London, Madrid, Milan and Valencia'),
    `head: title ${title.length} ≤ 62 characters, description ${desc.length} in 110–165 naming the live desks ("${desc.slice(0, 60)}…")`);
  check(H.includes('<link rel="canonical" href="https://www.boomrome.com/desks">') && H.includes('<link rel="alternate" hreflang="en" href="https://www.boomrome.com/desks">') && H.includes('<link rel="alternate" hreflang="x-default" href="https://www.boomrome.com/desks">')
    && /<meta name="robots" content="index, follow/.test(H) && !/noindex/.test(H.slice(0, 4000)), 'head: canonical /desks, hreflang en and x-default to itself, robots index');
  {
    const og = (H.match(/<meta property="og:image" content="([^"]+)"/) || [])[1] || '';
    const png = fs.readFileSync(path.join(R, 'og-desks.png'));
    const isPng = png.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
    check(/^https:\/\/www\.boomrome\.com\/og-desks\.png\?v=[0-9a-f]{10}$/.test(og) && isPng && png.readUInt32BE(16) === 1200 && png.readUInt32BE(20) === 630 && png.length <= 120 * 1024,
      `og-desks.png is a real 1200×630 PNG (${Math.round(png.length / 1024)} KB ≤ 120), its URL carries the content hash`);
    const gen = read('design/pages-deco/genera-og-cities.py');
    const keys = [...gen.matchAll(/hub\['(\w+)'\]\['(\w+)'\]/g)].map((m) => `${m[1]}.${m[2]}`);
    check(/--hub/.test(gen) && keys.length && keys.every((k) => k.split('.').reduce((o, x) => (o == null ? undefined : o[x]), HUBJ) !== undefined) && /c\.get\('live'\) is True/.test(gen) && !/price/.test(gen.slice(gen.indexOf('def card_hub'), gen.indexOf('lavoro = []'))),
      `the card generator (--hub) reads only _hub.json keys that exist (${keys.join(', ')}), the live codes, no price`);
  }

  // JSON-LD
  const blocks = [...H.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((m) => JSON.parse(m[1]));
  const crumb = blocks.find((b) => b['@type'] === 'BreadcrumbList');
  const g = (blocks.find((b) => b['@graph']) || {})['@graph'] || [];
  const ldOf = (h) => [...h.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((m) => JSON.parse(m[1])).flatMap((b) => b['@graph'] || [b]);
  check(blocks.length === 2 && crumb && crumb.itemListElement.length === 2 && crumb.itemListElement[1].item === 'https://www.boomrome.com/desks' && crumb.itemListElement[0].item === 'https://www.boomrome.com/',
    'JSON-LD: two blocks; the breadcrumb runs Home → BOOM Desks and ends on the canonical');
  const org = g.find((n) => n['@type'] === 'RealEstateAgent');
  const orgAms = ldOf(PAGE.amsterdam).find((n) => n['@type'] === 'RealEstateAgent');
  check(org && JSON.stringify(org) === JSON.stringify(orgAms) && JSON.stringify(org) === JSON.stringify(orgNode(shared, SLUGS.map((s) => CITY[s]))),
    'the organization node deep-equals the one amsterdam.html declares (orgNode, one function)');
  const list = g.find((n) => n['@type'] === 'ItemList');
  check(list && list.numberOfItems === LIVE.length && LIVE.length === 6 && list.itemListElement.map((x) => x.url.split('/').pop()).join() === LIVE.join() && list.itemListElement.every((x, i) => x.position === i + 1 && x.item['@id'] === `https://www.boomrome.com/${LIVE[i]}#service`),
    `the ItemList lists the live desks in order (${LIVE.join(', ')}), numberOfItems 6, each pointing at its desk's #service`);
  const svcs = g.filter((n) => n['@type'] === 'Service');
  const svcDiff = LIVE.filter((s) => { const a = svcs.find((n) => n['@id'] === `https://www.boomrome.com/${s}#service`); const b = ldOf(PAGE[s]).find((n) => n['@type'] === 'Service'); return !a || !b || JSON.stringify(a) !== JSON.stringify(b); });
  check(svcs.length === LIVE.length && !svcDiff.length, `each of the ${LIVE.length} Services deep-equals the Service of its own desk page, Offers and refund rule included`, svcDiff.join(', '));
  const cp = g.find((n) => n['@type'] === 'CollectionPage');
  check(cp && JSON.stringify(cp.speakable.cssSelector) === JSON.stringify(['.hub-lead', '.enbref']) && cp.dateModified === lastmod && cp.dateModified === HB.dateModified && cp.hasPart.map((x) => x['@id']).join() === LIVE.map((s) => `https://www.boomrome.com/${s}#page`).join(),
    `the CollectionPage: speakable .hub-lead and .enbref, dateModified ${cp && cp.dateModified} = the sitemap <lastmod> (${lastmod}), hasPart the live desks' pages`);
  const faqLd = g.find((n) => n['@type'] === 'FAQPage');
  const unesc = (x) => x.replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
  const vq = [...H.matchAll(/<details><summary><span class="qn" aria-hidden="true">\d\d<\/span> <span class="t">([^<]*)<\/span><\/summary><p>([^<]*)<\/p><\/details>/g)].map((m) => [unesc(m[1]), unesc(m[2])]);
  check(faqLd && vq.length === 6 && JSON.stringify(faqLd.mainEntity.map((q) => [q.name, q.acceptedAnswer.text])) === JSON.stringify(vq),
    'the FAQPage is the six visible questions and answers, word for word');
  {
    const notFaq = g.filter((n) => n['@type'] !== 'FAQPage').concat([crumb]);
    const strs = (v) => (typeof v === 'string' ? [v] : v && typeof v === 'object' ? Object.values(v).flatMap(strs) : []);
    const hit = notFaq.flatMap(strs).filter((s) => /\b(?:Berlin|Paris|berlin|paris|BER|PAR)\b/.test(s));
    check(!hit.length && !/"areaServed":[^\]]*(?:Berlin|Paris)/.test(H), 'no desk that is not open in the structured nodes (organization, page, list, Services, breadcrumb) nor in areaServed', hit.join(' | ').slice(0, 160));
  }

  // the board
  const rows = [...H.matchAll(/<tr class="db-r (live|off|hub)" id="(db-[a-z]+)"[\s\S]*?<\/tr>/g)];
  check(rows.map((m) => m[2]).join() === 'db-ams,db-bcn,db-lon,db-mad,db-mil,db-vlc,db-ber,db-par,db-rom', `the board: nine rows in order (${rows.map((m) => m[2]).join(', ')})`);
  check(rows.filter((m) => m[1] === 'live').every((m) => { const s = m[0].match(/data-desk="([a-z]+)"/)[1]; return m[0].includes(`<a class="db-go" href="/${s}">${CITY[s].city}</a>`) && m[0].includes(`data-dw="${s}">${esc(deskHoursText(CITY[s].desk))}</span>`); })
    && rows.filter((m) => m[1] === 'off').every((m) => !/<a\b|data-desk/.test(m[0])) && /<a class="db-go" href="\/">Rome<\/a>/.test(rows[8][0]) && !/data-desk/.test(rows[8][0]),
    'live rows link /<slug> with the static hours (deskHoursText); the not-open rows have no link and no data-desk; ROM links / with no clock');
  check(rows.filter((m) => m[1] === 'live').map((m) => (m[0].match(/from <b>([^<]+)<\/b>/) || [])[1]).join() === '€149,€149,£149,€149,€149,€149' && /ITALIAN LAW · AS ROME/.test(rows[4][0]) && !/ITALIAN LAW/.test(rows.filter((m, i) => i !== 4).map((m) => m[0]).join('')),
    'live "from" prices: €149, London £149; the Milan row carries ITALIAN LAW · AS ROME, no other row does');
  check(rows.filter((m) => m[1] === 'off').every((m) => /<span class="db-sub">Not open<\/span>/.test(m[0]) && /data-instr>NOT OPEN</.test(m[0]) && !/[€£]|\d{2}:\d{2}|partner|opening/i.test(visibleText(m[0]))),
    'Berlin and Paris read "Not open" / NOT OPEN: no price, no hour, no partner, no opening');
  check(/<h1 id="h1"><span class="h1a">A rental agent on your side, in<\/span> <span class="sr">Europe<\/span><\/h1>\n\s*<p class="board-row" aria-hidden="true"><span class="board" id="hubBoard" data-word="EUROPE" style="--n:6"><\/span><\/p>/.test(H)
    && visibleText(sliceOf(H, '<h1', '</h1>') + '</h1>').trim() === 'A rental agent on your side, in Europe', 'the H1 reads "A rental agent on your side, in Europe"; the EUROPE board sits outside it, served empty');
  check([...H.matchAll(/<[^>]*\sdata-(?:clk|dw|nsr)="[^"]*"[^>]*>/g)].every((m) => /data-nosnippet/.test(m[0])) && [...H.matchAll(/data-(?:clk|nsr)="[a-z]+"><\/span>/g)].length === 18,
    'every clock, window and status span carries data-nosnippet; the clocks (board and pin cards) and statuses are served empty (the script fills them)');

  // the map (v1.7, the Horizon)
  const svg = sliceOf(H, '<svg class="hz"', '</svg>');
  const hubArcs = [...svg.matchAll(/<path class="arc" id="arc-([a-z]{3})" data-k="\1" style="--s:url\(#ga-\1\)" pathLength="1" fill="none" d="([^"]+)"\/>/g)].map((m) => [m[1], m[2]]);
  const gold = (s) => (PAGE[s].match(/<path class="arc me" data-k="[a-z]{3}" pathLength="1" fill="none" d="([^"]+)"\/>/) || [])[1];
  check(hubArcs.length === LIVE.length && hubArcs.every(([k, d]) => { const s = LIVE.find((x) => CITY[x].iata.toLowerCase() === k); return s && d === gold(s) && d === HZ.arcs.get(CITY[s].iata).d && svg.includes(`<linearGradient id="ga-${k}" gradientUnits="userSpaceOnUse"`); }),
    `the map draws one arc per live desk, lit from Rome by its own gradient, each with the SAME d as that desk's gold arc on its own page (${hubArcs.map(([k]) => k).join(', ')})`);
  check(svg.startsWith(`<svg class="hz" viewBox="${HZ.view.join(' ')}" aria-hidden="true" focusable="false">`) && DRAFT.every((s) => { const [x, y] = HZ.cam.xy(CITY[s].geo); return svg.includes(`<circle class="d off" cx="${x}" cy="${y}" r="3" fill="none"/>`); }) && !hubArcs.some(([k]) => ['ber', 'par'].includes(k)) && !/id="hzd-(?:ber|par)"/.test(svg),
    'Berlin and Paris are hollow dots at their real coordinates, with no arc and no glow');
  check(/<circle class="hub" [^>]*r="5" fill="none"\/>/.test(svg) && /<circle class="hub-r" [^>]*r="10" fill="none"\/>/.test(svg) && /<circle class="hub-r r2" [^>]*r="16" fill="none"\/>/.test(svg) && /<text class="m-l hub"[^>]*>ROM<tspan class="hb"> · HUB<\/tspan><\/text>/.test(svg),
    'Rome wears its two rings and the label ROM · HUB');
  check(LIVE.every((s) => { const [x, y] = HZ.cam.xy(CITY[s].geo), k = CITY[s].iata.toLowerCase(); return svg.includes(`<g class="dk" id="hzd-${k}"><circle class="gl" cx="${x}" cy="${y}" r="15"/><circle class="lr" cx="${x}" cy="${y}" r="6" fill="none"/><circle class="d" cx="${x}" cy="${y}" r="3"/></g>`); }),
    'every live desk is a dot with its ring and a glow the script lights while the desk is open');
  {
    const [vx, vy, vw, vh] = HZ.view;
    const pins = [...H.matchAll(/<a class="pin[^"]*" id="pin-([a-z]{3})" href="\/([a-z]+)" style="--x:([\d.]+)%;--y:([\d.]+)%"/g)];
    const ok2 = pins.length === LIVE.length && pins.every((m) => { const [x, y] = HZ.cam.xy(CITY[m[2]].geo); return CITY[m[2]].live && Math.abs(+m[3] - (x - vx) / vw * 100) < 0.06 && Math.abs(+m[4] - (y - vy) / vh * 100) < 0.06; });
    check(ok2, `pins for the live desks only, at the projected --x/--y inside the cropped frame (${pins.map((m) => `${m[1]} ${m[3]}/${m[4]}`).join(' · ')})`);
    // 44px targets: no two pins overlap on a 390px phone nor on a 320px one (HUB_MAP_PX: the drawn width, the column minus the box's two 1px borders)
    check(HUB_MAP_PX[390] === 356 && HUB_MAP_PX[320] === 286, 'HUB_MAP_PX: 356px at 390, 286px at 320');
    for (const [w, px] of Object.entries(HUB_MAP_PX)) {
      let min = 1e9, pair = '';
      for (const a of LIVE) for (const b of LIVE) if (a < b) { const A = HZ.cam.xy(CITY[a].geo), B = HZ.cam.xy(CITY[b].geo); const d = Math.hypot(A[0] - B[0], A[1] - B[1]) * px / vw; if (d < min) { min = d; pair = `${CITY[a].iata}–${CITY[b].iata}`; } }
      check(min >= 44, `on a ${w}px phone (map ${px}px) the closest pins (${pair}) are ${min.toFixed(1)}px apart: 44px targets never overlap`);
    }
    const arcs = LIVE.map((s) => ({ key: CITY[s].iata, d: HZ.arcs.get(CITY[s].iata).d }));
    check(hzViolations(arcs, SLUGS.map((s) => ({ key: CITY[s].iata, xy: HZ.cam.xy(CITY[s].geo), r: ARC_DOT_R }))).length === 0, 'no arc on the hub passes over a desk it does not serve (hzViolations = 0)');
    const rules = sliceOf(H, '<style>.hmap:has(#pin-', '</style>');
    check(LIVE.every((s) => rules.includes(`.hmap:has(#pin-${CITY[s].iata.toLowerCase()}:is(:hover,:focus-visible,.sel)) #arc-${CITY[s].iata.toLowerCase()}{stroke:var(--gold);stroke-width:2;opacity:1}`)) && !/animation|@keyframes|comet/.test(rules),
      'a pin lights its own arc (one generated :has rule per live desk, the tapped pin .sel included); the flight is the script\'s, no CSS animation');
    // the coast: Natural Earth in degrees (cities/_europe.json rings) inside the camera's window, projected at build time
    check(EUROPE && Array.isArray(EUROPE.rings) && EUROPE.rings.length > 50 && EUROPE.rings.every((r) => Array.isArray(r) && r.length >= 6 && r.length % 2 === 0 && r.every((n, i) => typeof n === 'number' && (i % 2 ? n >= EUROPE.window[1] && n <= EUROPE.window[3] : n >= EUROPE.window[0] && n <= EUROPE.window[2])))
      && /Natural Earth/.test(EUROPE.source) && /^https:\/\/raw\.githubusercontent\.com\/nvkelso\/natural-earth-vector\//.test(EUROPE.url) && /^\d{4}-\d{2}-\d{2}$/.test(EUROPE.generated) && /degrees/.test(EUROPE.projection) && !('path' in EUROPE) && !('desk' in EUROPE),
      'cities/_europe.json: the coast in degrees (lon, lat rings inside the camera\'s window), with its provenance (Natural Earth, the raw URL, the date); the projected paths are gone');
    const gen = read('design/pages-deco/genera-europa.mjs');
    check(/const RADICE = path\.dirname\(path\.dirname\(QUI\)\);/.test(gen) && /import \{ clipRect, dpRing, ringArea \} from '\.\.\/\.\.\/build-cities\.mjs';/.test(gen) && gen.includes(`const EPS = ${EUROPE.simplify.douglasPeucker}, MIN_AREA = ${EUROPE.simplify.minRingArea}, DECIMALS = ${EUROPE.simplify.decimals};`) && gen.includes(`export const WINDOW = [${EUROPE.window.join(', ')}];`) && !fs.existsSync(path.join(R, 'design/pages-deco/genera-europa.py')),
      'design/pages-deco/genera-europa.mjs derives its root from its own file, clips and simplifies with the build\'s own helpers, and runs the simplification the JSON declares; the projected-path generator is gone');
    check(/<path id="hzCoast" d="M-?\d+ -?\d+l[-\d ]+z/.test(svg) && /<rect class="land" width="640" height="520" fill="url\(#hzDots\)" clip-path="url\(#hzLc\)"\/><use class="coast" href="#hzCoast"\/>/.test(svg) && svg.indexOf('class="land"') < svg.indexOf('<path class="arc'),
      'the hub map draws the land as a dot matrix clipped to the projected coast, plus one hairline, under the arcs');
    check((svg.match(/<g class="hz-nite"><\/g>/g) || []).length === 1 && !/<image\b|hz-term|hz-pl/.test(svg), 'the night layer is served EMPTY and no plane is in the static HTML: the hour and the script draw them');
    const hzData = JSON.parse((H.match(/<script type="application\/json" class="hz-data">([\s\S]*?)<\/script>/) || [])[1] || '{}');
    check(Array.isArray(hzData.c) && hzData.c.length === 15 && JSON.stringify(hzData.v) === JSON.stringify(HZ.view) && JSON.stringify(hzData.d) === JSON.stringify(hzCal(LIVE.map((s) => CITY[s]))) && Object.keys(hzData.d).length === LIVE.length && hzData.d.vlc.h === 'es-vlc' && hzData.d.lon.z === 'Europe/London',
      'the hub\'s data script carries the camera, the crop and the six live desks\' calendar facts');
    check(!/comet|cm-[a-z]{3}|hmap-svg/.test(H) && !/comet/.test(read('assets/boom-desks.css')) && /<symbol id="boomPlane" viewBox="0 0 24 24">/.test(H), 'the comet is gone (page and boom-desks.css); the hub carries the plane symbol the script flies');
  }

  // the onda (P4, v1.7): the desk pages' canvas script, versioned in its URL; the hub's script loads
  // it at every width after load, when idle; the beat rises from the EUROPE board (#hubBoard) at every width, and it loops
  // only while a desk is open (boom-desks.js says so each minute)
  {
    const cfg = JSON.parse((H.match(/window\.BOOM_DESKS = (\{[\s\S]*?\});\s*<\/script>/) || [])[1] || '{}');
    const ondaHash = crypto.createHash('sha256').update(fs.readFileSync(path.join(R, 'assets/boom-onda.js'))).digest('hex').slice(0, 10);
    check(cfg.ONDA === `/assets/boom-onda.js?v=${ondaHash}` && /<canvas class="onda" id="onda" aria-hidden="true"><\/canvas>/.test(H) && H.indexOf('id="onda"') < H.indexOf('<main'),
      `the hub carries the onda canvas and its versioned script URL (${cfg.ONDA})`);
    const djs = read('assets/boom-desks.js');
    check(/requestIdleCallback\(onda/.test(djs) && !/\|\| !big\.matches\) return;/.test(djs) && /BOOM_ONDA\.start\(cv, \{ origin: function \(\) \{ return \$\('hubBoard'\); \}, open: anyOpen \}\)/.test(djs) && !/#db-rom \.db-code/.test(djs) && /BOOM_ONDA\.setOpen\(any\)/.test(djs),
      'boom-desks.js loads the onda when idle at every width — the heartbeat rises from the EUROPE board at every width (ROM\'s row sits below the ≤1000px canvas on a desktop) — and tells it each minute whether a desk is open');
    check(/new window\.BoomSolari\.Board\(h, 6, DRUM\)/.test(djs) && /if \(!f \|\| f\.w === word\) return;/.test(djs) && /set\(nb, w\.open \? 'OPEN' : 'CLOSED'\)/.test(djs),
      'DESK NOW: a 6-cell flap board beside the text the script keeps, flipping only when the word changes');
  }

  // the fares
  {
    const { CITY_PLANS } = await import('../../api/_market.js');
    const fa = sliceOf(H, '<section class="sec" id="fares"', '</section>');
    const tk = [...fa.matchAll(/<li class="hft" id="hf-([a-z-]+)">[\s\S]*?<\/ul>[\s\S]*?<\/li>/g)];
    check(tk.length === 3 && tk.every((m) => m[0].includes(`<b>€${CITY_PLANS[m[1]].eur}</b>`) && m[0].includes(`£${CITY_PLANS[m[1]].eur} at the London desk`)), 'three tickets, each with the price CITY_PLANS charges, in € and (the London desk) in £');
    const ucf = (s) => s.charAt(0).toLowerCase() + s.slice(1);
    check(Object.entries(HUBJ.fares.plans).every(([id, p]) => p.lines.every((l) => CITY_PLANS[id].desc.includes(ucf(l)) || CITY_PLANS[id].desc.includes(l))), 'every ticket line is a line the server sells (a substring of CITY_PLANS.desc)');
    check(sliceOf(fa, 'id="hf-full-search"', '</li>\n').includes(`<p class="refund">${esc(shared.refund.rule)}</p>`) && !/data-pay|<button/.test(fa), 'the refund rule sits inside the Full Search ticket; no button, no data-pay');
    check(fa.indexOf('class="hnote es"') > -1 && fa.indexOf('class="hnote es"') < fa.search(/[€£]\d/) && /In Barcelona, Madrid and Valencia every fare is optional, chosen in writing \(LAU art\. 20\)\./.test(fa),
      'the Spain note (LAU art. 20) names exactly the Spanish live desks and comes before the first price');
    check(LIVE.every((s) => fa.includes(`<a href="/${s}#fares"><b data-instr>${CITY[s].iata}</b> ${CITY[s].city}</a>`)) && fa.includes('<a class="lnk" href="/withdrawal">'), 'the gates send each reader to /<slug>#fares; the 14-day strip item links the model form');
  }

  // the rules
  {
    const ru = sliceOf(H, '<section class="sec" id="rules"', '</section>');
    check(LIVE.every((s) => ru.includes(`<th scope="col"><a href="/${s}#checks">`) && PAGE[s].includes('id="checks"')), 'one column per live desk, its header linking /<slug>#checks (an id that exists on that page)');
    const held = Object.keys(HUBJ.rules.hold), cut = HUBJ.rules.cut;
    check(held.every((k) => { const [s, id] = k.split(':'); const c = CITY[s].checks.items.find((x) => x.id === id); return ru.includes(`<a class="rc held" href="/${s}#check-${id}"><span class="rc-t">${esc(c.title)}</span></a>`) && !ru.includes(`href="/${s}#check-${id}"><span class="rc-at"`); }),
      `the ${held.length} held checks show their title only (no label, no sentence)`);
    // the one string the hub never prints: why each check is held (a lawyer unblocks it by removing the key)
    for (const k of held) console.log(`      · held ${k}: ${HUBJ.rules.hold[k]}`);
    const plain = LIVE.flatMap((s) => CITY[s].checks.items.filter((k) => !HUBJ.rules.hold[`${s}:${k.id}`]).map((k) => [s, k]));
    check(plain.every(([s, k]) => ru.includes(`<a class="rc" href="/${s}#check-${k.id}"><span class="rc-at" data-instr>${esc(k.at)}</span></a>`)), 'every other cell is the desk\'s own `at` label, verbatim, linking its check');
    check(/<td data-k="AMS"><span class="rc none" aria-hidden="true">—<\/span><span class="sr">Not one of the Amsterdam checks<\/span><\/td>/.test(sliceOf(ru, '<th scope="row">Who may charge you</th>', '</tr>')), 'Amsterdam has no fees check: its cell is "—" with a screen-reader sentence, never an invented rule');
    check(plain.every(([s, k]) => { const t = (cut[`${s}:${k.id}`] || []).reduce((x, c) => x.split(c).join(''), k.text).replace(/\s+/g, ' ').trim(); return ru.includes(`<dd>${esc(t)}</dd>`); }) && !ru.includes('Agents still ask for three.'),
      'the full sheet: each shown check\'s sentence, minus the cut sentences (Amsterdam\'s "Agents still ask for three. We don\'t let them." is gone)');
    const country = sliceOf(ru, '<th scope="row">Country</th>', '</tr>');
    check(LIVE.every((s) => country.includes(`<td data-k="${CITY[s].iata}">${COUNTRY_NAME[CITY[s].country]}`)) && /Italy <span class="rc-tag" data-instr>same law as BOOM Rome<\/span>/.test(country), 'the Country row is derived (COUNTRY_NAME); Italy carries "same law as BOOM Rome"');
  }

  // the questions, the fact sheet, the footer
  check(vq.every(([, a]) => words(a) <= 42) && vq.some(([q]) => q === 'Is BOOM Milan a real estate agency?'), 'six questions, every answer ≤ 42 words; "Is BOOM Milan a real estate agency?" is one');
  {
    const br = sliceOf(H, '<dl class="enbref" id="enbref">', '</dl>');
    const fees = sliceOf(br, '<dt>Fees</dt>', '</dd>');
    check(br && !sliceOf(H, 'id="brief"', 'id="enbref"').includes('<details') && fees.includes(esc(shared.refund.rule)) && /at the London desk £500, £199 and £149/.test(fees)
      && br.includes(`<time datetime="${HB.dateModified}">`) && !(visibleText(br).match(RATING_RE) || []).length,
      'the fact sheet is open; its Fees row carries the refund rule and the London figures; Updated is <time datetime> = dateModified; no rating in it');
    check(/Amsterdam<\/a>, <a class="lnk" href="\/barcelona">Barcelona<\/a>[\s\S]*<a class="lnk" href="\/milan">Milan<\/a> and <a class="lnk" href="\/valencia">Valencia<\/a>\. Berlin and Paris desks are not open\./.test(br), 'Open in: the live desks linked, then "Berlin and Paris desks are not open." (no link)');
  }
  check(/<p class="stmt">Every BOOM desk acts solely for the tenant/.test(H) && LIVE.every((s) => sliceOf(H, '<nav aria-label="Desks">', '</nav>').includes(`<a href="/${s}">BOOM ${CITY[s].city}</a>`)) && /© 2026 BOOM <span class="mono" aria-hidden="true">· DESKS · TENANT SIDE · OPERATED BY EGIDI IMMOBILIARE<\/span>/.test(H),
    'the footer: the statement, the live desks and BOOM Rome, legal, the company');
  check(!/id="till"|data-pay|stripe|wa\.me|"CHECKOUT"/i.test(H) && (H.match(/on Google in Rome/g) || []).length === 1, 'no till, no Stripe word, no WhatsApp link on the hub; the Rome rating once');
  check(HB.warnings.length === 0, 'the hub builds with no warning (every optional item has its value)', HB.warnings.join(' | '));

  // ── the refusals (§1.7), each proven by mutating the real data or the template ──
  const hubRender = (mutHub = () => {}, mutCity = null, tpl = HUBT, sh = shared) => {
    const hub = clone(HUBJ); mutHub(hub);
    const cities = SLUGS.map((s) => { const c = clone(CITY[s]); if (mutCity) mutCity(c); return c; });
    return renderHub({ template: tpl, shared: sh, hub, cities, assetVersion: { css: 'testcss000', desksCss: 'testdcss00', desksJs: 'testdjs000' }, frags, root: R, weigh: false });
  };
  const hubRefuses = (mutHub, re, t, mutCity = null, tpl = HUBT) => { const r = throws(() => hubRender(mutHub, mutCity, tpl), re); check(r === true, t, r === true ? '' : r); };
  check(throws(() => hubRender(), /^$/) === 'did not throw', '(the real data renders through renderHub with the test asset versions)');
  hubRefuses((h) => { h.brief.rows[0].dd = 'See <a href="/paris">Paris</a>'; }, /links a desk that is not open/, 'a fact-sheet row linking /paris is refused (a desk not open is named, never linked)');
  hubRefuses((h) => { h.brief.rows[0].dd = 'See <b>this</b>.'; }, /carries markup: hub copy is plain text/, 'markup in hub copy is refused (it would print as text; the links are derived)');
  hubRefuses((h) => { h.rules.note += ' (art. 1590 c.c.)'; }, /"art\. 1590" .* is a statute no live desk's check names/, 'a statute no live desk checks (art. 1590 c.c.) is refused');
  hubRefuses((h) => { h.faq.items[3].a += ' Desk OPEN now.'; }, /the static HTML says a desk is open or closed \("OPEN"\)/, 'a FAQ answer saying "Desk OPEN now." is refused (only the script, from the calendar, says it; FAQ 1 is at its 42 words, so FAQ 4 carries it)');
  hubRefuses((h) => { h.faq.items[0].a = 'Full Search {price:full-search} at every desk.'; }, /€500 stands without the refund rule in its own block/, 'a FAQ answer with {price:full-search} and no {refund} is refused (€500 without the rule)');
  hubRefuses(() => {}, /check amsterdam:noise is in no comparison row/, 'an Amsterdam check in no comparison row is refused', (c) => { if (c.slug === 'amsterdam') c.checks.items.push({ id: 'noise', title: 'Noise', at: 'quiet hours', text: 'Quiet hours apply.' }); });
  hubRefuses((h) => { h.rules.hold['london:nope'] = 'a reason long enough'; }, /rules\.hold\["london:nope"\] is not a check of a live desk/, 'a hold on a check that does not exist is refused');
  hubRefuses((h) => { h.rules.hold['london:fees'] = 'tbd'; }, /needs its reason/, 'a hold without its reason is refused');
  hubRefuses((h) => { h.rules.cut['amsterdam:deposit'] = ['Agents ask for four.']; }, /every sentence cut must occur verbatim/, 'a cut sentence that is not in the check is refused');
  hubRefuses((h) => { h.hero.lead = h.hero.lead.replace('One Italian agency', 'One worldwide agency'); }, /a scope word .*"worldwide"/, 'the lead saying "worldwide" is refused');
  hubRefuses((h) => { h.fares.plans['full-search'].lines[0] = 'Guaranteed home in 30 days'; }, /types a number|not a line the server sells/, 'a ticket line "Guaranteed home in 30 days" is refused (not a substring of CITY_PLANS, and a typed number)');
  hubRefuses((h) => { h.fares.plans['full-search'].lines[0] = 'Guaranteed home in thirty days'; }, /is not a line the server sells/, 'a ticket line the server does not sell is refused');
  hubRefuses((h) => { h.map.caption = 'We have 40 clients a month.'; }, /types a number/, 'a number typed in hub copy is refused (numbers come from tokens)');
  hubRefuses((h) => { h.faq.items[0].a = 'Ask {unknown}.'; }, /unknown or empty token \{unknown\}/, 'an unknown token is refused');
  hubRefuses((h) => { h.meta.extra = 'x'; }, /meta\.extra is a key the hub does not read/, 'a key the hub does not read is refused');
  hubRefuses((h) => { h.map.caption = 'Paris: book a call.'; }, /a sentence that names a desk not open promises a call/, 'a sentence naming Paris with a call is refused');
  hubRefuses((h) => { h.map.caption = 'Every desk answers from Rome, our office in Madrid too.'; }, /a presence claim outside Rome/, 'a presence claim outside Rome is refused');
  hubRefuses((h) => { h.map.caption = 'Every desk answers from Rome; RAICV listed.'; }, /a licence the desks do not hold/, 'a Valencian registry claim (RAICV) on the hub is refused');
  hubRefuses((h) => { h.map.caption = 'Seven desks, one company.'; }, /"Seven desks" is not the live count/, 'a desk count that is not the live count is refused');
  hubRefuses((h) => { h.map.caption = 'Rated well: ★ by tenants.'; }, /the Rome rating appears exactly once/, 'a second rating is refused');
  hubRefuses((h) => { h.footer.statement += ' Paid through Stripe.'; }, /no till/, 'a Stripe word on the hub is refused');
  hubRefuses((h) => { h.brief.rows[0].dd += ' VAT IT12345678901.'; }, /"VAT 12345678901" is not the company's VAT number/, 'a VAT number other than the entity\'s is refused');
  hubRefuses((h) => { h.updated = '2026-11-05'; }, /must be the same date/, 'a dateModified that is not the sitemap <lastmod> is refused');
  hubRefuses(() => {}, /the fares differ at the London desk/, 'a live desk whose fares differ is refused ("same at every desk")', (c) => { if (c.slug === 'london') c.pricing.plans[1].price = 189; });
  hubRefuses(() => {}, /needs one desk\.person/, 'two different people answering is refused', (c) => { if (c.slug === 'milan') c.desk.person = 'Anna Rossi'; });
  hubRefuses(() => {}, /"What we don't do" must say/, 'a live desk whose "What we don\'t do" does not cover the hub\'s claim is refused', (c) => { if (c.slug === 'madrid') c.bref.rows.find((r) => r.dt === "What we don't do").ddHtml = 'We don\'t list homes.'; });
  {
    // the not-open row, forged with an hour and a price, through the template
    const tpl = HUBT.replace('{{{boardHtml}}}', '{{{boardHtml}}}\n<table><tr class="db-r off" id="db-xxx"><td>Paris 09:00 from €149</td></tr></table>');
    const r = throws(() => hubRender(() => {}, null, tpl), /a "not open" row carries/);
    check(r === true, 'a "not open" row with an hour and a price is refused', r === true ? '' : r);
  }
  {
    const tpl = HUBT.replace('<p class="hub-lead">{{lead}}</p>', '<p class="hub-lead">{{lead}}</p><p>Desk open until 19:00</p>');
    const r = throws(() => hubRender(() => {}, null, tpl), /the static HTML says a desk is open or closed/);
    check(r === true, 'a static "desk open until" in the template is refused', r === true ? '' : r);
    const r2 = throws(() => hubRender(() => {}, null, HUBT.replace('<p class="hub-lead">{{lead}}</p>', '<p class="hub-lead">{{lead}}</p><span data-clk="london"></span>')), /a live instrument without data-nosnippet/);
    check(r2 === true, 'a clock without data-nosnippet is refused', r2 === true ? '' : r2);
  }
  {
    // with drafts gone the {drafts} token is empty: refused, never an empty sentence
    const r = throws(() => renderHub({ template: HUBT, shared, hub: clone(HUBJ), cities: SLUGS.filter((s) => CITY[s].live).map((s) => clone(CITY[s])), assetVersion: {}, frags, root: R, weigh: false }), /unknown or empty token \{drafts\}/);
    check(r === true, 'with no desk not open, a sentence that names {drafts} is refused (never an empty name)', r === true ? '' : r);
  }
  // a REA typed in a city JSON is refused by renderCity (the identity guard is shared)
  refuses((c) => { c.bref.rows[0].ddHtml = c.bref.rows[0].ddHtml.replace('REA RM-1710623', 'REA RM-1234567'); }, /"REA RM-1234567" is not the company's REA/, 'milan: a "Who" row with REA RM-1234567 is refused by renderCity', 'milan');
  // the mutation that must NOT be refused: no home-country desk drops the home items, with warnings
  {
    let out = null, err = '';
    try { out = hubRender(() => {}, (c) => { if (c.slug === 'milan') c.country = 'XX'; }); } catch (e) { err = e.message; }
    check(out && !/class="m-card home"/.test(out.html) && !/ITALIAN LAW · AS ROME/.test(out.html) && !/Is BOOM Milan a real estate agency/.test(out.html) && !/<dt>Milan<\/dt>/.test(out.html) && !/<b data-instr>Languages<\/b>/.test(out.html) && !/same law as BOOM Rome/.test(out.html)
      && out.warnings.filter((w) => /dropped/.test(w)).length === 4 && out.warnings.every((w) => /dropped|no name in COUNTRY_NAME/.test(w)) && /<td data-k="MIL"><span class="rc none" aria-hidden="true">—<\/span><span class="sr">Country not stated<\/span>/.test(out.html),
      `milan with country "XX": the Milan card, the tag, FAQ 5, the fact-sheet row and the Languages item are dropped, with warnings, its country cell reads "—", and the hub builds (${out ? out.warnings.length : 0} warnings)`, err);
  }
  // budgets bite
  {
    const save = HUB_BUDGET.brief; HUB_BUDGET.brief = 100;
    const r = throws(() => hubRender(), /the #brief section is \d+ words at load, over its 100/);
    HUB_BUDGET.brief = save;
    check(r === true, 'a section over its cap is refused (the brief at 100)', r === true ? '' : r);
    const save2 = HUB_BUDGET.dd; HUB_BUDGET.dd = 20;
    const r2 = throws(() => hubRender(), /a fact-sheet answer is \d+ words, over 20/);
    HUB_BUDGET.dd = save2;
    check(r2 === true, 'a fact-sheet answer over its cap is refused', r2 === true ? '' : r2);
    // the node rule alone: the body cap is lifted for this one render (the hub
    // sits near its 980, and a long paragraph must be refused for its length)
    const saveB = HUB_BUDGET.body, saveP = HUB_BUDGET.prose; HUB_BUDGET.body = 5000; HUB_BUDGET.prose = 5000;
    const r3 = throws(() => hubRender((h) => { h.map.rome.p = 'Where the company lives and works every single working day of the week, with homes to rent, owners, leases, papers and keys, in a city that every desk answers from.'; }), /a text node over 24 words/);
    HUB_BUDGET.body = saveB; HUB_BUDGET.prose = saveP;
    check(r3 === true, 'a paragraph over 24 words is refused (the node rule)', r3 === true ? '' : r3);
  }
  // hoursSentence and hubText
  check(hoursSentence(LIVE.map((s) => CITY[s])) === 'Monday to Friday, 09:00–19:00 Rome time; the London desk 08:00–18:00 London time', `hoursSentence: "${hoursSentence(LIVE.map((s) => CITY[s]))}"`);
  check(hubText('{homeCity} x', { homeCity: '' }, 't') === null && throws(() => hubText('{nope}', {}, 't'), /unknown or empty token/) === true, 'hubText: an optional token with no value drops the item; an unknown one is refused');

  // the hub on the site: sitemap, redirects, cache, llms, footers
  const vj = JSON.parse(read('vercel.json'));
  const ccOf = (p) => (vj.headers || []).filter((h) => new RegExp(`^${h.source}$`).test(p)).reduce((v, h) => { const x = h.headers.find((k) => k.key.toLowerCase() === 'cache-control'); return x ? x.value : v; }, null);
  const hashed = [...new Set([...H.matchAll(/(?:https:\/\/www\.boomrome\.com)?(\/[A-Za-z0-9_./-]+)\?v=[0-9a-f]{6,}/g)].map((m) => m[1]))];
  check(['/assets/boom-desks.css', '/assets/boom-desks.js', '/assets/boom-city.css'].every((p) => hashed.includes(p)) && hashed.every((p) => /immutable/.test(ccOf(p) || '')), `every content-hashed asset the hub asks for is served immutable (${hashed.join(', ')})`);
  check((vj.redirects || []).some((r) => r.source === '/(cities|boom-desks)' && r.destination === '/desks' && r.permanent === true), '/cities and /boom-desks redirect permanently to /desks');
  check(lastmod === HB.dateModified, `the sitemap lists /desks with <lastmod> ${lastmod} = dateModified`);
  const llms = read('llms.txt');
  check(/^## BOOM Desks \(tenant-side rental desks in Europe: Amsterdam, Barcelona, London, Madrid, Milan and Valencia\)$/m.test(llms) && llms.includes('- [BOOM Desks](https://www.boomrome.com/desks):') && !/BOOM Cities/.test(llms) && llms.includes('Paris and Berlin desks are not open.') && /BOOM Milan is the home-country desk/.test(llms),
    'llms.txt: the section is "BOOM Desks", /desks first, Milan the home-country desk; "BOOM Cities" gone; the "not open" sentence kept');
  const FOOT8 = ['index.html', 'apartments.html', 'try.html', 'your-money.html', 'how-it-works.html', 'apartment-detail.html', 'design/pages-deco/pt.html', 'design/pages-deco/patch-lotto2.py'];
  const noHub = FOOT8.filter((f) => { const s = read(f); const i = s.search(/<a href="\/desks(?:\.html)?">BOOM Desks · Europe<\/a>/); return i < 0 || i > s.search(/<a href="\/amsterdam(?:\.html)?">/); });
  check(!noHub.length, 'the eight "Company & Markets" footers link /desks ("BOOM Desks · Europe"), just above Amsterdam', noHub.join(', '));
  check(read('.vercelignore').split('\n').map((l) => l.trim()).includes('cities/'), 'the hub\'s template and copy (cities/) stay off the site');
}

console.log(`\n  ${ok} passed, ${ko} failed`);
process.exit(ko ? 1 : 0);
