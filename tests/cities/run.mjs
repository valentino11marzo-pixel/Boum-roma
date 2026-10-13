// tests/cities/run.mjs — the city pages are built from data, and the build
// must refuse rather than print something wrong (BOOM_CITIES_BRIEF.md §2, §10).
//
// What breaks if this goes red:
//   - a committed page that is NOT what the data says (someone edited the
//     generated HTML, or changed the data and forgot to rebuild);
//   - a missing field silently printed as an empty string;
//   - a city switched to live:true with [NAME], REPLACE_ME or an unsourced
//     stat still on the page (the guard must bite, and must not bite a clean page);
//   - a waitlist city printing prices and a Stripe link;
//   - the FAQ schema saying something the page doesn't show;
//   - the build overwriting a root page it did not generate.
//
// No browser, no network: the real build functions on the real data.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  buildAll, renderCity, writeAll, fill, findPlaceholders, BuildError, esc, eur, GENERATED_MARK
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

console.log('\n\x1b[1m▸ cities\x1b[0m  the city pages: built from data, refusing instead of lying');

const dir = path.join(R, 'cities');
const template = fs.readFileSync(path.join(dir, '_template.html'), 'utf8');
const shared = JSON.parse(fs.readFileSync(path.join(dir, '_shared.json'), 'utf8'));
const ams = JSON.parse(fs.readFileSync(path.join(dir, 'amsterdam.json'), 'utf8'));
const assetVersion = { css: 'testcss000', js: 'testjs0000' };
const render = (city, sh = shared, tpl = template) => renderCity({ template: tpl, shared: sh, city, assetVersion });

// ── 1 · the committed pages are exactly what the data builds ─────────────
const pages = buildAll({ root: R });
check(pages.length >= 1, `${pages.length} city page(s) built from cities/*.json`);
for (const p of pages) {
  const f = path.join(R, p.file);
  const cur = fs.existsSync(f) ? fs.readFileSync(f, 'utf8') : null;
  check(cur === p.html, `${p.file} is up to date with its data`,
    cur === null ? 'missing — run npm run build:cities' : 'stale — run npm run build:cities (never edit the generated file)');
}

// ── 2 · the Amsterdam page, as built ─────────────────────────────────────
const page = pages.find((p) => p.slug === 'amsterdam');
const html = page ? page.html : '';
check(page && !/\{\{|\}\}/.test(html), 'amsterdam: no unresolved {{token}} in the output');
check(html.includes(GENERATED_MARK), 'amsterdam: carries the GENERATED mark (the overwrite guard depends on it)');
check(ams.live === false && /<meta name="robots" content="noindex">/.test(html.slice(0, 4000)),
  'amsterdam is a draft (live:false) and says noindex in the first 4000 chars (tests/seo rule 8 reads exactly there)');
const canon = (html.match(/<link rel="canonical" href="([^"]+)"/) || [])[1];
check(canon === `${shared.siteUrl}/amsterdam`, `canonical comes from siteUrl: ${canon}`);
check(/^https:\/\/www\.boomrome\.com$/.test(shared.siteUrl),
  'siteUrl is the canonical host www.boomrome.com (the apex redirects; a canonical must not point at a redirect)');
check(html.includes(`href="https://wa.me/${ams.config.WHATSAPP}?text=`), 'WhatsApp links are real hrefs at build time (work without JS)');
check(html.includes(`id="stripe-btn" href="${esc(ams.config.STRIPE_DEPOSIT_URL)}"`), 'the Stripe button href is written at build time');
check(/<link rel="stylesheet" href="\/assets\/boom-city\.css\?v=[0-9a-f]{10}">/.test(html)
  && /<script src="\/assets\/boom-city\.js\?v=[0-9a-f]{10}"><\/script>/.test(html),
  'shared CSS/JS are linked with a content hash (a changed asset changes the page: --check catches a forgotten rebuild)');
