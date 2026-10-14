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
//   - a waitlist city printing prices;
//   - the FAQ schema or the Offers saying something the page doesn't show;
//   - the build overwriting a root page it did not generate;
//   - the lead endpoint filing a city lead into the Rome machine, or the
//     Commerciale drafting a Rome reply to someone moving to Amsterdam.
//
// No browser, no network: the real build functions on the real data, and
// the real /api/city-lead handler on a Firestore in memory.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  buildAll, renderCity, writeAll, fill, findPlaceholders, fragments, BuildError, esc, eur, GENERATED_MARK, CELL_EM
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
check(!/web3forms|buy\.stripe\.com|fbq\(|connect\.facebook/i.test(html) && !/web3forms|stripe|fbq/i.test(read('assets/boom-city.js')),
  'no third-party form service, no Stripe link, no Meta pixel: the form posts to our own API');
const copy = JSON.stringify(ams);
check(!/[a-z.]!["\s]/i.test(copy), 'no exclamation marks in the city copy (BOOM_CITIES_BRIEF §5 copy rules)');

// the door
check(html.includes('<form id="cityForm" novalidate') && read('assets/boom-city.js').includes("fetch(C.LEAD_ENDPOINT || '/api/city-lead'")
  && html.includes('"LEAD_ENDPOINT": "/api/city-lead"'), 'the form posts to /api/city-lead');
check(/<input id="fCompany" name="company"[^>]*tabindex="-1"[^>]*aria-hidden="true">/.test(html)
  && !/<label[^>]*>[^<]*ompany/.test(html), 'the honeypot is a hidden field named company, and no visible field shares the name');
const visibleFields = (html.match(/<(input|select|textarea) id="f(Name|Email|MoveIn|Budget|Service)"/g) || []).length;
check(visibleFields === 5, `five visible fields, the rest behind "More details" (${visibleFields})`);
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
const optionPrices = [...html.matchAll(/<option value="([^"]+)">[^<]* — €([\d,]+)/g)].map((m) => [m[1], m[2].replace(/,/g, '')]);
check(optionPrices.length === 3 && optionPrices.every(([id, p]) => ams.pricing.plans.some((pl) => pl.id === id && String(pl.price) === p))
  && html.includes(`<option value="unsure">${esc(ams.form.service.unsure)}</option>`),
  'the form\'s service prices come from the plans (one price, one place) + "not sure yet"');
check(html.includes(`<b>Full Search €500</b> · <b>Application Pack €199</b> · <b>Attended Viewing €149</b> per viewing.`),
  'the fact sheet\'s fees row is DERIVED from the plans (the quotable ledger cannot drift)');
check(svc.areaServed && svc.areaServed.name === 'Amsterdam' && svc.audience && svc.audience.audienceType && svc.provider['@id'] === org['@id'],
  'the Service says where, for whom and by whom');

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
  const wl = clone(ams); wl.mode = 'waitlist';
  check(throws(() => render(wl), /waitlist" is not built yet/) === true,
    'mode "waitlist" is refused until Phase 3 builds it (this template prints prices)');
  const bad = clone(ams); bad.mode = 'deposit';
  check(throws(() => render(bad), /"mode" must be "search" or "waitlist"/) === true, 'the old "deposit" mode is gone: an unknown mode is refused');
  const slug = clone(ams); slug.slug = '../index';
  check(throws(() => render(slug), /slug must be/) === true, 'a slug cannot escape the root');
  const live = clone(ams); delete live.live;
  check(throws(() => render(live), /"live" must be true or false/) === true, '"live" must be explicit');
  const dup = clone(ams); dup.pricing.plans[1].id = 'full-search';
  check(throws(() => render(dup), /must be unique/) === true, 'two plans cannot share an id (the select and the plates key on it)');
  const nolabel = clone(ams); delete nolabel.pricing.plans[2].label;
  check(throws(() => render(nolabel), /needs label, se, name, text, per, cta/) === true, 'a plan without its label is refused (the Offer and the select print it)');
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
const { isCityMarket, cityMarketOf, cityLabel, cityReplyText, isReunion, isB2B, CITY_MARKETS } = await import('../../api/_market.js');
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

console.log(`\n  ${ok} passed, ${ko} failed`);
process.exit(ko ? 1 : 0);
