// tests/cities/run.mjs — the city pages are built from data, on the REAL
// BOOM system, and the build must refuse rather than print something wrong
// (BOOM_CITIES_BRIEF.md §2, §10; brand rules STUDIO_EXECUTIVE_UIX.md).
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
//   - a city switched to live:true with [NAME] copy, a fake config value or
//     no social card on disk (the guard must bite, and must not bite a clean page);
//   - a desk without its list prices, or a waitlist desk with a till (14/10,
//     v1.1 of the brief: every desk shows the prices; shown is not charged —
//     a waitlist page carries no Stripe word, no sheet, CHECKOUT false, and
//     the server refuses the POST);
//   - the FAQ schema or the Offers saying something the page doesn't show;
//   - the build overwriting a root page it did not generate;
//   - the lead endpoint filing a city lead into the Rome machine, or the
//     Commerciale drafting a Rome reply to someone moving to Amsterdam;
//   - the page fattening again (14/10: "the client is going to receive too
//     much information"): the hero column, the door, a plate, the checks or
//     the body over its word budget; the service back in a dropdown; the
//     fact sheet (machine content) above the FAQ;
//   - the sisters drifting (14/10 evening): a desk selling at prices other
//     than the brief's, a waitlist desk (Barcelona, Paris, Berlin) saying its
//     prices are charged today, a live page linking a draft sister; the
//     server's registry disagreeing with a page on the desk's mode, its
//     prices or whether its till is open;
//   - the Check-in (v1.2, 15/10 — the plan finder + the papers + the pass,
//     BOOM_CITIES_BRIEF §6 module B) saying a plan its rules do not: three
//     taps that end in no plan, a rule on a plan the page does not sell, a
//     dossier that is not eight documents, a till button without its price,
//     a share text without its link, a FAQ answer written by hand where the
//     build derives it; the Check-in outside section 02 or counted as a
//     ninth block; the rail without its sections; the server dropping the
//     answers the page collected.
//
// No browser, no network: the real build functions on the real data, and
// the real /api/city-lead handler on a Firestore in memory.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  buildAll, renderCity, writeAll, fill, findPlaceholders, fragments, familyFor, BuildError, esc, eur, GENERATED_MARK, CELL_EM,
  checkinAnswer, offerAudience, faqOf, DOSSIER_N
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

console.log('\n\x1b[1m▸ cities\x1b[0m  the city pages: built from data on the BOOM system, refusing instead of lying');

const dir = path.join(R, 'cities');
const template = read('cities/_template.html');
const shared = JSON.parse(read('cities/_shared.json'));
const ams = JSON.parse(read('cities/amsterdam.json'));
const assetVersion = { css: 'testcss000', js: 'testjs0000' };
const frags = fragments(R);
const render = (city, sh = shared, tpl = template, root = R) => renderCity({ template: tpl, shared: sh, city, assetVersion, frags, root });

// ── 1 · the committed pages are exactly what the data builds ─────────────
const pages = buildAll({ root: R });
check(pages.length >= 1, `${pages.length} city page(s) built from cities/*.json`);
for (const p of pages) {
  const f = path.join(R, p.file);
  const cur = fs.existsSync(f) ? fs.readFileSync(f, 'utf8') : null;
  check(cur === p.html, `${p.file} is up to date with its data`,
    cur === null ? 'missing — run npm run build:cities' : 'stale — run npm run build:cities (never edit the generated file)');
}

// ── 2 · the Amsterdam page, as built: the BOOM system, the BOOM voice ────
const page = pages.find((p) => p.slug === 'amsterdam');
const html = page ? page.html : '';
check(page && !/\{\{\{?\s*[\w.]+\s*\}\}\}?/.test(html), 'amsterdam: no unresolved {{token}} in the output (the inlined JS has its own }} — a token is {{word}})');
check(html.includes(GENERATED_MARK), 'amsterdam: carries the GENERATED mark (the overwrite guard depends on it)');
check(ams.live === false && /<meta name="robots" content="noindex">/.test(html.slice(0, 4000)),
  'amsterdam is a draft (live:false) and says noindex in the first 4000 chars (tests/seo rule 8 reads exactly there)');
const canon = (html.match(/<link rel="canonical" href="([^"]+)"/) || [])[1];
check(canon === `${shared.siteUrl}/amsterdam`, `canonical comes from siteUrl: ${canon}`);
check(/^https:\/\/www\.boomrome\.com$/.test(shared.siteUrl),
  'siteUrl is the canonical host www.boomrome.com (the apex redirects; a canonical must not point at a redirect)');

// the system
const sys = html.indexOf('<link rel="stylesheet" href="/css/boom-2026.css">');
const cityCss = html.search(/<link rel="stylesheet" href="\/assets\/boom-city\.css\?v=[0-9a-f]{10}">/);
check(sys > -1 && cityCss > sys, 'the page is a BOOM 2026 page: css/boom-2026.css first, the city layer after it');
check(/<script src="\/assets\/boom-city\.js\?v=[0-9a-f]{10}"><\/script>/.test(html),
  'the city JS is linked with a content hash (a changed asset changes the page: --check catches a forgotten rebuild)');
check(!/#D4AF37/i.test(html) && !/#D4AF37/i.test(read('assets/boom-city.css')) && !/#D4AF37/i.test(read('assets/boom-city.js')),
  'the portal gold #D4AF37 never appears: the public site is #FFD700 (STUDIO_EXECUTIVE_UIX)');
check(!/<link[^>]+fonts\.googleapis/.test(html) && !/font-family:\s*[^;]*(Georgia|serif)/i.test(read('assets/boom-city.css')),
  'no Google Fonts stylesheet, no serif: Helvetica Neue from the system, as every BOOM page');
const solari = read('design/pages-deco/solari-engine.html').trimEnd();
check(html.includes(solari) && html.includes('<!-- BOOM_SOLARI:START') && html.includes('window.BoomSolari'),
  'the Solari engine is inlined from its single source, byte for byte (design/pages-deco/solari-engine.html)');
check(html.includes('<!-- BOOM_SCROLL:START -->') && html.includes(read('css/boom-scroll.css')) && html.includes(read('js/boom-scroll.js')),
  'the scroll contract is inlined from css/boom-scroll.css + js/boom-scroll.js between the markers every public page carries');
check(html.includes('<svg class="logo-mark" aria-hidden="true"><use href="#boomMark"/></svg>') && html.includes('<symbol id="boomMark"'),
  'the real BOOM mark (the sound rings) — never a hand-drawn spiral');
check(html.includes('class="bl-desk">Amsterdam<br>tenant side</span>'), 'the lockup BOOM │ AMSTERDAM · TENANT SIDE, the one new brand element');
check(html.includes('class="fam"') && html.includes('<a class="on" href="/amsterdam" aria-current="page">Amsterdam</a>') && !/<a href="\/amsterdam">/.test(html),
  'the family strip: the city on, the rest of the suite beside it, never itself twice');
for (const sel of ['class="tech-bg"', 'class="scroll-progress"', 'class="mouse-glow"', 'class="filecard"', 'class="refline"', 'class="machine"', 'class="steps"', 'class="tline"', 'class="sibs plates"', 'class="flows"', 'class="truth"', 'class="enbref" id="enbref"', 'class="faq"', 'class="band rv"', 'class="paybar"']) {
  check(html.includes(sel), `the Executive v4 grammar is on the page: ${sel}`);
}

// the Solari in the title: the city, letter by letter, with the space reserved
check(html.includes(`<span id="flapCity" class="flap-city flap-scale" aria-label="Amsterdam">AMSTERDAM</span>`),
  'the title carries the city as the board word, plain text in the markup (reads without JS)');
check(html.includes(`f.style.minWidth='${(9 * CELL_EM).toFixed(2)}em'`) && html.includes("f.style.minHeight='1.27em'"),
  `the hero reserves 9 cells × ${CELL_EM}em before the board lands (no layout jump)`);
const flaps = [...html.matchAll(/<span class="flap-prezzo flap-scale" data-p="([^"]+)" aria-label="[^"]*">([^<]+)<\/span>/g)];
check(flaps.length === 3 && flaps.every((m) => m[1] === m[2]) && JSON.stringify(flaps.map((m) => m[1])) === JSON.stringify(ams.pricing.plans.map((p) => eur(p.price))),
  'every price is a Solari board: data-p for the mount, the same text in the node for no-JS');

// the voice: an established desk, not a launch page
const visible = html.replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]+>/g, ' ');
check(!/founding|cohort|spots? (left|remaining)|locked for life|refundable|€99|deposit of €|no worries|unlock|seamless|hassle-free/i.test(visible),
  'no founding spot, no cohort, no €99 deposit, no fluff words: the desk is open (BOOM_CITIES_BRIEF §5, the founder\'s brief)');