const e = shared.entity;
check(html.includes(`is operated by ${esc(e.legalName)}, ${esc(e.address)} · P.IVA ${esc(e.vat)} · ${esc(e.trademark)}`),
  'the footer prints the shared legal entity verbatim');

// ── 3 · JSON-LD says what the page shows ──────────────────────────────────
const ld = JSON.parse((html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/) || [])[1] || '{}');
const graph = ld['@graph'] || [];
const org = graph.find((n) => n['@type'] === 'Organization') || {};
const svc = graph.find((n) => n['@type'] === 'Service') || {};
const faqLd = graph.find((n) => n['@type'] === 'FAQPage') || {};
check(org['@id'] === `${shared.siteUrl}/#organization` && org.url === shared.siteUrl,
  'Organization @id/url derive from siteUrl (same entity id as the rest of the site)');
const summaries = [...html.matchAll(/<details><summary>([\s\S]*?)<\/summary><p>([\s\S]*?)<\/p><\/details>/g)]
  .map((m) => ({ q: decode(m[1]), a: decode(m[2]) }));
const faqItems = (faqLd.mainEntity || []).map((q) => ({ q: q.name, a: q.acceptedAnswer && q.acceptedAnswer.text }));
check(summaries.length === 6 && JSON.stringify(summaries) === JSON.stringify(faqItems),
  `FAQPage = the visible FAQ, question AND answer, word for word (${faqItems.length}/${summaries.length})`);
const shownPrices = [...html.matchAll(/data-plan="([^"]+)"/g)].map((m) => m[1]);
const nowPrices = [...html.matchAll(/<span class="now">€([\d,]+)<\/span>/g)].map((m) => m[1].replace(/,/g, ''));
const offers = (svc.offers || []).map((o) => [o.name, o.price]);
check(JSON.stringify(offers) === JSON.stringify(shownPrices.map((n, i) => [n, nowPrices[i]])),
  `every Offer is a plan on the page at the price shown: ${offers.map((o) => o.join(' €')).join(' · ')}`);
const optionPrices = [...html.matchAll(/<option value="([^"]+)">[^<]* — €([\d,]+)<\/option>/g)].map((m) => [m[1], m[2].replace(/,/g, '')]);
check(optionPrices.length === 3 && optionPrices.every(([n, p]) => offers.some(([on, op]) => on === n && op === p)),
  'the form\'s service prices come from the plans (one price, one place)');

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
  evil.hero.h1 = '<img src=x onerror=alert(1)>';
  evil.how.steps[0].text = '</p><script>alert(1)</script>';
  const out = render(evil).html;
  check(!out.includes('<img src=x') && !out.includes('<script>alert(1)') && out.includes('&lt;img src=x onerror=alert(1)&gt;'),
    'plain fields are escaped in the template AND in the array renderers');
  evil.config.WA_MESSAGE = '</script><script>alert(1)</script>';
  const out2 = render(evil).html;
  check(!/<\/script><script>alert\(1\)/.test(out2), 'config JSON cannot close its <script> tag');
}
check(eur(1500) === '€1,500' && eur(199) === '€199' && eur(12500) === '€12,500', 'prices format deterministically (no toLocaleString)');

// ── 5 · the live guard bites, and only when it should ─────────────────────
{
  const live = clone(ams); live.live = true;
  let msg = '';
  try { render(live); } catch (err) { msg = err.message; }
  check(/\[PHOTO OF LOCAL OPERATOR\]/.test(msg) && /\[NAME\]/.test(msg) && /REPLACE_ME/.test(msg)
    && /39XXXXXXXXXX/.test(msg) && /has no source/.test(msg),
    'live:true with today\'s Amsterdam data is refused, naming photo, testimonials, config and unsourced stats');

  const clean = clone(ams); clean.live = true;
  clean.config.STRIPE_DEPOSIT_URL = 'https://buy.stripe.com/test_abc';
  clean.config.WEB3FORMS_KEY = '00000000-0000-0000-0000-000000000000';
  clean.config.WHATSAPP = '393331234567';
  clean.problem.stats.forEach((s) => { s.source = { url: 'https://example.org/report', date: '2026-09-01' }; });
  clean.person.avatarHtml = 'Photo'; clean.person.name = 'Anna, Dutch';
  clean.person.paragraphs[0] = 'Lives in De Pijp since 2015.';
  clean.proof.testimonials = [{ quote: 'Fast and honest.', by: 'Real Person, UK · housed in Rome, 2025' }];
  let res = null, err = '';
  try { res = render(clean); } catch (x) { err = x.message; }
  check(res && res.placeholders.length === 0, 'a clean page passes the live guard (the guard is not an always-fail)', err);
  check(res && !/noindex/.test(res.html), 'a live page drops noindex');

  const statNoDate = clone(clean); statNoDate.problem.stats[1].source = { url: 'https://example.org' };
  check(throws(() => render(statNoDate), /has no source \{url, date\}/) === true, 'a stat source needs both url and date');
}
check(findPlaceholders('<p>[A] ok</p><script>var a=[1,2]</script><style>a[href]{}</style>', {}).join() === '[A]',
  'placeholders are read from visible text only (not from scripts, styles or JSON-LD arrays)');

// ── 6 · structural refusals ───────────────────────────────────────────────
{
  const wl = clone(ams); wl.mode = 'waitlist';
  check(throws(() => render(wl), /waitlist" is not built yet/) === true,
    'mode "waitlist" is refused until Phase 3 builds it (this template would print prices and Stripe)');
  const bad = clone(ams); bad.mode = 'free';
  check(throws(() => render(bad), /"mode" must be/) === true, 'an unknown mode is refused');
  const slug = clone(ams); slug.slug = '../index';
  check(throws(() => render(slug), /slug must be/) === true, 'a slug cannot escape the root');
  const live = clone(ams); delete live.live;
  check(throws(() => render(live), /"live" must be true or false/) === true, '"live" must be explicit');
  const opt = clone(ams); opt.reserve.serviceOptions = ['Full Search', 'Concierge'];
  check(throws(() => render(opt), /"Concierge", which is not a plan/) === true, 'the form cannot offer a service with no plan');
  const nosteps = clone(ams); nosteps.how.steps = [];
  check(throws(() => render(nosteps), /how\.steps must be a non-empty array/) === true, 'an empty section is an error, not a blank block');
  const sh = clone(shared); sh.siteUrl = 'https://www.boomrome.com/';
  check(throws(() => render(ams, sh), /siteUrl must be/) === true, 'siteUrl with a trailing slash is refused (it would print //amsterdam)');
}

// ── 7 · the build never overwrites a page it did not make ────────────────
{
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'boom-cities-'));
  fs.mkdirSync(path.join(tmp, 'cities')); fs.mkdirSync(path.join(tmp, 'assets'));
  for (const f of ['_template.html', '_shared.json', 'amsterdam.json']) fs.copyFileSync(path.join(dir, f), path.join(tmp, 'cities', f));
  for (const f of ['boom-city.css', 'boom-city.js']) fs.copyFileSync(path.join(R, 'assets', f), path.join(tmp, 'assets', f));
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
  fs.rmSync(tmp, { recursive: true, force: true });
}

// ── 8 · the source files never ship ──────────────────────────────────────
{
  const ignore = fs.readFileSync(path.join(R, '.vercelignore'), 'utf8').split('\n').map((l) => l.trim());
  check(['cities/', 'build-cities.mjs', 'BOOM_CITIES_BRIEF.md'].every((x) => ignore.includes(x)),
    '.vercelignore keeps the template (with its {{tokens}}), the build script and the internal brief off the site');
}

console.log(`\n  ${ok} passed, ${ko} failed`);
process.exit(ko ? 1 : 0);