check(!/web3forms|buy\.stripe\.com|fbq\(|connect\.facebook/i.test(html) && !/web3forms|buy\.stripe\.com|fbq|js\.stripe\.com/i.test(read('assets/boom-city.js')),
  'no third-party form service, no Stripe payment link, no Stripe.js, no Meta pixel: the form and the till post to our own API');
const copy = JSON.stringify(ams);
check(!/[a-z.]!["\s]/i.test(copy), 'no exclamation marks in the city copy (BOOM_CITIES_BRIEF §5 copy rules)');

// the word budget: a landing client scans, they do not read. Measured on
// 14/10 after the diet (hero column 71→51 words, main 1233→1117, plates
// 53/42/41→47/39/41, checks 178→153): the ceilings sit just above, so the
// page cannot fatten again without this suite saying so. FAQ answers are
// folded behind <details> and excluded from the body budget.
const wordsOf = (s) => s.replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/&[a-z#0-9]+;/g, ' ')
  .split(/\s+/).filter((w) => /[A-Za-z0-9€]/.test(w)).length;
const slice = (h, a, b) => { const i = h.indexOf(a); const j = h.indexOf(b, i); return i < 0 || j < 0 ? '' : h.slice(i, j); };
// The door is what is read BEFORE acting: the form, up to its end states.
// "Your file is open" and the paid landing are hidden until they are true
// (the client never reads them next to the form), so they are excluded from
// the body like the folded FAQ answers, and capped on their own.
// The Check-in (v1.2) is a conversation, not a block: one step shown at a
// time, the documents after the third answer, the ticket and the pass only
// once there is a plan. Nobody reads it top to bottom, so it is measured on
// its own ceiling (210–220 words on 15/10) and left out of the body — the
// same treatment as the end states. The FAQ question it adds stays in the
// body: Paris and Berlin lost six words of copy that day to keep the 950.
const BUDGET = { heroColumn: 60, door: 110, state: 70, plate: 50, checks: 170, body: 950, checkin: 230 };
const stateBlocks = (m) => [...m.matchAll(/<div class="sent(?: paid)?" id="f(?:Done|Paid)">[\s\S]*?\n        <\/div>/g)].map((x) => wordsOf(x[0]));
const checkinOf = (m) => slice(m, '<div class="checkin" id="checkin"', '<div class="sibs plates">');
for (const p of pages) {
  const m = slice(p.html, '<main id="main">', '</main>');
  const hero = wordsOf(slice(p.html, '<header class="hero">', '<!-- THE DOOR'));
  const door = wordsOf(slice(p.html, '<div class="filecard">', '<div class="sent" id="fDone">'));
  const states = stateBlocks(m);
  const plates = [...m.matchAll(/<article class="sib[\s\S]*?<\/article>/g)].map((x) => wordsOf(x[0]));
  const checksW = wordsOf(slice(m, '<div class="flows">', '</section>'));
  const faqA = [...m.matchAll(/<div class="a">([\s\S]*?)<\/div>/g)].reduce((n, x) => n + wordsOf(x[1]), 0);
  const ckW = wordsOf(checkinOf(m));
  const body = wordsOf(m) - faqA - states.reduce((a, b) => a + b, 0) - ckW;
  check(hero > 0 && hero <= BUDGET.heroColumn, `${p.slug}: the hero column is ${hero} words (≤ ${BUDGET.heroColumn}) — title, one line, two proofs`);
  check(door > 0 && door <= BUDGET.door, `${p.slug}: the door reads in ${door} words (≤ ${BUDGET.door})`);
  check(states.length >= 1 && states.every((w) => w > 0 && w <= BUDGET.state), `${p.slug}: each end state of the door ≤ ${BUDGET.state} words (${states.join(' · ')})`);
  check(plates.length === 3 && plates.every((w) => w <= BUDGET.plate), `${p.slug}: every plate ≤ ${BUDGET.plate} words (${plates.join(' · ')})`);
  check(checksW > 0 && checksW <= BUDGET.checks, `${p.slug}: the six checks in ${checksW} words (≤ ${BUDGET.checks})`);
  check(ckW > 0 && ckW <= BUDGET.checkin, `${p.slug}: the Check-in — steps, documents, ticket, pass — in ${ckW} words (≤ ${BUDGET.checkin}), shown one step at a time`);
  check(faqA > 0 && body <= BUDGET.body, `${p.slug}: the page without the folded FAQ answers, the end states and the Check-in is ${body} words (≤ ${BUDGET.body})`);
}

// the door
check(html.includes('<form id="cityForm" novalidate') && read('assets/boom-city.js').includes("fetch(C.LEAD_ENDPOINT || '/api/city-lead'")
  && html.includes('"LEAD_ENDPOINT": "/api/city-lead"'), 'the form posts to /api/city-lead');
check(/<input id="fCompany" name="company"[^>]*tabindex="-1"[^>]*aria-hidden="true">/.test(html)
  && !/<label[^>]*>[^<]*ompany/.test(html), 'the honeypot is a hidden field named company, and no visible field shares the name');
const visibleFields = (html.match(/<(input|select|textarea) id="f(Name|Email|MoveIn|Budget)"/g) || []).length;
const chips = [...html.matchAll(/<label class="chip( unsure)?"><input type="radio" name="service" value="([^"]+)"><span><b>([^<]*)<\/b><small>([^<]*)<\/small><\/span><\/label>/g)];
check(visibleFields === 4 && chips.length === ams.pricing.plans.length + 1 && html.indexOf('class="fld chips"') < html.indexOf('<details class="more">'),
  `four visible fields + the service chips, the rest behind "More details" (${visibleFields} fields, ${chips.length} chips)`);
check(!/fService/.test(html) && !/fService/.test(read('assets/boom-city.js')) && /input\[name="service"\]:checked/.test(read('assets/boom-city.js')),
  'the service is never a dropdown: the three doors and their price are read without a tap, and the JS reads the checked chip');
check(!/<input type="radio" name="service"[^>]*checked/.test(html), 'no chip is pre-checked: the service is the client\'s choice, or "service to decide"');
check(html.includes('<details class="more">') && /id="fPhone"[\s\S]*<\/details>/.test(html.slice(html.indexOf('<details class="more">'))),
  'phone, situation, neighbourhoods and the message fold away');
check(html.includes(`href="https://wa.me/${shared.contact.whatsapp}"`) && html.includes(`mailto:${shared.contact.email}`) && !/39X{4,}/.test(html),
  'the WhatsApp and email of the consent line are the real BOOM contacts from _shared.json, never a placeholder number');

// the footer and the entity
const e = shared.entity;
check(html.includes(`<strong>${esc(e.legalName)}</strong><br>${esc(e.address)}<br>Registered office: ${esc(e.registeredOffice)}<br>P.IVA ${esc(e.vat)} · REA ${esc(e.rea)}`)
  && html.includes(`<div class="footer-tm">${esc(e.trademark)}</div>`),
  'the footer prints the shared legal entity verbatim — the same block as executive.html');
check(html.includes(`<p class="footer-statement">${esc(ams.footer.statement)}</p>`), 'the tenant-side statement (aanhuurmakelaar) is in the footer');
check(html.includes('footer-status-dot') && html.includes(esc(ams.footer.status)), 'the status dot says the desk is operational');

// ── 3 · JSON-LD says what the page shows ──────────────────────────────────
const blocks = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((m) => JSON.parse(m[1]));
check(blocks.length === 2, 'two JSON-LD blocks: the breadcrumb and the graph');
const graph = (blocks.find((b) => Array.isArray(b['@graph'])) || {})['@graph'] || [];
const crumbs = blocks.find((b) => b['@type'] === 'BreadcrumbList') || {};
const org = graph.find((n) => n['@type'] === 'Organization') || {};
const wp = graph.find((n) => n['@type'] === 'WebPage') || {};
const svc = graph.find((n) => n['@type'] === 'Service') || {};
const faqLd = graph.find((n) => n['@type'] === 'FAQPage') || {};
check(org['@id'] === `${shared.siteUrl}/#organization` && org.url === shared.siteUrl && org.legalName === e.legalName,
  'Organization @id/url derive from siteUrl (same entity id as the rest of the site)');
check((crumbs.itemListElement || []).length === 2 && crumbs.itemListElement[1].item === `${shared.siteUrl}/amsterdam`, 'BreadcrumbList Home → Amsterdam');
const ids = graph.concat([crumbs]).map((n) => `${n['@type']}|${n['@id'] || n.url || ''}`);
check(new Set(ids).size === ids.length, 'no entity is declared twice (tests/seo: same type + same @id = duplicate)');
const sels = (wp.speakable && wp.speakable.cssSelector) || [];
check(sels.length === 2 && sels.every((s) => html.includes(`class="${s.split(' ').pop().replace('.', '')}`)),
  `speakable selectors exist in the page (${sels.join(', ')})`);
const faqVisible = [...html.matchAll(/<details>\s*<summary>([\s\S]*?)<\/summary>\s*<div class="a">([\s\S]*?)<\/div>\s*<\/details>/g)]
  .map((m) => ({ q: decode(m[1]), a: decode(m[2]) }));
const faqItems = (faqLd.mainEntity || []).map((q) => ({ q: q.name, a: q.acceptedAnswer && q.acceptedAnswer.text }));
check(faqVisible.length === ams.faq.items.length && JSON.stringify(faqVisible) === JSON.stringify(faqItems),
  `FAQPage = the visible FAQ, question AND answer, word for word (${faqItems.length}/${faqVisible.length})`);
const plateIds = [...html.matchAll(/<article class="sib[^"]*" id="plan-([^"]+)">/g)].map((m) => m[1]);
const offers = (svc.offers || []).map((o) => [o.name, o.price]);
check(JSON.stringify(offers) === JSON.stringify(ams.pricing.plans.map((p) => [p.label, String(p.price)]))
  && JSON.stringify(plateIds) === JSON.stringify(ams.pricing.plans.map((p) => p.id)),
  `every Offer is a plate on the page at the price on its board: ${offers.map((o) => o.join(' €')).join(' · ')}`);
const chipPrices = chips.filter((m) => m[2] !== 'unsure').map((m) => [m[2], m[3], m[4]]);
check(chipPrices.length === 3 && chipPrices.every(([id, label, small]) => ams.pricing.plans.some((pl) => pl.id === id && pl.label === label && small.startsWith(eur(pl.price))))
  && chips.some((m) => m[2] === 'unsure' && m[3] === esc(ams.form.service.unsure) && m[4] === esc(ams.form.service.unsureSub)),
  'the chips\' prices come from the plans (one price, one place) + "not sure yet · advise me"');
check(ams.pricing.plans.every((p) => html.includes(`<ul class="inc">${p.includes.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>`)),
  'what each fee buys is a ✓ list on its plate, straight from includes[] — never a paragraph');
check(html.indexOf('id="enbref"') > html.indexOf('id="faq"') && html.indexOf('id="enbref"') < html.indexOf('class="band rv"'),
  'the fact sheet (machine content) sits AFTER the FAQ and before the final band: human content first');
check(html.includes('<a href="/" class="mobile-menu-link">BOOM Rome</a>') && !/Rome · apartments/.test(html),
  'the menu leads to BOOM Rome, never to the Rome catalogue (a tenant landing for Amsterdam is not shopping Rome flats)');
check(html.includes(`<b>Full Search €500</b> · <b>Application Pack €199</b> · <b>Attended Viewing €149</b> per viewing.`),
  'the fact sheet\'s fees row is DERIVED from the plans (the quotable ledger cannot drift)');
check(svc.areaServed && svc.areaServed.name === 'Amsterdam' && svc.audience && svc.audience.audienceType && svc.provider['@id'] === org['@id'],
  'the Service says where, for whom and by whom');
check((svc.offers || []).every((o) => o.availability === 'https://schema.org/InStock' && o.priceSpecification && o.priceSpecification.valueAddedTaxIncluded === true
  && o.priceSpecification.price === o.price && o.url === `${shared.siteUrl}/amsterdam#plan-${ams.pricing.plans.find((p) => p.label === o.name).id}` && o.seller['@id'] === org['@id']),
  'every Offer of a search desk is InStock, VAT included in its priceSpecification, and points at its plate');
check(crumbs['@id'] === `${shared.siteUrl}/amsterdam#breadcrumb` && wp.breadcrumb && wp.breadcrumb['@id'] === crumbs['@id'], 'the WebPage references the BreadcrumbList by id');
check(JSON.stringify(org.areaServed) === JSON.stringify(['Rome']), 'Organization.areaServed is derived: Rome and the LIVE desks only — a draft never lists its city (' + JSON.stringify(org.areaServed) + ')');
{
  const liveAms = clone(ams); liveAms.live = true;
  const g = JSON.parse(render(liveAms).html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)[1].replace(/<\/?script[^>]*>/g, ''))['@graph'];
  check(JSON.stringify(g.find((n) => n['@type'] === 'Organization').areaServed) === JSON.stringify(['Rome', 'Amsterdam']), 'once live, the desk\'s city joins areaServed by itself');
}

// ── 4 · the token engine never prints a hole ──────────────────────────────
check(throws(() => fill('<p>{{nope.here}}</p>', {}, 'x'), /unresolved tokens: nope\.here/) === true,
  'a missing field is a build error that names it, never an empty string');
check(throws(() => fill('<p>{{obj}}</p>', { obj: { a: 1 } }, 'x'), /unresolved tokens: obj/) === true,
  'an object where text is expected is a build error, not "[object Object]"');
check(throws(() => fill('<p>{{ bad-token }}</p>', {}, 'x'), /malformed tokens/) === true,
  'a malformed token cannot slip through as literal braces');
check(fill('<p>{{a}}|{{{a}}}</p>', { a: '<b>"x"</b>' }, 'x') === '<p>&lt;b&gt;&quot;x&quot;&lt;/b&gt;|<b>"x"</b></p>',
  '{{a}} escapes, {{{a}}} is raw');
check(fill('{{n}}·{{e}}', { n: 0, e: '' }, 'x') === '0·', 'zero and empty string are values, not holes');
{
  const evil = clone(ams);
  evil.hero.h1Em = '<img src=x onerror=alert(1)>';
  evil.how.steps[0].s = '</p><script>alert(1)</script>';
  evil.faq.items[0].a = '<script>alert(2)</script>';
  const out = render(evil).html;
  check(!out.includes('<img src=x') && !out.includes('<script>alert(') && out.includes('&lt;img src=x onerror=alert(1)&gt;'),
    'plain fields are escaped in the template AND in the array renderers');
  evil.city = 'Ams</script>';
  const out2 = render(evil).html;
  check(!out2.includes('"CITY": "Ams</script>"') && out2.includes('"CITY": "Ams\\u003c/script>"'), 'config JSON cannot close its <script> tag');
}
check(eur(1500) === '€1,500' && eur(199) === '€199' && eur(12500) === '€12,500', 'prices format deterministically (no toLocaleString)');

// ── 5 · the live guard bites, and only when it should ─────────────────────
{
  const clean = clone(ams); clean.live = true;
  let res = null, err = '';
  try { res = render(clean); } catch (x) { err = x.message; }
  check(res && res.placeholders.length === 0, 'today\'s Amsterdam data would pass the live guard (no placeholder left on the page)', err);
  check(res && !/noindex/.test(res.html) && /content="index, follow/.test(res.html), 'a live page drops noindex and declares index, follow');

  const photo = clone(clean); photo.hero.sub = 'Your person: [PHOTO OF LOCAL OPERATOR].';
  check(throws(() => render(photo), /\[PHOTO OF LOCAL OPERATOR\]/) === true, 'live:true with bracketed copy is refused, naming it');
  const fakeWa = clone(clean); fakeWa.config = { WHATSAPP: '39XXXXXXXXXX' };
  check(throws(() => render(fakeWa), /config\.WHATSAPP = 39XXXXXXXXXX/) === true, 'live:true with a placeholder config value is refused');
  const noOg = fs.mkdtempSync(path.join(os.tmpdir(), 'boom-cities-og-'));
  check(throws(() => render(clean, shared, template, noOg), /og-amsterdam\.png is missing/) === true,
    'live:true without its social card on disk is refused (a card that 404s on every WhatsApp forward)');
  const draftNoOg = clone(ams);
  check(render(draftNoOg, shared, template, noOg).placeholders.join() === 'og-amsterdam.png is missing (python3 design/pages-deco/genera-og-cities.py)',
    'a draft without the card builds, and lists the card as the thing to make');
  fs.rmSync(noOg, { recursive: true, force: true });
}
check(findPlaceholders('<p>[A] ok</p><script>var a=[1,2]</script><style>a[href]{}</style>', { slug: 'amsterdam' }, { root: R }).join() === '[A]',
  'placeholders are read from visible text only (not from scripts, styles or JSON-LD arrays)');

// ── 6 · structural refusals ───────────────────────────────────────────────
{
  const wl = JSON.parse(read('cities/barcelona.json'));
  const wlHtml = render(wl).html;
  check(wlHtml.includes('"CHECKOUT": false') && !wlHtml.includes('id="ov"') && wlHtml.includes('data-p="€500"'),
    'a waitlist city carries its list prices like every desk (v1.1) — and no till');
  const wlTill = clone(wl); wlTill.checkout = true;
  check(throws(() => render(wlTill), /a waitlist city cannot open a checkout/) === true, 'a waitlist city with checkout:true is refused: shown is not charged');
  const amsFlipped = clone(ams); amsFlipped.mode = 'waitlist'; delete amsFlipped.checkout; delete amsFlipped.checkoutCopy;
  check(throws(() => render(amsFlipped), /no Stripe reference/) === true,
    'Amsterdam\'s data flipped to waitlist is refused: its FAQ names Stripe, and a waitlist page carries no Stripe word anywhere, FAQ included');
  const noCopy = clone(ams); delete noCopy.checkoutCopy;
  check(throws(() => render(noCopy), /needs "checkoutCopy"/) === true, 'checkout:true without the sheet\'s copy is refused (no "undefined" on a till)');
  const noSending = clone(ams); delete noSending.form.sending;
  check(throws(() => render(noSending), /needs form\.sending/) === true, 'checkout:true without the in-flight button text is refused');
  const twoFeatured = clone(ams); twoFeatured.pricing.plans[1].featured = true;
  check(throws(() => render(twoFeatured), /at most one plan is featured/) === true, 'two featured plans are refused (the pay bar sells one)');
  const noRefund = clone(ams); noRefund.checkoutCopy.fine = 'Secure card payment by Stripe. Invoice from Egidi Immobiliare S.r.l.';
  check(throws(() => render(noRefund), /must state the refund policy/) === true, 'a till whose sheet drops the refund policy is refused (BOOM policy, 15/10: refunded in full if we decline the search in the first call)');
  const offNoTill = clone(ams); offNoTill.checkout = false;
  check(!/id="ov"|data-pay=/.test(render(offNoTill).html) && render(offNoTill).html.includes('"CHECKOUT": false'), 'checkout:false on a search desk: prices, no sheet, no pay button, the plates lead to the door');
  const bad = clone(ams); bad.mode = 'deposit';
  check(throws(() => render(bad), /"mode" must be "search" or "waitlist"/) === true, 'the old "deposit" mode is gone: an unknown mode is refused');
  const slug = clone(ams); slug.slug = '../index';
  check(throws(() => render(slug), /slug must be/) === true, 'a slug cannot escape the root');
  const live = clone(ams); delete live.live;
  check(throws(() => render(live), /"live" must be true or false/) === true, '"live" must be explicit');
  const dup = clone(ams); dup.pricing.plans[1].id = 'full-search';
  check(throws(() => render(dup), /must be unique/) === true, 'two plans cannot share an id (the chips and the plates key on it)');
  const nolabel = clone(ams); delete nolabel.pricing.plans[2].label;
  check(throws(() => render(nolabel), /needs label, se, name, text, cta/) === true, 'a plan without its label is refused (the Offer and the chips print it)');
  const noinc = clone(ams); noinc.pricing.plans[0].includes = ['one'];
  check(throws(() => render(noinc), /needs includes: 2–5 lines/) === true, 'a plan with fewer than two ✓ lines is refused (a plate must say what the fee buys)');
  const longinc = clone(ams); longinc.pricing.plans[0].includes = ['a', 'b', 'c', 'd', 'e', 'f'];
  check(throws(() => render(longinc), /needs includes: 2–5 lines/) === true, 'and more than five is a paragraph in disguise');
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
  check(throws(() => render(ams, sh), /siteUrl must be/) === true, 'siteUrl with a trailing slash is refused (it would print //amsterdam)');
  const sh2 = clone(shared); sh2.contact.whatsapp = '+39 331';
  check(throws(() => render(ams, sh2), /contact\.whatsapp \(digits only\)/) === true, 'the shared WhatsApp must be digits only (it goes into wa.me/)');
}

// ── 7 · the build never overwrites a page it did not make ────────────────
{
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'boom-cities-'));
  for (const d of ['cities', 'assets', 'css', 'js', 'design/pages-deco']) fs.mkdirSync(path.join(tmp, d), { recursive: true });
  for (const f of ['cities/_template.html', 'cities/_shared.json', 'cities/amsterdam.json', 'assets/boom-city.css', 'assets/boom-city.js',
    'css/boom-scroll.css', 'js/boom-scroll.js', 'design/pages-deco/solari-engine.html']) fs.copyFileSync(path.join(R, f), path.join(tmp, f));
  fs.writeFileSync(path.join(tmp, 'amsterdam.html'), '<!doctype html><title>hand-made</title>');
  check(throws(() => writeAll({ root: tmp }), /not generated by this script — refusing/) === true
    && fs.readFileSync(path.join(tmp, 'amsterdam.html'), 'utf8').includes('hand-made'),
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
  check(['cities/', 'build-cities.mjs', 'BOOM_CITIES_BRIEF.md'].every((x) => ignore.includes(x)),
    '.vercelignore keeps the template (with its {{tokens}}), the build script and the internal brief off the site');
  const og = fs.readFileSync(path.join(R, 'og-amsterdam.png'));
  const isPng = og.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  check(isPng && og.readUInt32BE(16) === 1200 && og.readUInt32BE(20) === 630, 'og-amsterdam.png is a real 1200×630 PNG');
  check(og.length <= 120 * 1024, `og-amsterdam.png stays in the social-card budget (${Math.round(og.length / 1024)} KB ≤ 120)`);
  check((html.match(/og-amsterdam\.png/g) || []).length >= 3, 'the page declares it (og, twitter, primaryImageOfPage)');
}

// ── 9 · the door on the server: a tenant in the right MARKET ─────────────
// Firestore in memory, as every endpoint suite: the REST fetch is intercepted.
let written = [];
globalThis.fetch = async (url, opts = {}) => {
  const u = String(url);
  if (u.includes('identitytoolkit') || u.includes('securetoken')) {
    return { ok: true, status: 200, json: async () => ({ idToken: 'fake', localId: 'admin' }) };
  }
  if (u.includes('firestore.googleapis.com')) {
    if ((opts.method || 'GET') === 'POST') {
      written.push({ url: u, body: JSON.parse(opts.body || '{}') });
      return { ok: true, status: 200, json: async () => ({ name: 'projects/p/databases/(default)/documents/leads/ams123' }) };
    }
    return { ok: true, status: 200, json: async () => ({ documents: [] }) };
  }
  return { ok: true, status: 200, json: async () => ({}) };
};
const { default: handler, bandCeiling, SERVICES } = await import('../../api/city-lead.js');
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
const ANNA = { city: 'amsterdam', name: 'Anna Keller', email: 'anna@example.com', phone: '+31 6 1234 5678', moveIn: 'February 2027',
  budget: '€1,500 – €2,000', service: 'full-search', situation: 'Couple, relocating with employer', areas: 'De Pijp, Oud-West', message: 'Start date is 1 Feb.' };
{
  const r = await call({ ...ANNA, company: 'bot inc' });
  check(r.code === 200 && r.payload.ok === true && r.writes.length === 0, 'the honeypot answers 200 and writes nothing');
}
{
  const r = await call({ ...ANNA, city: 'rome' });
  check(r.code === 400 && r.payload.error === 'unknown_city' && r.writes.length === 0, 'a city outside the closed list is a 400, never a lead filed somewhere invented');
}
{
  const r = await call({ ...ANNA, name: '' });
  check(r.code === 400 && r.payload.error === 'name_required' && r.writes.length === 0, 'no name: refused, nothing written');
  const r2 = await call({ city: 'amsterdam', name: 'Anon' });
  check(r2.code === 400 && r2.payload.error === 'contact_required', 'no email and no phone: refused (we could not reply)');
}
{
  const r = await call(ANNA);
  const l = r.lead;
  check(r.code === 200 && !!l, 'a real applicant enters');
  check(l && l.source === 'web' && l.status === 'new' && l.leadType === 'tenant' && l.intent === 'city_search',
    'schema leads: source web, status new (the Brain sees it), a TENANT — never B2B, never a special branch');
  check(l && l.market === 'amsterdam' && l.sourceRef === 'city-amsterdam' && isCityMarket(l) && cityMarketOf(l) === 'amsterdam',
    'the market is Amsterdam — what api/_market.js reads to keep the Rome machine out');
  check(l && !isReunion(l) && !isB2B(l), 'and it is neither Réunion nor B2B (their guards stay theirs)');
  check(l && /^AMSTERDAM — tenant-side search · Full Search · €1,500 – €2,000\/month · move-in February 2027 · Couple, relocating with employer · De Pijp, Oud-West\. Start date is 1 Feb\.$/.test(l.message),
    'the summary opens with the city and the service, then the numbers, then their words', l && l.message);
  check(l && l.budgetBand === '€1,500 – €2,000' && l.budget === 2000, 'the budget band stays verbatim; the number is the band\'s ceiling, for sorting');
  check(l && l.language === 'en' && l.zone === 'De Pijp, Oud-West' && l.city && l.city.serviceLabel === 'Full Search', 'English by default, areas as zone, the service by its label');
  check(r.notif && /^🇳🇱 AMSTERDAM · Anna Keller · Full Search · €1,500 – €2,000 · February 2027$/.test(r.notif.summary) && r.notif.priority === 'high',
    'the operator is pinged with the flag, the name, the service and the band', r.notif && r.notif.summary);
  const reply = cityReplyText(l);
  check(/^Hi Anna, Valentino here from BOOM/.test(reply) && reply.includes('move to Amsterdam') && reply.endsWith(CITY_MARKETS.amsterdam.url),
    'the pre-written WhatsApp reply is English, about Amsterdam, and links the Amsterdam page');
  check(!reply.includes('/apartments') && !/Roma/.test(reply), '…never the Rome catalogue, never signed BOOM Roma');
  check(reply.includes('I have your dates, budget and situation'), 'it does not ask what the form already answered');
  check(cityLabel(l) === '🇳🇱 Amsterdam', 'the Telegram card label');
}
{
  const r = await call({ city: 'Amsterdam', name: 'Jean', phone: '+33 6 12 34 56 78', service: 'concierge', budget: 'Under €1,500' });
  check(r.code === 200 && r.lead && /^AMSTERDAM — tenant-side search · service to decide · Under €1,500\/month\.$/.test(r.lead.message),
    'an unknown service is "service to decide", never an invented label; the city key is case-insensitive', r.lead && r.lead.message);
  check(r.lead.budget === 1500 && r.lead.city.service === null, 'ceiling of an open band, service null');
  const reply = cityReplyText(r.lead);
  check(/when do you land, who's moving\?/.test(reply) && !/monthly budget/.test(reply), 'the reply asks only what is still missing', reply);
}
{
  check(bandCeiling('€3,500+') === 3500 && bandCeiling('€2.000 – €2.500') === 2500 && bandCeiling('whatever') === null, 'bandCeiling: 3,500+ → 3500, Italian dots → 2500, no digits → null');
  check(Object.keys(SERVICES).length === 4 && SERVICES.unsure === 'not sure yet', 'the service list is closed');
  let last = null;
  for (let i = 0; i < 7; i++) last = await call(ANNA, '10.9.9.9');
  check(last.code === 429 && last.writes.length === 0, 'the seventh send from one IP in ten minutes is 429 and writes nothing');
}
// the Check-in's two hidden fields (v1.2): what the page learned reaches the
// operator in words, on the summary line and on the record — never a code
{
  const ckTxt = "I have a shortlist · In 1–3 months · Still abroad";
  const dsTxt = '3/8 · missing: Employer statement (werkgeversverklaring), Previous landlord reference, A guarantor, if your income falls short, Three months of bank statements, Motivation letter, Dutch and English';
  const r = await call({ ...ANNA, checkin: ckTxt, dossier: dsTxt }, '10.4.0.1');
  check(r.code === 200 && r.lead.message.includes(` · check-in: ${ckTxt} · papers ${dsTxt}. Start date is 1 Feb.`),
    'the Check-in answers and the papers in hand are printed on the summary line, after the numbers and before their words', r.lead && r.lead.message);
  check(r.lead.city.checkin === ckTxt && r.lead.city.dossier === dsTxt && r.lead.raw.checkin === ckTxt && r.lead.raw.dossier === dsTxt, '…and kept on city{} and raw{} for the record');
  const long = await call({ ...ANNA, checkin: 'x'.repeat(500), dossier: 'y'.repeat(500) }, '10.4.0.2');
  check(long.code === 200 && long.lead.city.checkin.length === 80 && long.lead.city.dossier.length === 200, 'both are clipped like every free field from the page (80 / 200)');
  const none = await call(ANNA, '10.4.0.3');
  check(none.code === 200 && !/check-in|papers/.test(none.lead.message) && none.lead.city.checkin === null && none.lead.city.dossier === null,
    'a client who never used the Check-in leaves no trace of it on the lead (no "papers 0/8", no empty label)');
}
{
  const com = read('api/employees/commerciale.js');
  check(/import\s*\{[^}]*isCityMarket[^}]*\}\s*from\s*'\.\.\/_market\.js'/.test(com), 'the Commerciale imports the city guard from the shared rule');
  const guard = com.indexOf('if (isCityMarket(lead)) continue;');
  const draft = com.indexOf('proposeFirstReply(lead');
  check(guard > -1 && draft > -1 && guard < draft, 'the Commerciale stands down BEFORE drafting anything for a city lead', { guard, draft });
  const notif = read('api/telegram/notify-pending.js');
  check(/import\s*\{[^}]*cityReplyText[^}]*\}\s*from\s*'\.\.\/_market\.js'/.test(notif) && /isCityMarket\(l\)\s*\?\s*cityReplyText\(l\)/.test(notif)
    && /isCityMarket\(l\)\s*\?\s*cityLabel\(l\)/.test(notif), 'the Telegram card: the city label and the city reply, before the Rome text');
  check(!isCityMarket({ market: 'roma', intent: 'executive_relocation' }) && !isCityMarket({ market: 'reunion' }) && isCityMarket({ sourceRef: 'city-paris' }),
    'Rome and La Réunion are not city markets; a sourceRef city-<slug> is');
}

// ── 10 · the sisters: Madrid (search) and Barcelona, Paris, Berlin (waitlist) ──
// BOOM_CITIES_BRIEF.md §4 + v1.1 (14/10): every desk shows the brief's list
// prices; a search desk may sell them (checkout:true → the sheet), a
// waitlist desk shows them as list prices charged only when it opens, with
// no till anywhere — page, config, schema. The must-state sentences of §4
// are asserted verbatim.
const mad = JSON.parse(read('cities/madrid.json'));
const bcn = JSON.parse(read('cities/barcelona.json'));
const par = JSON.parse(read('cities/paris.json'));
const ber = JSON.parse(read('cities/berlin.json'));
const pageOf = (slug) => (pages.find((p) => p.slug === slug) || {}).html || '';
const visibleOf = (h) => h.replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]+>/g, ' ');
const ldOf = (h) => [...h.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((m) => JSON.parse(m[1]));
const PNG = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
check(mad.mode === 'search' && bcn.mode === 'waitlist' && par.mode === 'waitlist' && ber.mode === 'waitlist' && [mad, bcn, par, ber].every((c) => c.live === false),
  'madrid is a search desk, barcelona, paris and berlin waitlist desks (brief §4; Berlin: §34c GewO + WoVermRG); all drafts until the founder reviews them on a phone');
for (const [c, word, cells] of [[mad, 'MADRID', 6], [bcn, 'BARCELONA', 9], [par, 'PARIS', 5], [ber, 'BERLIN', 6]]) {
  const h = pageOf(c.slug);
  const v = visibleOf(h);
  check(h.includes(GENERATED_MARK) && /<meta name="robots" content="noindex">/.test(h.slice(0, 4000)) && h.includes(`<link rel="canonical" href="${shared.siteUrl}/${c.slug}">`),
    `${c.slug}: a generated draft — noindex in the first 4000 chars, canonical from siteUrl`);
  check(h.includes(`<span id="flapCity" class="flap-city flap-scale" aria-label="${c.city}">${word}</span>`) && h.includes(`f.style.minWidth='${(cells * CELL_EM).toFixed(2)}em'`),
    `${c.slug}: the board spells ${word} and the hero reserves ${cells} cells × ${CELL_EM}em`);
  check(h.includes(`class="bl-desk">${c.city}<br>tenant side</span>`) && h.includes(`<p class="footer-statement">${esc(c.footer.statement)}</p>`),
    `${c.slug}: the lockup BOOM │ ${word} · TENANT SIDE and the tenant-side statement in the footer`);
  check(!/founding|cohort|spots? (left|remaining)|locked for life|refundable|€99|deposit of €|no worries|unlock|seamless|hassle-free|waitlist open|join the waitlist|coming soon/i.test(v),
    `${c.slug}: no founding spot, no cohort, no counter, no "waitlist open" badge — an established desk, told straight`);
  check(!/[a-z.]!["\s]/i.test(JSON.stringify(c)), `${c.slug}: no exclamation marks in the copy`);
  const og = fs.readFileSync(path.join(R, `og-${c.slug}.png`));
  check(og.subarray(0, 8).equals(PNG) && og.readUInt32BE(16) === 1200 && og.readUInt32BE(20) === 630 && og.length <= 120 * 1024
    && (h.match(new RegExp(`og-${c.slug}\\.png`, 'g')) || []).length >= 3,
    `${c.slug}: og-${c.slug}.png is a real 1200×630 PNG in the social-card budget (${Math.round(og.length / 1024)} KB), declared by the page`);
  const faqV = [...h.matchAll(/<details>\s*<summary>([\s\S]*?)<\/summary>\s*<div class="a">([\s\S]*?)<\/div>\s*<\/details>/g)].map((m) => ({ q: decode(m[1]), a: decode(m[2]) }));
  const faqS = ((ldOf(h).find((b) => Array.isArray(b['@graph'])) || {})['@graph'] || []).find((n) => n['@type'] === 'FAQPage') || {};
  check(faqV.length === c.faq.items.length && JSON.stringify(faqV) === JSON.stringify((faqS.mainEntity || []).map((q) => ({ q: q.name, a: q.acceptedAnswer.text }))),
    `${c.slug}: FAQPage = the visible FAQ, word for word (${faqV.length})`);
}
// Every desk: the brief's three prices, on the boards, in the chips, in the
// fact sheet, in the schema — and equal to the server's own grid, the one
// api/service-checkout.js charges from.
const GRID = ['€500', '€199', '€149'];
for (const c of [ams, mad, bcn, par, ber]) {
  const h = pageOf(c.slug);
  const flaps = [...h.matchAll(/<span class="flap-prezzo flap-scale" data-p="([^"]+)"/g)].map((m) => m[1]);
  check(JSON.stringify(flaps) === JSON.stringify(GRID), `${c.slug}: the three prices on their boards — the brief's grid (§4, v1.1)`);
  const chipsP = [...h.matchAll(/<label class="chip"><input type="radio" name="service" value="([^"]+)"><span><b>[^<]*<\/b><small>(€[\d,]+)/g)].map((m) => m[2]);
  check(JSON.stringify(chipsP) === JSON.stringify(GRID), `${c.slug}: the same three prices in the service chips`);
  check(h.includes('<b>Full Search €500</b> · <b>Application Pack €199</b> · <b>Attended Viewing €149</b> per viewing.'), `${c.slug}: the fact sheet's fees row is derived from the plans`);
  const reg = CITY_MARKETS[c.slug];
  check(!!reg && c.pricing.plans.every((p) => reg.plans && reg.plans[p.id] && reg.plans[p.id].eur === Number(p.price) && reg.plans[p.id].label === p.label),
    `${c.slug}: the page's prices are the server's (CITY_PLANS) — the till can never charge a number the page did not show`);
  check(!!reg && (reg.checkout === true) === (c.checkout === true) && reg.mode === c.mode, `${c.slug}: registry ⇄ page agree on the mode and on whether the till is open`);
}
// Madrid: the search desk, selling
{
  const h = pageOf('madrid'); const v = visibleOf(h);
  const svcM = (ldOf(h).find((b) => Array.isArray(b['@graph']))['@graph']).find((n) => n['@type'] === 'Service');
  check((svcM.offers || []).map((o) => o.price).join() === '500,199,149' && svcM.areaServed.name === 'Madrid' && svcM.offers.every((o) => o.availability === 'https://schema.org/InStock'),
    'madrid: the Service carries its three Offers InStock, areaServed Madrid');
  check(v.includes('You hire us; we do not act for the landlord.'), 'madrid: the brief\'s must-state sentence, verbatim (§4)');
  check(/Ley 12\/2023/.test(v) && /fianza/.test(v) && /padrón/.test(v) && /no regional cap/i.test(v), 'madrid: the §4 facts are the ones on the page — agency costs on the landlord, fianza, padrón, no regional cap');
}
// The two desks that sell: the till on the page, the Rome pattern
for (const c of [ams, mad]) {
  const h = pageOf(c.slug);
  check(c.checkout === true && h.includes('"CHECKOUT": true') && h.includes('"CHECKOUT_ENDPOINT": "/api/service-checkout"') && h.includes(`"FEATURED": "${c.pricing.plans.find((p) => p.featured).id}"`),
    `${c.slug}: the config opens the till and names the featured plan`);
  const rows = [...h.matchAll(/<label class="payrow"><input type="radio" name="payplan" value="([^"]+)" data-eur="(\d+)" data-label="([^"]+)">/g)].map((m) => [m[1], m[2], m[3]]);
  check(/<div class="ov" id="ov" role="dialog" aria-modal="true"/.test(h) && JSON.stringify(rows) === JSON.stringify(c.pricing.plans.map((p) => [p.id, String(p.price), p.label])),
    `${c.slug}: one sheet, the three plans as rows at the plate prices`);
  check(c.pricing.plans.every((p) => h.includes(`<button type="button" class="go" data-pay="${p.id}">${esc(p.cta)} · ${eur(p.price)}</button>`)),
    `${c.slug}: every plate's button opens the sheet on its plan, the price on the button`);
  const f = c.pricing.plans.find((p) => p.featured);
  check(h.includes(`<div class="pinfo"><b>${f.label} · ${eur(f.price)}</b><small>${esc(c.checkoutCopy.paybarSub)}</small></div>`) && h.includes(`<button type="button" class="go" data-pay="${f.id}">${esc(c.paybar.cta)}</button>`),
    `${c.slug}: the phone's pay bar sells the featured plan`);
  check(h.includes('id="payOffer" hidden') && h.includes('id="fPaid"') && h.includes('data-word="PAID"') && h.includes('data-word="OPEN"') && h.includes(`data-sending="${esc(c.form.sending)}"`),
    `${c.slug}: the door's end states — OPEN with the offer to pay, PAID — and the in-flight button text`);
  check(h.includes(esc(c.checkoutCopy.fine)) && /refunded in full if we decline the search in the first call/.test(c.checkoutCopy.fine) && /Stripe/.test(c.checkoutCopy.fine) && /Egidi Immobiliare S\.r\.l\./.test(c.checkoutCopy.fine),
    `${c.slug}: the sheet's fine print says Stripe, the invoicing entity and the refund rule`);
  check(/<p class="alt">[^<]*<a href="#contact" id="ovTalk">/.test(h), `${c.slug}: the sheet keeps the free door one tap away`);
  check(!h.includes('id="ov"') || h.indexOf('id="ov"') > h.indexOf('</main>'), `${c.slug}: the sheet lives outside <main> (it is the till, not page copy)`);
  check(c.faq.items.find((q) => q.q === 'How do I pay?').a.includes('By card on this page (Stripe)'), `${c.slug}: the FAQ says how to pay: card on the page, or transfer against an invoice`);
}
// The waitlist desks — Barcelona, Paris and Berlin: the prices as list prices, no till
for (const [c, mustState, facts, factsLabel] of [
  [bcn, 'Launching with a registered local partner.', [/AICAT/, /índice de referencia/, /fianza/, /padrón/], 'AICAT, the índice de referencia, fianza and padrón'],
  [par, 'Launching with a licensed partner.', [/carte professionnelle/, /loi Hoguet/, /encadrement des loyers/, /Visale/, /justificatif de domicile/], 'carte professionnelle, loi Hoguet, the encadrement des loyers, Visale and the justificatif de domicile'],
  [ber, 'Launching with a licensed partner.', [/§\s?34c GewO/, /Mietpreisbremse/, /Bestellerprinzip/, /Kaution/, /Anmeldung/, /SCHUFA/], '§34c GewO, the Mietpreisbremse, the Bestellerprinzip, Kaution, Anmeldung and SCHUFA'],
]) {
  const h = pageOf(c.slug);
  const v = visibleOf(h);
  check(c.checkout !== true && h.includes('"CHECKOUT": false') && !/id="ov"|data-pay=|id="fPaid"|payOffer/.test(h), `${c.slug}: no till — CHECKOUT false, no sheet, no pay button, no paid state`);
  check(!/stripe/i.test(h), `${c.slug}: no Stripe anywhere (shown is not charged)`);
  check(h.includes(`<p class="pricenote">${esc(c.form.service.priceNote)}</p>`) && /charged only when the desk opens/.test(c.form.service.priceNote),
    `${c.slug}: under the chips, one line: list prices, charged only when the desk opens`);
  check(c.pricing.plans.every((p) => /at opening|on signing/.test(p.per)) && /Nothing is charged today/.test(c.pricing.sub) && (/Nothing is charged until the desk opens|nothing is charged until the desk opens|nothing charged until the desk opens/i.test(c.pricing.note)),
    `${c.slug}: the plates' price lines say "at opening", the section says nothing is charged today`);
  const ld = ldOf(h); const svcW = (ld.find((b) => Array.isArray(b['@graph']))['@graph']).find((n) => n['@type'] === 'Service');
  check((svcW.offers || []).length === 3 && svcW.offers.every((o) => o.availability === 'https://schema.org/PreOrder' && /charged only when the desk opens/.test(o.description) && o.priceSpecification.valueAddedTaxIncluded === true),
    `${c.slug}: the three Offers are PreOrder and say in words that the price is charged only when the desk opens`);
  check(v.includes(mustState), `${c.slug}: the brief's must-state sentence, verbatim (§4): "${mustState}"`);
  check(facts.every((re) => re.test(v)), `${c.slug}: ${factsLabel} are on the page (§4, §5.8)`);
  check(!/No price is shown|Not published yet|Fees published when/.test(v), `${c.slug}: no leftover of the price-less page`);
}
check(/on signing/.test(ber.pricing.plans[0].per) && /signed lease/.test(ber.pricing.note) && /two months' net cold rent plus VAT/.test(ber.pricing.note),
  'berlin: Full Search is due on signing — the WoVermRG rule (fee on a concluded lease, cap two net cold months + VAT, no advances) is on the page, not just in the registry');
// the build keeps shown apart from charged
{
  const stripe = clone(bcn); stripe.bref.rows[0].ddHtml = '<a href="https://buy.stripe.com/x">pay</a>';
  check(throws(() => render(stripe), /no Stripe reference/) === true, 'a waitlist city with a Stripe link is refused');
  const till = clone(bcn); till.checkout = true; till.checkoutCopy = clone(ams.checkoutCopy); till.form.sending = 'x';
  check(throws(() => render(till), /a waitlist city cannot open a checkout/) === true, 'a waitlist city with the till opened is refused even with the sheet\'s copy in place');
  const noPriceW = clone(bcn); delete noPriceW.pricing.plans[0].price;
  check(throws(() => render(noPriceW), /needs a positive price/) === true, 'a waitlist plan without its list price is refused like any other');
  const noPrice = clone(mad); delete noPrice.pricing.plans[0].price;
  check(throws(() => render(noPrice), /needs a positive price/) === true, 'a search city without a price is refused the same way');
  const flipped = clone(bcn); flipped.mode = 'search';
  const fh = render(flipped).html;
  check(fh.includes('"CHECKOUT": false') && !/id="ov"/.test(fh) && fh.includes('data-p="€500"'),
    'flipping Barcelona to "search" keeps its prices and opens no till by itself: the checkout is a second, explicit decision');
}
// the family strip: derived from the built cities, and a live page never links a draft
{
  const A = { slug: 'amsterdam', city: 'Amsterdam', live: true }, B = { slug: 'barcelona', city: 'Barcelona', live: false }, M = { slug: 'madrid', city: 'Madrid', live: true };
  const all = [M, B, A];
  const hrefs = (c) => familyFor(c, all, shared).map((f) => f.href);
  check(JSON.stringify(hrefs(A)) === JSON.stringify(['/madrid', '/']), 'a LIVE page links only its live sisters (alphabetical), then BOOM Rome — never a draft nobody has approved');
  check(JSON.stringify(hrefs(B)) === JSON.stringify(['/amsterdam', '/madrid', '/']), 'a DRAFT page links every sister: the review needs to see the suite');
  check(!hrefs(M).includes('/madrid') && !hrefs(A).includes('/amsterdam'), 'a page is never in its own strip');
  const strip = (pageOf('barcelona').match(/<div class="fam"[\s\S]*?<\/div>/) || [''])[0];
  check(/<a class="on" href="\/barcelona" aria-current="page">Barcelona<\/a>[\s\S]*<a href="\/amsterdam">Amsterdam<\/a>[\s\S]*<a href="\/berlin">Berlin<\/a>[\s\S]*<a href="\/madrid">Madrid<\/a>[\s\S]*<a href="\/paris">Paris<\/a>[\s\S]*<a href="\/">BOOM Rome<\/a>/.test(strip),
    'barcelona (draft): the strip reads Barcelona · Amsterdam · Berlin · Madrid · Paris · BOOM Rome');
}
// the door, per desk: a waitlist lead is a FILE OPENED, said so everywhere the operator reads
{
  const m = await call({ ...ANNA, city: 'madrid', areas: 'Chamberí' }, '10.3.0.1');
  check(m.code === 200 && m.lead.market === 'madrid' && m.lead.intent === 'city_search' && /^MADRID — tenant-side search · Full Search/.test(m.lead.message) && m.notif.summary.startsWith('🇪🇸 MADRID · Anna Keller'),
    'madrid: a search lead — intent city_search, summary head MADRID — tenant-side search, the Spanish flag on the card', m.lead && m.lead.message);
  const rm = cityReplyText(m.lead);
  check(cityMode(m.lead) === 'search' && rm.includes("how we'd run it") && rm.endsWith(CITY_MARKETS.madrid.url) && cityLabel(m.lead) === '🇪🇸 Madrid', 'madrid: the reply promises the search and links /madrid');
  const b = await call({ ...ANNA, city: 'barcelona', areas: 'Gràcia' }, '10.3.0.2');
  check(b.code === 200 && b.lead.market === 'barcelona' && b.lead.intent === 'city_waitlist' && b.lead.city.mode === 'waitlist'
    && /^BARCELONA — waitlist \(desk opening with a registered partner\) · Full Search/.test(b.lead.message),
    'barcelona: a waitlist lead — intent city_waitlist, the summary says the desk is opening, never "search"', b.lead && b.lead.message);
  check(b.notif.summary.startsWith('🇪🇸 BARCELONA · waitlist · Anna Keller') && b.lead.leadType === 'tenant' && isCityMarket(b.lead) && !isReunion(b.lead) && !isB2B(b.lead),
    'barcelona: the Telegram card says waitlist; still a tenant in a city market (the Commerciale stands down, the Rome machine stays out)');
  const rb = cityReplyText(b.lead);
  check(cityMode(b.lead) === 'waitlist' && rb.includes('opening with a registered local partner') && !rb.includes("how we'd run it") && rb.endsWith(CITY_MARKETS.barcelona.url),
    'barcelona: the pre-written reply says the desk is opening and never promises a search it cannot run');
  const p = await call({ ...ANNA, city: 'paris', areas: 'Le Marais' }, '10.3.0.3');
  check(p.code === 200 && p.lead.market === 'paris' && p.lead.intent === 'city_waitlist' && /^PARIS — waitlist \(desk opening with a registered partner\)/.test(p.lead.message)
    && p.notif.summary.startsWith('🇫🇷 PARIS · waitlist · Anna Keller') && cityLabel(p.lead) === '🇫🇷 Paris',
    'paris: a waitlist lead with the French flag, said as waitlist on the summary and the card', p.lead && p.lead.message);
  const rp = cityReplyText(p.lead);
  check(rp.includes('opening with a licensed partner') && !rp.includes('registered local partner') && !rp.includes("how we'd run it") && rp.endsWith(CITY_MARKETS.paris.url),
    'paris: the reply names the LICENSED partner (loi Hoguet), never Barcelona\'s registered one, and promises no search');
  const g = await call({ ...ANNA, city: 'berlin', areas: 'Prenzlauer Berg' }, '10.3.0.4');
  check(g.code === 200 && g.lead.market === 'berlin' && g.lead.intent === 'city_waitlist' && /^BERLIN — waitlist \(desk opening with a registered partner\)/.test(g.lead.message)
    && g.notif.summary.startsWith('🇩🇪 BERLIN · waitlist · Anna Keller') && cityLabel(g.lead) === '🇩🇪 Berlin',
    'berlin: a waitlist lead with the German flag, said as waitlist on the summary and the card', g.lead && g.lead.message);
  const rg = cityReplyText(g.lead);
  check(rg.includes('opening with a licensed partner') && !rg.includes("how we'd run it") && rg.endsWith(CITY_MARKETS.berlin.url),
    'berlin: the reply says the desk is opening with a licensed partner (§34c GewO) and promises no search');
  for (const p of pages) {
    const reg = CITY_MARKETS[p.slug];
    check(!!reg && reg.mode === p.mode, `${p.slug}: the server registry agrees with the page on the desk's mode (${p.mode}) — one word, two places, no drift`);
  }
  // a PAID order (the SERVICE webhook writes paid:true + market): the card's
  // reply acknowledges the money instead of thanking for "your message"
  const paidLead = { market: 'amsterdam', paid: true, name: 'Anna Keller', city: { serviceLabel: 'Full Search' } };
  const rpaid = cityReplyText(paidLead);
  check(isCityMarket(paidLead) && /^Hi Anna, Valentino here from BOOM 👋 Payment received for Full Search in Amsterdam — thank you\./.test(rpaid) && rpaid.endsWith(CITY_MARKETS.amsterdam.url) && !/Thanks for your message/.test(rpaid),
    'a paid city order gets the "payment received" reply, in the right city, with the city link');
}

// ── 11 · THE CHECK-IN (v1.2, 15/10): the plan finder, the papers, the pass ──
// BOOM_CITIES_BRIEF §6 module B, built as the one viral piece of the page:
// three taps → the plan (rules in the data, first match wins), the eight
// documents the city's landlord asks for → how many in hand and what BOOM
// would fix first, a boarding pass to save or post, the answers in a link.
// The same rules write the FAQ answer and the Offers' audience: one copy,
// three readers (the page's JS, the FAQ, the schema) — none can disagree.
{
  const ck = checkinOf(html);
  check(ck && (html.match(/<div class="checkin" id="checkin"/g) || []).length === 1
    && html.indexOf('id="checkin"') > html.indexOf('<section id="services"') && html.indexOf('id="checkin"') < html.indexOf('class="sibs plates"'),
    'the Check-in sits once, inside section 02 and before the plates: the page keeps its eight blocks (STUDIO_EXECUTIVE_CONVERSIONE)');
  for (const s of ams.checkin.steps) {
    const fsHtml = (ck.match(new RegExp(`<fieldset class="ck-step" data-step="${s.id}"( hidden)?>[\\s\\S]*?</fieldset>`)) || [''])[0];
    const opts = [...fsHtml.matchAll(/<label class="ck-opt"><input type="radio" name="ck-(\w+)" value="([a-z]+)" data-code="([^"]+)"><span>([^<]*)<\/span><\/label>/g)]
      .map((m) => [m[1], m[2], m[3], decode(m[4])]);
    const hiddenAtFirst = / hidden>/.test(fsHtml.slice(0, 60));
    check(fsHtml && JSON.stringify(opts) === JSON.stringify(s.options.map((o) => [s.id, o.id, o.code, o.t])) && hiddenAtFirst === (s.id !== 'stage'),
      `checkin step "${s.id}": ${opts.length} radios, each with its pass code, ${s.id === 'stage' ? 'shown first' : 'hidden until the step before is answered'}`);
  }
  const docs = [...ck.matchAll(/<label class="ck-doc"><input type="checkbox" name="ck-doc" value="([a-z]+)"><span>([^<]*)<\/span><\/label>/g)].map((m) => [m[1], decode(m[2])]);
  check(docs.length === DOSSIER_N && JSON.stringify(docs) === JSON.stringify(ams.checkin.dossier.items.map((i) => [i.id, i.t])) && /<fieldset class="ck-step ck-dossier" data-step="dossier" hidden>/.test(ck),
    `the ${DOSSIER_N} documents a Dutch landlord asks for, as checkboxes in the order of the data, hidden until the third answer`);
  check(/<span class="flap-tk flap-scale" id="ckPrice"><\/span>/.test(ck) && !/flap-prezzo/.test(ck),
    'the ticket price is its own board (flap-tk): the three plate boards stay three');
  check(/<button type="button" class="paybtn ck-start" id="ckStart" data-pay="">/.test(ck) && /<a class="ck-file" href="#contact" id="ckFile" data-service="">/.test(ck),
    'on a desk that sells, the ticket\'s first door is the till (data-pay, pointed at the plan at runtime), the second the free file');
  check(ck.includes(`<span class="cto">${ams.iata}</span>`) && ck.includes(`data-word="${ams.city}"`) && ck.includes('id="ckCarta" role="img"')
    && ck.includes('id="ckName" maxlength="24"') && ck.includes('id="ckOrigin" maxlength="12"') && ck.includes(`<b>${esc(ams.checkin.pass.gateValue)}</b>`),
    'the pass: the route lands on the IATA code, the city is a board word, name and origin are capped, the gate says what the desk promises');
  const formHtml = slice(html, '<form id="cityForm"', '</form>');
  check(/<input type="hidden" id="fCheckin" name="checkin" value="">/.test(formHtml) && /<input type="hidden" id="fDossier" name="dossier" value="">/.test(formHtml)
    && formHtml.indexOf('id="fCheckin"') < formHtml.indexOf('id="fCompany"'), 'the door carries two hidden fields — the answers and the papers — before the honeypot');
  const rail = (html.match(/<nav class="rail" aria-label="On this page">[\s\S]*?<\/nav>/) || [''])[0];
  const railIds = [...rail.matchAll(/data-rail="(\w+)"/g)].map((m) => m[1]);
  check(JSON.stringify(railIds) === JSON.stringify(['contact', 'how', 'services', 'checks', 'faq']) && railIds.every((id) => html.includes(`id="${id}"`)),
    'the rail: five dots, one per section, every target an id on the page');
  check(/<noscript><style>[^<]*\.checkin,\.rail\{display:none!important\}/.test(html), 'without JS the Check-in and the rail are hidden: they are behaviour, and the page reads whole without them');
  const cfgAt = html.indexOf('window.BOOM_CITY = ');
  const cfg = JSON.parse(html.slice(cfgAt + 'window.BOOM_CITY = '.length, html.indexOf('</script>', cfgAt)).trim().replace(/;$/, ''));
  check(cfg.IATA === 'AMS' && cfg.PAGE_URL === `${shared.siteUrl}/amsterdam` && JSON.stringify(cfg.CHECKIN) === JSON.stringify(ams.checkin)
    && ams.pricing.plans.every((p) => cfg.PLANS[p.id] && JSON.stringify(cfg.PLANS[p.id].includes) === JSON.stringify(p.includes) && cfg.PLANS[p.id].eur === Number(p.price)),
    'the config carries the IATA code, the page URL (the share link), the Check-in data VERBATIM (the rules the page applies are the rules the FAQ was derived from) and each plan\'s ✓ lines');
  // the derived FAQ: visible, in the schema, equal to what the Check-in says
  const ans = checkinAnswer(ams);
  const q = ams.faq.items.find((x) => x.checkin).q;
  check(q === 'Which service is mine?' && faqVisible.some((f) => f.q === q && f.a === ans) && faqItems.some((f) => f.q === q && f.a === ans),
    `the FAQ "${q}" is DERIVED from the rules — visible on the page and in the FAQPage, the same answer the Check-in gives`);
  const ansWords = ans.split(/\s+/).length;
  check(/^Full Search \(€500\) if you haven't started\. Application Pack \(€199\) if you've found one and need to apply, or you have a shortlist and you're already in Amsterdam\. Attended Viewing \(€149 per viewing\) if you have a shortlist and you're still abroad\. Not sure: open a file, we advise\.$/.test(ans) && ansWords <= 60,
    `one sentence per plan, from the phrases of the options, then the free door (${ansWords} words)`);
  check(faqOf(ams).find((f) => f.q === q).a === ans && ams.faq.items.find((x) => x.checkin).a === undefined, 'the data carries only the question; faqOf resolves the answer');
  // the Offers' audience, third person, from the same rules
  const aud = Object.fromEntries((svc.offers || []).map((o) => [o.name, o.audience && o.audience.audienceType]));
  check(aud['Full Search'] === "Tenants who haven't started" && aud['Attended Viewing'] === 'Tenants who have a shortlist and are still abroad'
    && aud['Application Pack'] === 'Tenants who have found one and need to apply, or who have a shortlist and are already in Amsterdam',
    'every Offer names its audience in the third person, derived from the same rules (' + JSON.stringify(aud) + ')');
  check(ams.pricing.plans.every((p) => offerAudience(ams, p.id) === aud[p.label]) && offerAudience(ams, 'nope') === null, 'offerAudience is the function the schema uses; a plan without a rule gets none');
  // the refusals: the build will not print a Check-in that can mislead
  const noRule = clone(ams); noRule.checkin.rules = noRule.checkin.rules.filter((r) => !(r.when.stage === 'shortlist' && r.when.where === 'here'));
  check(throws(() => render(noRule), /leave stage=shortlist × where=here without a plan/) === true, 'rules that leave a stage × where pair without a plan are refused: three taps can never end in nothing');
  const badPlan = clone(ams); badPlan.checkin.rules[0].plan = 'concierge';
  check(throws(() => render(badPlan), /plan "concierge" is not one of the plans/) === true, 'a rule pointing at a plan the page does not sell is refused');
  const badCond = clone(ams); badCond.checkin.rules[0].when = { stage: 'dreaming' };
  check(throws(() => render(badCond), /unknown condition stage=dreaming/) === true, 'a rule on an answer that does not exist is refused');
  const seven = clone(ams); seven.checkin.dossier.items.pop();
  check(throws(() => render(seven), new RegExp(`exactly ${DOSSIER_N} documents`)) === true, 'seven documents are refused: the readiness reads "n of 8" and the copy says eight');
  const fix = clone(ams); fix.checkin.dossier.fixable = ['visa'];
  check(throws(() => render(fix), /fixable must name documents from the list/) === true, 'a "fixable" document that is not on the list is refused');
  const noPrice = clone(ams); noPrice.checkin.result.ctaSearch = 'Start now';
  check(throws(() => render(noPrice), /ctaSearch must carry \{price\}/) === true, 'the till button without its {price} is refused: a pay button always says the number');
  const noUrl = clone(ams); noUrl.checkin.result.share.text = 'BOOM {city}, check in.';
  check(throws(() => render(noUrl), /a text with \{url\}/) === true, 'a share text without {url} is refused: a share nobody can follow');
  const handAnswer = clone(ams); handAnswer.faq.items.find((x) => x.checkin).a = 'Full Search, always.';
  check(throws(() => render(handAnswer), /carries only the question/) === true, 'a hand-written answer on the derived FAQ item is refused: the FAQ cannot name a plan the Check-in would not');
  const noIata = clone(ams); delete noIata.iata;
  check(throws(() => render(noIata), /"iata" \(three upper-case letters\) is required/) === true, 'a city without its IATA code is refused: it is the destination on the pass');
  const lowCode = clone(ams); lowCode.checkin.steps[0].options[0].code = 'start';
  check(throws(() => render(lowCode), /code \(2–10 upper-case chars, on the pass\)/) === true, 'a lower-case pass code is refused');
  const noNote = clone(ams); delete noNote.checkin.notes.when.later;
  check(throws(() => render(noNote), /one line for every "when" and every "where" option/) === true, 'a missing note for an answer is refused: the ticket would print an empty line');
  const order = clone(ams); order.checkin.steps = order.checkin.steps.slice().reverse();
  check(throws(() => render(order), /must be exactly stage, when, where in that order/) === true, 'the three steps are stage, when, where, in that order (the share link depends on it)');
  const noCk = clone(ams); delete noCk.checkin;
  check(throws(() => render(noCk), /needs "checkin"/) === true, 'a city without the Check-in is refused: every desk has the same door');
  // the sisters: every desk has it, each in its own words and its own law
  for (const c of [mad, bcn, par, ber]) {
    const h = pageOf(c.slug); const k = checkinOf(h);
    const a = checkinAnswer(c);
    const vis = [...h.matchAll(/<details>\s*<summary>([\s\S]*?)<\/summary>\s*<div class="a">([\s\S]*?)<\/div>\s*<\/details>/g)].map((m) => ({ q: decode(m[1]), a: decode(m[2]) }));
    check(k && (h.match(/<div class="checkin" id="checkin"/g) || []).length === 1 && (k.match(/<label class="ck-doc">/g) || []).length === DOSSIER_N
      && k.includes(`<span class="cto">${c.iata}</span>`) && k.includes(`data-word="${c.city}"`) && h.includes(`"IATA": "${c.iata}"`),
      `${c.slug}: the Check-in once, ${DOSSIER_N} documents, the pass bound for ${c.iata}`);
    check(vis.some((f) => f.q === c.faq.items.find((x) => x.checkin).q && f.a === a) && a.split(/\s+/).length <= 60, `${c.slug}: the derived FAQ answer is on the page (${a.split(/\s+/).length} words)`);
    const svcC = (ldOf(h).find((b) => Array.isArray(b['@graph']))['@graph']).find((n) => n['@type'] === 'Service');
    check((svcC.offers || []).every((o) => o.audience && o.audience.audienceType === offerAudience(c, c.pricing.plans.find((p) => p.label === o.name).id)),
      `${c.slug}: every Offer carries the audience its rules derive`);
    if (c.mode === 'waitlist') {
      check(/<a class="paybtn ck-start" href="#contact" id="ckStart" data-service="">/.test(k) && !/data-pay/.test(k) && / List prices, charged only when the desk opens\.$/.test(a)
        && /charged only when the desk opens/.test(c.checkin.result.ctaFileSub) && c.pricing.plans.every((p) => /at opening|on signing/.test(p.per))
        && c.checkin.rules.filter((r) => r.plan === 'full-search').every((r) => /when the desk opens/.test(r.why)) && !c.checkin.rules.some((r) => /\btoday\b|right now|starts now/i.test(r.why)),
        `${c.slug}: the ticket's door is the free file, never a till; the FAQ, the file line, the price line and the Full Search "why" say the desk is opening, no "why" says today — shown is not charged`);
    } else {
      check(/<button type="button" class="paybtn ck-start" id="ckStart" data-pay="">/.test(k) && !/when the desk opens/.test(a), `${c.slug}: the ticket's first door is the till`);
    }
  }
  check(/Due only once you sign\./.test(ber.checkin.rules.find((r) => r.plan === 'full-search').why), 'berlin: the Full Search ticket says the fee is due only once you sign (WoVermRG), on the ticket itself');
  check(ber.checkin.dossier.items.some((i) => /SCHUFA/.test(i.t)) && par.checkin.dossier.items.some((i) => /Visale/.test(i.t)) && bcn.checkin.dossier.items.some((i) => /NIE/.test(i.t)) && ams.checkin.dossier.items.some((i) => /werkgeversverklaring/.test(i.t)),
    'the eight documents are the CITY\'s: SCHUFA in Berlin, Visale in Paris, NIE in Barcelona, werkgeversverklaring in Amsterdam');
  // the motion layer: CSS-only depth, everything off under reduced motion, nothing scroll-jacked
  const css = read('assets/boom-city.css'); const js = read('assets/boom-city.js');
  const rm = css.slice(css.indexOf('@media(prefers-reduced-motion:reduce)'));
  check(/@supports \(animation-timeline: view\(\)\)\{/.test(css) && /\.filecard\.tilt\{transform:perspective\(1200px\)/.test(css) && /@keyframes tkt-in\{from\{opacity:0;transform:rotateY\(-22deg\)/.test(css) && /@keyframes float3d/.test(css),
    'the depth is CSS: scroll-driven entrances behind @supports, the tilt on the file card and the pass, the ticket\'s flip, the floating pass — no WebGL, no library');
  check(/\.filecard\.tilt,\.ck-carta\.tilt\{transform:none;transition:none\}/.test(rm) && /\.rv \.plates \.sib,\.rv \.flows \.flow\{animation:none\}/.test(rm) && /\.tech-bg\{transition:none;transform:none!important\}/.test(rm),
    'under prefers-reduced-motion the tilt, the scroll-driven entrances and the parallax are off (the Check-in still works, still)');
  check(/if \(ridotto \|\| !matchMedia\('\(pointer:fine\)'\)\.matches\) return;/.test(js) && !/scroll-behavior|scrollTo\(0|wheel/.test(js.slice(js.indexOf('THE CHECK-IN'))),
    'the tilt binds only with a fine pointer and motion allowed (a thumb has no hover); nothing in the layer hijacks the scroll');
  check(/window\.BOOM_CHECKIN = CK;/.test(js) && /\(\?:\^\|\[#&\]\)checkin=\(\[a-z\]\+\)\\\.\(\[a-z\]\+\)\\\.\(\[a-z\]\+\)\\\.\(\[0-9a-f\]\{1,2\}\|-\)/.test(js)
    && /checkin: v\('fCheckin'\), dossier: v\('fDossier'\)/.test(js),
    'the JS exposes the Check-in, reads the answers back from #checkin=stage.when.where.docs, and posts the two hidden fields with the lead');
  check(!/#D4AF37/i.test(css) && !/#D4AF37/i.test(js) && !/[a-z]!["\s]/i.test(JSON.stringify([ams, mad, bcn, par, ber].map((c) => c.checkin))), 'no portal gold, no exclamation mark in the Check-in copy of any desk');
}

console.log(`\n  ${ok} passed, ${ko} failed`);
process.exit(ko ? 1 : 0);
