#!/usr/bin/env node
// build-cities.mjs — the BOOM city pages, built from data. Zero dependencies.
//
//   node build-cities.mjs           regenerate /<slug>.html from cities/<slug>.json
//   node build-cities.mjs --check   exit 1 when a committed page is not what the build makes
//
// Contract: BOOM_CITIES_BRIEF.md (v1.5, 26/10 — «Il biglietto»: the study
// in STUDIO_CITIES_ESPERIENZA.md §12). One template (cities/_template.html),
// one shared file (cities/_shared.json: domain, legal entity, contacts, the
// refund rule, the Rome proof — identical on every page), one JSON per
// city. The generated pages are committed because Vercel serves the repo
// as-is.
//
// v1.5 — THE FIRST PHONE SCREEN IS ONE BOARDING PASS. The city on the real
// Solari board, one sentence that carries the desk's must-state, three fare
// rows (who each is for, the price with its condition in the same element,
// the refund rule under the €500 where the desk sells), one gold door, who
// answers and when. A fare row is a native <details>: it opens ITS ticket
// in place (what the fee buys, the free door, then "Pay and start" as a
// quiet second). Below the pass: three steps, the checks and the papers,
// a few questions and the fact sheet, all folded. The Check-in quiz, the
// eight-paper meter, the shareable pass image and the #checkin= links of
// v1.2–v1.4 are gone: the first paying client did not recognise the quiz.
// The page is self-contained (assets/boom-city.css carries its own tokens
// on the boom-2026 values: gold #FFD700); the Solari engine, the scroll
// contract and the desk calendar are inlined from their single sources.
//
// Token syntax in the template: {{a.b}} prints the value HTML-escaped,
// {{{a.b}}} prints it raw. Arrays (plans, steps, checks, faq, …) are
// rendered by the small functions below.
//
// The build refuses, instead of printing something wrong:
//   - a token with no value (a missing field never becomes an empty string);
//   - a city with `live: true` that still carries placeholders — bracketed
//     copy like [NAME], config values like REPLACE_ME / 39XXXXXXXXXX, an
//     og-<slug>.png that does not exist on disk, (a sell desk) no Rome
//     profile URL in _shared.json or no withdrawal page on disk;
//   - a plan without a price, its condition strings or its "for whom" line;
//     a short condition without "VAT"; a sell desk's condition saying
//     "opening", a waitlist's not saying when it is charged; Berlin's Full
//     Search without "sign" in both strings;
//   - a waitlist city that opens a checkout, names Stripe, a pay button,
//     a refund rule, a bank transfer or a call ANYWHERE in its output
//     (text, attributes, JSON-LD, the config the script reads);
//   - on a sell desk, a block that shows €500 without the refund rule in
//     it (the fare row and its ticket, the till, the fees row);
//   - on a Spanish desk that sells, a fares head or a till that does not
//     open "Optional, chosen in writing" (LAU art. 20), or no LAU art. 20
//     check, or no landlord-pays question;
//   - a till that does not say, before the pay button and in this order,
//     the plan and its price, the UNTICKED start-now request, the 14-day
//     withdrawal line with the model form; a pay button that does not
//     follow the tick;
//   - more than one action label (the door, the strip and the till's way
//     out all read door.label; every pay control reads till.label with its
//     price), a digit or a € in a door label or a strip;
//   - the Rome rating printed without "Rome", or twice; a "500+", "24/7",
//     "24 hours", "within the hour", "off-market" or an exclamation mark;
//   - a leftover key of the quiz pages (checkin, glance, plan, facts,
//     factsDerived, nav, form.moveIn…): a string nobody sees is a string
//     everybody believes is live;
//   - a page over the weight budget, or overwriting a root .html it did
//     not generate.
// A city with `live: false` builds, carries <meta name="robots"
// content="noindex">, and the placeholders are listed so nothing is forgotten.
//
// v1.6 (03/11/2026) — «THE COMPLETE AVIATION DESK». The first screen stays
// one boarding pass, rebuilt as a crafted object (foil chip and band,
// security print, a punched perforation that carries the route YOU → LON
// with the plane parked where the SERVER's state puts it, an issuer seal, a
// stub full to the bottom with a decorative barcode and the server's code
// line). Below it the page is a terminal walk, each block an instrument
// showing a fact the page already holds: Departures (how.steps with a
// validated status), Pre-flight (the checks), Baggage (the eight papers,
// static tags), Gate (who answers, the desk clock and week — served hidden,
// filled from the desk calendar), Questions, Network (the sister desks,
// arcs from Rome at real coordinates), the fact sheet and the footer.
// The build adds: per-item key lists for steps, checks, FAQ and fact-sheet
// rows; the status, geo and papers-summary rules; the seal phrase derived
// from the must-state; the words split into PROSE and INSTRUMENTS
// ([data-instr]); the 24-word node rule; per-section caps; the onda canvas
// script weighed in the total.

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { CITY_MARKETS } from './api/_market.js';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
// The model withdrawal form (Directive 2011/83/EU Annex I(B)), linked from the
// till's withdrawal line and from the paid email (api/stripe-webhook.js).
export const WITHDRAWAL_PATH = '/withdrawal';
export const TERMS_PATH = '/terms#city-desks';
export const GENERATED_MARK = 'GENERATED by build-cities.mjs';

// The weight budget: first-party bytes a visitor on a mid-range phone
// downloads before the page works — the page (with the inlined engine, the
// scroll contract and the desk calendar), the ticket CSS, the city JS, the
// onda canvas script, the consent and tracking scripts (≈20 KB of the
// total, shared by every page) — and the city JS, the CSS and the onda on
// their own. v1.4 weighed 89.9 KB of 90 on Barcelona.
//
// v1.6 (03/11/2026) — FOUNDER DECISION, in writing: «this new style is just
// too much synthesised … iterate the aviation ticket style … also for a
// complete page». The v1.5 caps (60 KB gz, JS 12, 460 words) are raised ONCE,
// by the founder, to the numbers below. From here they are never raised to
// fit a change: a change that does not fit cuts copy or craft (spec §I).
// Words at load are split: PROSE (sentences) and INSTRUMENTS (text inside
// [data-instr]: codes, column heads, statuses, kickers) — the richness comes
// from instruments, not paragraphs (the v1.5 lesson: the quiz).
export const WEIGHT_KB = { total: 82, js: 14, css: 15, onda: 4 };
export const BUDGET = { lead: 30, fares: 70, ticket: 60, body: 640, prose: 520, instr: 120,
  node: 24, first: 150, departures: 100, preflight: 60, baggage: 70, gate: 40, network: 40 };

// a clock promise in any of its spellings; a call promised in any words; a
// rating (a star, or a decimal mark next to stars/reviews/Google)
export const CLOCK_RE = /\b24\s*-?\s*h(?:ours?|rs?)?\b|\bwithin (?:an|the|one) hour\b|<\s*1\s*h\b|\b24\/7\b/i;
export const CALL_RE = /\b(?:call(?:s|ed|ing|back|backs)?|phone (?:you|us)|ring (?:you|us)|video[- ]?(?:call|chat))\b/i;
export const RATING_RE = /★|\brated\s+\d|\b\d[.,]\d\b[^<\n]{0,25}(?:stars?|reviews?|clients?|customers?|ratings?|on Google)/gi;
// v1.6 — the Departures statuses: a fact about the step (FREE, 1 WORK DAY,
// IN PERSON; on a desk still opening WITH PARTNER, AT OPENING), never a
// flight remark: no ON TIME / DELAY / BOARDING / LAST CALL / GATE / NOW / ONLY
export const STATUS_RE = /^[A-Z0-9][A-Z0-9 ]{1,11}$/;
// (a word that STARTS like a remark counts: BOARDING, DELAYED, CANCELLED)
export const STATUS_BANNED_RE = /\b(?:ON TIME|DELAY|BOARD|LAST|FINAL|GATE|DEPART|CANCEL|SEAT|NOW|LEFT|ONLY)/;
// "1 · Brief": the step number and the step's name, both on the board
export const STEP_K_RE = /^(\d) · (.{2,24})$/;
// the papers' heading, split into the h2 and its gold phrase
export const PAPERS_RE = /^The papers an? .+ asks for$/;
// the aviation words the page never prints (they promise a seat, a queue,
// a countdown or a Wallet pass that does not exist). Whole words: "London
// time" is not "on time"
export const AVIATION_BAN_RE = /\bSEAT\b|\bADMIT ONE\b|\bBOARDING\b|\bLAST CALL\b|\bFINAL CALL\b|\bON TIME\b|\bDELAYED\b|\bWallet\b|\bclosing in\b|\d+\s*(?:min|minutes|hours|days) left/i;
// Rome is the hub of the network map: every desk answers from Rome
export const ROME_IATA = 'ROM';
// BOOM Desks (03/11/2026): every desk on one page. Every desk page's Network
// links it last ("Every BOOM desk") and its breadcrumb runs Home → BOOM Desks
// → the city. The hub's ring on the map (r 10 around the hub's dot).
export const HUB_PATH = '/desks';
export const HUB_NAME = 'BOOM Desks';
export const HUB_RING_R = 10;
// The network map's projection (viewBox 0 0 600 420): a plain equirectangular
// crop of western Europe, so the dots sit at their real coordinates.
export const mapXY = (g) => [300 + (Number(g.lon) - 5) * 17.73, 210 + (46.75 - Number(g.lat)) * 26];
// finite, inside western Europe, and inside the map's margins [20,580]×[20,400]
export function validGeo(g) {
  if (!g || typeof g !== 'object' || Array.isArray(g)) return false;
  const lat = g.lat, lon = g.lon;
  if (typeof lat !== 'number' || typeof lon !== 'number' || !Number.isFinite(lat) || !Number.isFinite(lon)) return false;
  if (lat < 35 || lat > 60 || lon < -11 || lon > 30) return false;
  const [x, y] = mapXY(g);
  return x >= 20 && x <= 580 && y >= 20 && y <= 400;
}

export class BuildError extends Error {}

export const esc = (v) => String(v)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// €1,500 — deterministic thousands, never toLocaleString (small-ICU runtimes
// degrade it silently: the lesson already paid on /executive).
export const SYMBOL = { EUR: '€', GBP: '£' };
// the price in the desk's own currency (London: GBP). eur() stays the euro
// alias the tests and the euro desks read.
export const money = (n, cur = 'EUR') => (SYMBOL[String(cur).toUpperCase()] || '€') + String(Math.round(Number(n))).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
export const eur = (n) => money(n, 'EUR');

// JSON inside <script>: `<` escaped so a value can never close the tag.
const scriptJson = (obj, indent) => JSON.stringify(obj, null, 2)
  .replace(/</g, '\\u003c')
  .split('\n').map((l, i) => (i ? indent + l : l)).join('\n');

const get = (obj, dotted) => dotted.split('.').reduce((o, k) => (o == null ? undefined : o[k]), obj);

export function fill(template, data, where) {
  const missing = new Set();
  const out = template.replace(/\{\{\{\s*([\w.]+)\s*\}\}\}|\{\{\s*([\w.]+)\s*\}\}/g, (m, raw, plain) => {
    const key = raw || plain;
    const v = get(data, key);
    if (v === undefined || v === null || typeof v === 'object') { missing.add(key); return m; }
    return raw ? String(v) : esc(v);
  });
  if (missing.size) throw new BuildError(`${where}: unresolved tokens: ${[...missing].join(', ')}`);
  const left = out.match(/\{\{[^}]*\}\}/g);
  if (left) throw new BuildError(`${where}: malformed tokens left in the output: ${[...new Set(left)].join(', ')}`);
  return out;
}

function need(cond, where, msg) { if (!cond) throw new BuildError(`${where}: ${msg}`); }
const list = (city, dotted) => {
  const v = get(city, dotted);
  need(Array.isArray(v) && v.length, `cities/${city.slug}.json`, `${dotted} must be a non-empty array`);
  return v;
};
export const words = (s) => String(s || '').split(/\s+/).filter((w) => /[A-Za-z0-9€£]/.test(w)).length;
const str = (v) => typeof v === 'string' && v.trim().length > 0;

// THE NETWORK MAP'S ARCS (v1.6 review F9): every desk's arc leaves Rome and
// bows perpendicular to its chord. The bow's side and size are chosen per
// desk, over EVERY desk with coordinates (so an arc is the same on every
// page), until it passes no other desk's dot closer than ARC_CLEAR plus the
// biggest mark a dot can carry (this desk's 10px ring: any desk is "this
// desk" on its own page) and does not run along an arc already drawn. A desk
// no bow can serve is a build error, never an arc through a sister.
export const ARC_CLEAR = 6;
export const ARC_DOT_R = 3, ARC_ME_R = 10;
const qAt = ([x1, y1], [cx, cy], [x2, y2], t) => [(1 - t) * (1 - t) * x1 + 2 * (1 - t) * t * cx + t * t * x2, (1 - t) * (1 - t) * y1 + 2 * (1 - t) * t * cy + t * t * y2];
const r1n = (n) => Math.round(n * 10) / 10;
// the control point, rounded as the path prints it (the check reads what is drawn)
export function arcCtrl(hub, to, f) {
  const [x1, y1] = hub, [x2, y2] = to, dx = x2 - x1, dy = y2 - y1, L = Math.hypot(dx, dy) || 1;
  return [r1n((x1 + x2) / 2 - (dy / L) * f * L), r1n((y1 + y2) / 2 + (dx / L) * f * L)];
}
const arcPts = (hub, c, to, n = 160) => Array.from({ length: n + 1 }, (_, i) => qAt(hub, c, to, i / n));
const gap = (pts, [x, y]) => Math.min(...pts.map(([a, b]) => Math.hypot(a - x, b - y)));
export function bowArcs(hub, dests) {
  const len = ([x, y]) => Math.hypot(x - hub[0], y - hub[1]);
  const drawn = [], bows = new Map();
  for (const [key, to] of [...dests].sort((a, b) => len(a[1]) - len(b[1]) || a[0].localeCompare(b[0]))) {
    // north first: a westward chord bows up with f > 0, an eastward one with f < 0
    const north = to[0] < hub[0] ? 1 : -1;
    const pick = [0.18, 0.24, 0.12, 0.3, 0.36].flatMap((f) => [north * f, -north * f]).find((f) => {
      const pts = arcPts(hub, arcCtrl(hub, to, f), to);
      if (dests.some(([k, xy]) => k !== key && gap(pts, xy) < ARC_ME_R + ARC_CLEAR)) return false;
      const out = pts.filter((p) => len(p) > 36);
      return drawn.every((o) => out.filter((p) => gap(o, p) < 8).length <= 0.12 * out.length);
    });
    if (pick === undefined) throw new BuildError(`network map: no bow takes the arc ROM → ${key} clear of the other desks`);
    bows.set(key, pick);
    drawn.push(arcPts(hub, arcCtrl(hub, to, pick), to).filter((p) => len(p) > 36));
  }
  return bows;
}
// A MAP LABEL (≈24×10 on the dot's line, 9px off its dot, 7 more past this
// desk's ring) takes the first side no drawn arc crosses: first the side its
// own arc does not come from. `a` is {key, to, c, me?}: for a dot with no arc
// (a desk not open), `c` is the control point its arc WOULD have (arcCtrl).
// `drawnPts` are the drawn arcs' points (arcPts). Shared by the desk pages
// and the hub, so a label sits on the same side wherever the map is drawn.
export function labelFor(a, drawnPts, cls = '') {
  const off = 9 + (a.me ? 7 : 0), away = a.c[0] > a.to[0];
  const clear = (left) => { const x0 = left ? a.to[0] - off - 25 : a.to[0] + off - 1, y0 = a.to[1] - 5; return drawnPts.every((pts) => pts.every(([x, y]) => x < x0 || x > x0 + 26 || y < y0 || y > y0 + 10)); };
  const left = clear(away) || !clear(!away) ? away : !away;
  return `<text class="m-l${cls}${left ? ' l' : ''}" x="${r1n(a.to[0] + (left ? -9 : 9))}" y="${r1n(a.to[1] + 4)}"${left ? ' text-anchor="end"' : ''}>${esc(a.key)}</text>`;
}

// THE ARC'S PATH as drawn, ONE function: a desk page's arc and the hub's arc
// to the same desk carry the same `d` (tests/cities: parity)
export const arcD = (hub, a) => `M${r1(hub[0])} ${r1(hub[1])}Q${r1(a.c[0])} ${r1(a.c[1])} ${r1(a.to[0])} ${r1(a.to[1])}`;

// what is drawn, checked: every arc ≥ ARC_CLEAR from the edge of every dot it
// does not serve (the hub is every arc's start). Returns the violations.
export function arcViolations(hub, arcs, dots) {
  const bad = [];
  for (const a of arcs) {
    const pts = arcPts(hub, a.c, a.to, 240);
    for (const d of dots) {
      if (d.key === a.key) continue;
      const g = gap(pts, d.xy) - d.r;
      if (g < ARC_CLEAR) bad.push(`ROM → ${a.key} passes ${g.toFixed(1)}px from ${d.key}`);
    }
  }
  return bad;
}

// THE FAMILY is derived from the built cities, never kept by hand: the
// sister desks in alphabetical order, then BOOM Rome. A LIVE page links only
// live sisters (a client never lands on a draft nobody approved); a draft
// links every sister, because the review needs to see the suite.
// v1.6: each entry carries its IATA code and its coordinates (the Network
// map and list read them); BOOM Rome is the hub, ROM, at shared.rome.geo.
export function familyFor(city, cities, shared) {
  const sisters = (cities || [])
    .filter((c) => c.slug !== city.slug && (city.live !== true || c.live === true))
    .sort((a, b) => a.slug.localeCompare(b.slug))
    .map((c) => ({ label: `${c.city} desk`, href: `/${c.slug}`, iata: c.iata, geo: c.geo }));
  const home = (shared.family || []).filter((f) => f.href !== `/${city.slug}`).map((f) => ({
    ...f,
    iata: f.iata || (f.href === '/' ? ROME_IATA : ''),
    geo: f.geo || (f.href === '/' && shared.rome ? shared.rome.geo : undefined)
  }));
  return [...sisters, ...home];
}

// The desk block: who answers, in which time zone, which hours and days.
// The days are PRINTED ("Mon–Fri"): "09:00 to 19:00" alone read as an open
// desk on a Saturday.
const DAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
export function daysLabel(days) {
  const d = [...days].sort((a, b) => a - b);
  const contiguous = d.every((x, i) => i === 0 || x === d[i - 1] + 1);
  return d.length === 1 ? DAY_SHORT[d[0]] : contiguous ? `${DAY_SHORT[d[0]]}–${DAY_SHORT[d[d.length - 1]]}` : d.map((x) => DAY_SHORT[x]).join(', ');
}
// "Mon–Fri 09:00–19:00, Rome time": what a page without JS, a crawler and
// the static HTML say — true in every season (the zone is named by city,
// never as CET, which is wrong seven months a year).
// The desk's hours zone in words ("London time", "Rome time", "Italian time"):
// it also labels the Gate clock — never "At the desk", which put the person in
// the city while the network says every desk answers from Rome.
export function zoneWords(d) {
  return d.zoneName || (d.timeZone === 'Europe/Rome' ? 'Rome time' : `${d.timeZone.split('/').pop().replace(/_/g, ' ')} time`);
}
export function deskHoursText(d) {
  return `${daysLabel(d.days)} ${d.hours.from}–${d.hours.to}, ${zoneWords(d)}`;
}
export function validateDesk(d, where) {
  need(d && typeof d === 'object', where, 'needs "desk" {person, role, timeZone, tzLabel, hours{from,to}, days[]}');
  need(str(d.person) && !/[\[\]]/.test(d.person), where, 'desk.person is the named person (no brackets, no placeholder)');
  need(str(d.role), where, 'desk.role is required');
  try { new Intl.DateTimeFormat('en-US', { timeZone: d.timeZone }); } catch (e) { throw new BuildError(`${where}: desk.timeZone "${d.timeZone}" is not a time zone Intl accepts`); }
  need(typeof d.tzLabel === 'string' && /^[A-Z]{2,5}(\/[A-Z]{2,5})?$/.test(d.tzLabel), where, 'desk.tzLabel is the short zone name (CET, or CET/CEST to cover both seasons)');
  need(d.zoneName === undefined || /^[A-Za-z][A-Za-z ]{2,23}$/.test(d.zoneName), where, 'desk.zoneName, when present, is the zone in words ("Italian time"), no digits');
  const hhmm = (s) => /^([01]\d|2[0-3]):[0-5]\d$/.test(s || '');
  need(d.hours && hhmm(d.hours.from) && hhmm(d.hours.to) && d.hours.from < d.hours.to, where, 'desk.hours needs from and to as HH:MM, from before to');
  need(Array.isArray(d.days) && d.days.length && d.days.every((x) => Number.isInteger(x) && x >= 0 && x <= 6) && new Set(d.days).size === d.days.length, where, 'desk.days is a list of weekdays 0 (Sunday) to 6');
}

// Every WhatsApp link of a desk opens with a prefilled line that names the
// desk ("Hi BOOM Amsterdam, …"): without consent boom-track adds nothing, the
// chat opened empty and the lead entered the Rome machine. A prefilled text
// is not tracking; the server reads the marker (api/_market.js cityFromText).
export function waHref(contact, city) {
  const text = String(contact.waText || 'Hi BOOM {city}').split('{city}').join(city);
  return `https://wa.me/${contact.whatsapp}?text=${encodeURIComponent(text)}`;
}

// The fees row of the fact sheet, DERIVED from the plans: each plan's own
// condition in brackets when the plans differ (Berlin: Full Search on
// signing), said ONCE after the list when they are all the same.
export function feesRowOf(c, shared, extra = '') {
  const plans = list(c, 'pricing.plans');
  const same = plans.length > 1 && plans.every((p) => p.conditionLong === plans[0].conditionLong);
  const cur = currencyOf(c.slug);
  return plans.map((p) => `<b>${esc(p.label)} ${money(p.price, cur)}</b>${p.unit ? ' ' + esc(p.unit) : ''}${same ? '' : ` (${esc(p.conditionLong)})`}`).join(' · ')
    + '.' + (same ? ' ' + esc(plans[0].conditionLong) : '') + (extra ? ' ' + extra : '')
    + (c.checkout === true ? ' ' + esc(shared.refund.rule) : '');
}

// The calendar a desk's window reads: the webhook's own key (CITY_MARKETS
// holidays || country), so the page never says "desk open" on a day the
// withdrawal counts as a holiday. An unknown key reads Italy alone.
// The desk's currency, from the server's own registry (CITY_MARKETS): the
// page cannot print £ while Stripe charges €. Unknown desks are euro.
export function currencyOf(slug) {
  const m = CITY_MARKETS[slug];
  return String((m && m.currency) || 'eur').toUpperCase();
}
export function holidayKeyOf(slug) {
  const m = CITY_MARKETS[slug];
  return m ? (m.holidays || m.country || null) : null;
}

// ── the words the hub and the desks derive (BOOM Desks, 03/11/2026) ───────
// a count in words, one…twelve ("five desks"): a number the page states is
// derived, never typed
const NUMBER_WORDS = ['one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve'];
export function numberWord(n) {
  need(Number.isInteger(n) && n >= 1 && n <= 12, 'numberWord', `${n} is not a whole number from one to twelve`);
  return NUMBER_WORDS[n - 1];
}
// "A, B and C" (no serial comma, the house style); "A and B"; "A"
export function listJoin(arr) {
  const a = [...arr];
  return a.length <= 1 ? a.join('') : `${a.slice(0, -1).join(', ')} and ${a[a.length - 1]}`;
}
// '2026-11-03' → "3 November 2026": a fixed month table, never Intl (the
// small-ICU lesson paid on /executive)
const MONTHS_LONG = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
export function dateLong(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso));
  need(m && +m[2] >= 1 && +m[2] <= 12 && +m[3] >= 1 && +m[3] <= 31, 'dateLong', `"${iso}" is not a YYYY-MM-DD date`);
  return `${+m[3]} ${MONTHS_LONG[+m[2] - 1]} ${m[1]}`;
}
// the company's home country (the organization's postal address): a desk in
// it is the HOME-COUNTRY desk (Milan: an Italian agency under Italian law)
export const homeCountryOf = (shared) => String((shared && shared.organization && shared.organization.address && shared.organization.address.addressCountry) || '').toUpperCase();
export const isHomeDesk = (c, shared) => !!homeCountryOf(shared) && String(c.country || '').toUpperCase() === homeCountryOf(shared);

// ── v1.6 derivations ──────────────────────────────────────────────────────
const pad2 = (n) => String(n).padStart(2, '0');
const r1 = (n) => String(Math.round(n * 10) / 10);
// the city in capitals for the foil, the side text and the stamps (the
// accents fall: "MÜNCHEN" would not; the desks today have none)
export const upperCity = (c) => String(c.city).toUpperCase();
// the monogram of the person who answers: "Valentino Egidi" → "VE"
export const initialsOf = (name) => String(name).trim().split(/\s+/).filter(Boolean).map((w) => w[0]).join('').slice(0, 3).toUpperCase();
// THE SEAL says the desk's must-state, never a new claim: on a desk that
// sells, the phrase its leadStrong already carries; on a desk still
// opening, the first sentence of its lead ("Opening with a licensed
// partner."). Seal text = BOOM {CITY} · TENANT SIDE · {phrase} · .
export function sealPhrase(c) {
  const ls = String((c.hero && c.hero.leadStrong) || '');
  if (c.mode === 'waitlist') {
    const first = String((c.hero && c.hero.lead) || '').split(/(?<=\.)\s/)[0].replace(/\.$/, '');
    return first.toUpperCase();
  }
  if (/never paid by landlords/i.test(ls)) return 'NEVER PAID BY LANDLORDS';
  if (/we do not act for the landlord/i.test(ls)) return 'WE DO NOT ACT FOR THE LANDLORD';
  return '';
}
export const sealText = (c) => `BOOM ${upperCity(c)} · TENANT SIDE · ${sealPhrase(c)} · `;
// the papers' heading: "The papers a London landlord asks for" →
// "The papers" + the gold phrase "a London landlord asks for."
export const papersG = (c) => String(c.papers.summary).replace(/^The papers /, '') + '.';

// ── the renderers ─────────────────────────────────────────────────────────
const MAIL = (contact) => `<a class="lnk" href="mailto:${esc(contact.email)}">${esc(contact.email)}</a>`;
const R = {
  // THE FARES: one row per plan, DERIVED from pricing.plans. The row is the
  // <summary> of its ticket (label · for whom · price · condition), the
  // ticket under it says what the fee buys; on a desk that sells, the
  // refund rule sits under the €500 row (closed) and inside its ticket
  // (open — the duplicate outside hides by CSS), then the slot the door
  // moves into on a phone, then the quiet pay button.
  fares: (c, shared) => {
    const sell = c.checkout === true;
    const rule = esc(shared.refund.rule);
    const rows = list(c, 'pricing.plans').map((p) => {
      const fs0 = sell && p.id === 'full-search';
      const cond = esc(p.condition).replace(' · incl. VAT', ' ·<br> incl. VAT');
      return [
        `        <details class="fare" name="fare" id="fare-${esc(p.id)}" data-plan="${esc(p.id)}"${fs0 ? ' data-fs' : ''}>`,
        '          <summary>',
        `            <span class="f-l"><b class="f-name">${esc(p.label)}</b><span class="f-when">${esc(p.when)}</span></span>`,
        `            <span class="f-r"><span class="f-price" data-plan-price="${esc(p.id)}">${money(p.price, currencyOf(c.slug))}</span><span class="f-cond">${cond}</span></span>`,
        '            <span class="f-tog" aria-hidden="true"></span>',
        '          </summary>',
        '          <div class="tk">',
        `            <p class="tk-tag">${esc(p.name)}</p>`,
        `            <ul class="tk-inc">${p.includes.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>`,
        fs0 ? `            <p class="refund">${rule}</p>` : '',
        '            <div class="tk-slot" data-slot></div>',
        sell ? `            <button class="pay2 js" type="button" data-pay="${esc(p.id)}"><span>${esc(c.till.label)} · ${money(p.price, currencyOf(c.slug))}</span><span class="ar" aria-hidden="true">→</span></button>` : '',
        '          </div>',
        '        </details>',
        fs0 ? `        <p class="refund fs">${rule}</p>` : ''
      ].filter(Boolean).join('\n');
    });
    return [
      `      <div class="fares${c.mode === 'waitlist' ? ' long' : ''}" id="fares" role="group" aria-labelledby="faresH">`,
      `        <p class="fares-h"><b id="faresH">${esc(c.hero.faresHead.b)}</b><span>${esc(c.hero.faresHead.span)}</span></p>`,
      ...rows,
      '      </div>'
    ].join('\n');
  },

  // THE DOOR — one node: the "not sure" line (the free door is the neutral
  // decline: nothing pre-selected), the plan line once a ticket is open, the
  // two fields (revealed by the first tap, the name focused), the door, the
  // states printed where the door was. Without JS the door is hidden and a
  // line says where to write: no GET ever carries the contact data.
  act: (c, contact) => {
    const sell = c.checkout === true;
    const lead = sell ? 'no card' : 'free';
    const f = c.form, k = c.checkoutCopy;
    const hours = deskHoursText(c.desk);
    const next = f.sentNext;
    const out = [
      `          <p class="s-h" id="notSure">${esc(c.stub.notSure)}</p>`,
      '          <p class="plan-ln" id="planLn" hidden><span class="k">Your plan</span><b id="planName"></b></p>',
      `          <form id="fileForm" class="fform" novalidate action="#" autocomplete="on" data-analytics-manual data-analytics-label="${sell ? 'Free call' : 'Open my file'}" data-sending="${esc(f.sending)}" data-err-name="${esc(f.errors.name)}" data-err-contact="${esc(f.errors.contact)}" data-err-email="${esc(f.errors.email)}" data-err-net="${esc(f.errors.net)}">`,
      '            <div id="fFields" class="reveal" hidden>',
      `              <div class="fld"><label for="fName">${esc(f.name.label)}</label><input id="fName" name="name" autocomplete="name" placeholder="${esc(f.name.placeholder)}" aria-describedby="fNameErr"><p class="err" id="fNameErr" aria-live="polite"></p></div>`,
      `              <div class="fld"><label for="fContact">${esc(f.contact.label)}</label><input id="fContact" name="contact" autocomplete="email" inputmode="email" placeholder="${esc(f.contact.placeholder)}" aria-describedby="fContactErr"><p class="err" id="fContactErr" aria-live="polite"></p></div>`,
      // honeypot: a field real people never see; the server answers 200 and writes nothing
      '              <input class="hp" id="fCompany" name="company" tabindex="-1" autocomplete="off" aria-hidden="true">',
      `              <p class="consent">${esc(f.consentLead)} <a class="lnk" href="/privacy">privacy</a>. ${esc(f.consentAlt)} <a class="lnk" href="${esc(contact.waHref)}" target="_blank" rel="noopener">WhatsApp</a> · ${MAIL(contact)}</p>`,
      '            </div>',
      // a failed send is said here (role=alert), never on a valid contact field
      '            <p class="err" id="fNetErr" role="alert"></p>',
      `            <button class="door js" id="door" type="submit" disabled aria-expanded="false" aria-controls="fFields" data-wa="${esc(contact.waHref)}" data-mail="${esc(contact.email)}">`,
      `              <span><b id="doorL">${esc(c.door.label)}</b><small data-window="${lead} · {w}">${lead} · ${esc(hours)}</small></span><span class="ar" aria-hidden="true">→</span>`,
      '            </button>',
      '          </form>',
      `          <noscript><p class="s-h">Write to the desk on <a class="lnk" href="${esc(contact.waHref)}">WhatsApp</a> or at ${MAIL(contact)}.</p></noscript>`,
      '',
      // OPEN: after the 200, with the server's file number
      '          <div id="cOpen" class="card reveal" tabindex="-1" hidden>',
      // v1.6 §B.1 #9: the stamp is an SVG ink stamp (ring text on #stampArc)
      `            ${R.stamp(c, 'open')}`,
      `            <p class="k">${sell ? 'Free call' : 'Your file'}</p>`,
      '            <h2>Your file is <em>open.</em></h2>',
      '            <dl class="fields">',
      '              <div><dt>Passenger</dt><dd id="oName"></dd></div>',
      '              <div><dt>File</dt><dd id="oFile"></dd></div>',
      `              <div class="wide"><dt>Next</dt><dd><b id="oNext">${esc(f.sentWhenDefault)}</b> — ${esc(next[0][1])}</dd></div>`,
      `              <div class="wide"><dt>${esc(next[1][0])}</dt><dd>${esc(next[1][1])}</dd></div>`,
      '            </dl>',
      `            <p>${esc(next[2][0])} ${esc(next[2][1]).replace('{email}', MAIL(contact))}</p>`,
      '          </div>'
    ];
    if (sell) {
      const mail = MAIL(contact);
      out.push(
        '',
        // the payment the server has not confirmed yet: the address bar proves nothing
        `          <div id="cConfirm" class="card reveal" tabindex="-1" hidden data-unconfirmed="${esc(k.paid.unconfirmed)}">`,
        '            <p class="k">Payment</p>',
        `            <h2 id="cText">${esc(k.paid.pending)}</h2>`,
        `            <p>Questions? ${mail}</p>`,
        '          </div>',
        '',
        // PAID: only after GET /api/city-lead?paid= says paid:true
        '          <div id="cPaid" class="card reveal" tabindex="-1" hidden>',
        `            ${R.stamp(c, 'paid')}`,
        '            <p class="k">Paid</p>',
        `            <h2>${esc(k.paid.before)} <em>${esc(k.paid.em)}</em></h2>`,
        '            <dl class="fields">',
        '              <div><dt>File</dt><dd id="pFile"></dd></div>',
        '              <div><dt>Fare</dt><dd id="pFare"></dd></div>',
        '              <div class="wide"><dt>Starts</dt><dd id="pStart"></dd></div>',
        '            </dl>',
        `            <ul class="next" id="pNext">${k.paid.next.map(([a, b]) => `<li><b>${esc(a)}</b> ${esc(b)}</li>`).join('')}</ul>`,
        `            <p id="pText">${esc(k.paid.text)} ${mail}.</p>`,
        `            <p id="pWait" hidden>${esc(k.paid.wait).replace('{email}', mail)}</p>`,
        '          </div>'
      );
    }
    return out.join('\n');
  },

  // ── v1.6 §B: the pass anatomy ──
  // THE ROUTE: YOU → <IATA> on the punched track; the plane is parked where
  // the SERVER's state puts it (CSS reads #pass[data-state] into --at: the
  // page never moves it on its own). Three ticks, one per Departures row.
  // `perf` is the phone perforation (24px); `stub` is the desktop stub copy
  // (FROM / TO, the big codes). Both decorative (aria-hidden).
  route: (c, where) => {
    const line = '<span class="r-line"><i class="r-holes"></i><i class="r-tick t1"></i><i class="r-tick t2"></i><i class="r-tick t3"></i>'
      + '<i class="r-trail"></i><span class="r-run"><i class="r-hold"></i><svg class="r-plane" width="14" height="14" focusable="false"><use href="#boomPlane"/></svg></span></span>';
    if (where === 'perf') return `<span class="route route-p"><b class="ra">YOU</b>${line}<b class="rb">${esc(c.iata)}</b></span>`;
    return `<div class="route route-s" aria-hidden="true"><p class="r-lab"><span>From</span><span>To</span></p><p class="r-ends"><b class="ra">YOU</b>${line}<b class="rb">${esc(c.iata)}</b></p></div>`;
  },

  // THE ISSUER SEAL (≥940px): the desk's must-state on a ring, the mark in
  // the middle; static, decorative, derived (sealText)
  seal: (c) => `<svg class="seal" viewBox="0 0 120 120" width="104" height="104" aria-hidden="true" focusable="false"><circle class="s-o" cx="60" cy="60" r="57" fill="none"/><circle class="s-i" cx="60" cy="60" r="43" fill="none"/>`
    + `<text class="s-t"><textPath href="#sealArc" textLength="310" lengthAdjust="spacing">${esc(sealText(c))}</textPath></text>`
    + '<use href="#boomMark" x="43" y="43" width="34" height="34"/></svg>',

  // THE INK STAMP of the OPEN and PAID cards: outer ring, dashed inner ring,
  // the ring text on #stampArc (r 36 around 46,46), the word in the middle.
  // Keeps class .stamp (the .hit strike reads it).
  stamp: (c, kind) => {
    const paid = kind === 'paid';
    const ring = `${paid ? 'PAID' : 'FILE OPEN'} · BOOM ${upperCity(c)} · TENANT SIDE · `;
    return `<span class="stamp" aria-hidden="true"><svg viewBox="0 0 92 92" width="84" height="84" focusable="false"><circle class="st-o" cx="46" cy="46" r="44" fill="none"/><circle class="st-i" cx="46" cy="46" r="29" fill="none"/>`
      + `<text class="st-t"><textPath href="#stampArc" textLength="222" lengthAdjust="spacing">${esc(ring)}</textPath></text>`
      + `<text class="st-w" x="46" y="50.5" text-anchor="middle">${paid ? 'PAID' : 'OPEN'}</text></svg></span>`;
  },

  // ── v1.6 §C: the terminal walk ──
  // C.1 DEPARTURES: the three steps as a board — N° and step from k, what
  // happens from h and p, the status a validated fact (a 12-cell Solari
  // board mounted by the JS, served as text; its .sr twin says it). The
  // pill and the footer line are filled from the desk calendar, served hidden.
  dep: (c) => {
    const steps = list(c, 'how.steps');
    return [
      '      <div class="dep quadro rv" style="--i:1"><i class="tacca"></i>',
      `        <p class="dep-h" aria-hidden="true"><b>${esc(c.iata)} · DEPARTURES</b><span class="pill-st js" id="depPill" hidden><i class="dot"></i><span id="depPillT"></span></span></p>`,
      '        <p class="dep-cols" aria-hidden="true"><span>N°</span><span>Step</span><span>What happens</span><span>Status</span></p>',
      '        <ol class="dep-rows" aria-labelledby="howH">',
      ...steps.map((s, i) => {
        const m = STEP_K_RE.exec(s.k) || [];
        return [
          `          <li class="dep-r rv" id="dep-${i + 1}" style="--i:${i + 2}">`,
          `            <span class="n" data-instr aria-hidden="true">${pad2(m[1])}</span>`,
          `            <span class="s" data-instr>${esc(m[2])}</span>`,
          `            <span class="w"><b class="dh">${esc(s.h)}</b> <span class="dp">${esc(s.p)}</span></span>`,
          `            <span class="st" data-instr><span class="st-b" data-word="${esc(s.status)}" aria-hidden="true">${esc(s.status)}</span><span class="sr" id="dep-${i + 1}-sr">Status: ${esc(s.status.toLowerCase())}</span></span>`,
          '          </li>'
        ].join('\n');
      }),
      '        </ol>',
      `        <p class="dep-f js" hidden><span data-gate="{w}">${esc(deskHoursText(c.desk))}</span></p>`,
      '      </div>',
      '      <p class="sr" id="depLive" aria-live="polite"></p>'
    ].join('\n');
  },

  // C.2 PRE-FLIGHT: the checks as lanes, folded (kicker = the legal tag,
  // then the title; the sentence opens). No verdicts, no ticks: a lane is a
  // point we check, never "checked for you".
  lanes: (c) => [
    '      <div class="lanes quadro"><i class="tacca"></i>',
    `        <p class="lanes-h" aria-hidden="true">${esc(c.iata)} · PRE-FLIGHT · WHAT WE CHECK</p>`,
    ...list(c, 'checks.items').map((k, i) =>
      `        <details class="lane rv" id="check-${esc(k.id)}" style="--i:${i}"><summary><span class="ln" aria-hidden="true">${pad2(i + 1)}</span> <span class="at" data-instr>${esc(k.at)}</span> <span class="t">${esc(k.title)}</span></summary><p>${esc(k.text)}</p></details>`),
    '      </div>'
  ].join('\n'),

  // C.3 BAGGAGE: the eight papers the city's landlords ask for, as static
  // luggage tags — no inputs, no count, no meter (the v1.5 lesson: the quiz)
  tags: (c) => [
    `      <p class="manifest" aria-hidden="true">${esc(c.iata)} · BAGGAGE · ${esc(String(c.papers.at).toUpperCase())}</p>`,
    '      <ol class="tags" aria-labelledby="papersH">',
    ...c.papers.items.map((t, i) =>
      `        <li class="tag rv" style="--i:${i}"><span class="eye" aria-hidden="true"></span><span class="tn" aria-hidden="true">${esc(c.iata)} ${pad2(i + 1)}</span> <span class="tt">${esc(t)}</span></li>`),
    '      </ol>',
    `      <p class="tail rv">${esc(c.papers.tail)}</p>`
  ].join('\n'),

  // C.4 GATE: who answers and when (served as text), then the instruments
  // the JS fills from the desk calendar, all served hidden: the clocks (one
  // node: here on a phone, in the stub's #stubGate at ≥940px), the week
  // and the outlined door twin #deskGo (never filled gold).
  gate: (c, contact, doorLead, deskLineHtml) => {
    const hours = esc(deskHoursText(c.desk));
    return [
      '      <div class="gate-g quadro"><i class="tacca"></i>',
      `        <div class="who rv" style="--i:0"><span class="mono" aria-hidden="true">${esc(initialsOf(c.desk.person))}</span><p><b>${esc(c.desk.person)}</b> <span>${esc(c.desk.role)}</span></p></div>`,
      `        <p class="hrs rv" style="--i:1">${deskLineHtml}</p>`,
      '        <div id="deskClocks">',
      '          <div class="clocks quadro js" id="clocks" hidden><i class="tacca"></i>',
      `            <div class="ck" data-instr><p class="ck-l">${esc(zoneWords(c.desk))}</p><p class="ck-v"><span class="ck-b" id="ckDesk" aria-hidden="true"></span><span class="ck-z" id="ckZone"></span><span class="sr" id="ckDeskSr"></span></p></div>`,
      '            <div class="ck" id="ckYouRow" data-instr><p class="ck-l">Where you are</p><p class="ck-v" id="ckYou"></p></div>',
      `            <p class="gate"><i class="dot"></i><span data-gate="{w}">${hours}</span></p>`,
      '          </div>',
      '        </div>',
      '        <ol class="week js" id="week" hidden aria-label="The desk this week"></ol>',
      `        <button class="door2 js" id="deskGo" type="button" hidden><b>${esc(c.door.label)}</b><small data-gate="${doorLead} · {w}">${doorLead} · ${hours}</small></button>`,
      `        <p class="write rv" style="--i:2">Write instead: <a class="lnk" href="${esc(contact.waHref)}" target="_blank" rel="noopener">WhatsApp</a> · <a class="lnk" href="mailto:${esc(contact.email)}">email</a></p>`,
      '      </div>'
    ].join('\n');
  },

  // C.5 QUESTIONS: the folds, numbered (the number is decoration)
  faq: (c) => list(c, 'faq.items').map((f, i) =>
    `        <details><summary><span class="qn" aria-hidden="true">${pad2(i + 1)}</span> <span class="t">${esc(f.q)}</span></summary><p>${esc(f.a)}</p></details>`).join('\n'),

  // C.6 NETWORK: EVERY desk (BOOM Desks, 03/11/2026). The map (decorative,
  // ≥640px) puts every dot at its real coordinates: the live desks with an
  // arc from Rome (an arc means "operated from Rome"), this desk's in gold
  // (on a draft too), the desks not open as a hollow dot with NO arc and no
  // link; Rome the hub, with its ring. The list is the navigation: the
  // family (familyFor: live sisters on a live page, all on a draft), the
  // desks not open as plain text on a live page, BOOM Rome, then every desk
  // on one page (/desks).
  net: (c, fam, shared, cities = [c], europe = null) => {
    const hub = mapXY(shared.rome.geo);
    // the bows are chosen over every desk with coordinates, so an arc is the same on every page
    const bows = bowArcs(hub, cities.filter((x) => x.iata && x.geo).map((x) => [x.iata, mapXY(x.geo)]).concat(cities.some((x) => x.iata === c.iata) ? [] : [[c.iata, mapXY(c.geo)]]));
    const others = cities.filter((x) => x.slug !== c.slug && x.iata && x.geo).sort((a, b) => a.slug.localeCompare(b.slug));
    const liveSis = others.filter((x) => x.live === true), offSis = others.filter((x) => x.live !== true);
    const me = mapXY(c.geo);
    const arcs = [...liveSis.map((x) => ({ key: x.iata, to: mapXY(x.geo) })), { key: c.iata, to: me, me: true }]
      .map((a) => ({ ...a, c: arcCtrl(hub, a.to, bows.get(a.key) ?? 0.18) }));
    // a desk not open: a dot, no arc; its label sides by the arc it WOULD have
    const offs = offSis.map((x) => { const to = mapXY(x.geo); return { key: x.iata, to, c: arcCtrl(hub, to, bows.get(x.iata) ?? 0.18) }; });
    const bad = arcViolations(hub, arcs, [...liveSis.map((x) => ({ key: x.iata, xy: mapXY(x.geo), r: ARC_DOT_R })), ...offs.map((o) => ({ key: o.key, xy: o.to, r: ARC_DOT_R })), { key: c.iata, xy: me, r: ARC_ME_R }]);
    need(!bad.length, `cities/${c.slug}.json`, `the network map draws an arc over a desk: ${bad.join('; ')}`);
    // the sisters' arcs first, this desk's (gold) over them; a label sits on the side its arc does not come from
    const path = (a, i) => `<path class="arc${a.me ? ' me' : ''}" style="--i:${a.me ? 0 : i + 1}" pathLength="1" fill="none" d="${arcD(hub, a)}"/>`;
    // each label takes the first side no drawn arc crosses (labelFor)
    const drawn = arcs.map((a) => arcPts(hub, a.c, a.to, 240));
    const lab = (a, cls = '') => labelFor(a, drawn, cls);
    const mine = arcs[arcs.length - 1];
    const coast = europe && typeof europe.desk === 'string' && /^[MLZ0-9 .\-]+$/.test(europe.desk) ? europe.desk : null;
    const svg = [
      '<svg class="map" viewBox="0 0 600 420" aria-hidden="true" focusable="false">',
      // the coast (cities/_europe.json `desk`, the same Natural Earth drawing as the hub, cut to this
      // box): land as a finer dot matrix under the sea dots; without the file, the sea dots alone
      '<defs><pattern id="netDots" width="12" height="12" patternUnits="userSpaceOnUse"><circle cx="6" cy="6" r=".5" fill="#fff" fill-opacity=".08"/></pattern>'
        + (coast ? '<pattern id="netLand" width="6" height="6" patternUnits="userSpaceOnUse"><circle cx="3" cy="3" r=".8" fill="#fff" fill-opacity=".14"/></pattern>'
          + `<clipPath id="netCoast" clip-rule="evenodd"><path d="${esc(coast)}"/></clipPath>` : '') + '</defs>',
      '<rect class="m-bg" width="600" height="420" fill="url(#netDots)"/>',
      coast ? '<rect class="m-land" width="600" height="420" fill="url(#netLand)" clip-path="url(#netCoast)"/>' : '',
      ...arcs.map(path),
      ...liveSis.map((x) => { const [px, py] = mapXY(x.geo); return `<circle class="d" cx="${r1(px)}" cy="${r1(py)}" r="${ARC_DOT_R}"/>`; }),
      ...offs.map((o) => `<circle class="d off" cx="${r1(o.to[0])}" cy="${r1(o.to[1])}" r="${ARC_DOT_R}" fill="none"/>`),
      `<circle class="d-ring" cx="${r1(me[0])}" cy="${r1(me[1])}" r="${ARC_ME_R}" fill="none"/><circle class="d me" cx="${r1(me[0])}" cy="${r1(me[1])}" r="4"/>`,
      `<circle class="hub" cx="${r1(hub[0])}" cy="${r1(hub[1])}" r="5" fill="none"/><circle class="hub-r" cx="${r1(hub[0])}" cy="${r1(hub[1])}" r="${HUB_RING_R}" fill="none"/>`,
      ...arcs.slice(0, -1).map((a) => lab(a)),
      ...offs.map((o) => lab(o, ' off')),
      lab(mine, ' me'),
      // the hub's label clears its ring
      `<text class="m-l hub" x="${r1(hub[0] + HUB_RING_R + 4)}" y="${r1(hub[1] + 4)}">${ROME_IATA}</text>`,
      '</svg>'
    ].filter(Boolean).join('');
    // the family's sisters, then (a live page) the desks not open — plain
    // text, never a link — then BOOM Rome, then every desk on one page
    const sisterHref = new Set(cities.map((x) => `/${x.slug}`));
    const li = (f) => `          <li><a href="${esc(f.href)}"><b data-instr>${esc(f.iata)}</b> ${esc(f.label)}</a></li>`;
    const items = [
      ...fam.filter((f) => sisterHref.has(f.href)).map(li),
      ...(c.live === true ? offSis.map((x) => `          <li class="off"><b data-instr>${esc(x.iata)}</b> ${esc(x.city)} · not open</li>`) : []),
      ...fam.filter((f) => !sisterHref.has(f.href)).map(li),
      `          <li class="all"><a href="${HUB_PATH}"><b data-instr>ALL</b> Every BOOM desk</a></li>`
    ];
    return [
      '      <div class="net-g">',
      `        ${svg}`,
      '        <p class="net-k" aria-hidden="true"><i class="k-l"></i>live desk <i class="k-o"></i>not open <i class="k-h"></i>Rome, the hub</p>',
      '        <ul class="net">',
      ...items,
      '        </ul>',
      '      </div>'
    ].join('\n');
  },

  // The fact sheet: the fees row is DERIVED from the plans (with each plan's
  // own condition and, on a sell desk, the refund rule) and the contact row
  // from _shared.json, so the quotable ledger cannot drift from the page.
  bref: (c, shared, pageUrl, contact = shared.contact) => list(c, 'bref.rows').map((r) => {
    let dd = r.ddHtml || '';
    if (r.fees) dd = feesRowOf(c, shared, dd);
    if (r.contact) {
      const k = contact;
      dd = `<a class="lnk" href="mailto:${esc(k.email)}">${esc(k.email)}</a> · <a class="lnk" href="${esc(waHref(k, c.city))}">WhatsApp ${esc(k.phoneDisplay)}</a>`
        + ` · <a class="lnk" href="${esc(pageUrl)}">${esc(pageUrl.replace(/^https:\/\/(www\.)?/, ''))}</a>`;
    }
    need(dd, `cities/${c.slug}.json`, `bref row "${r.dt}" has no content`);
    return `          <dt>${esc(r.dt)}</dt><dd>${dd}</dd>`;
  }).join('\n'),

  // §D THE FOOTER: the statement under the mark, then three columns — this
  // desk (contacts and hours), legal (terms, privacy — the cookie link is
  // cloned next to it by boom-consent.js — and, where the desk sells, the
  // model withdrawal form), the company. The sister desks moved to Network.
  foot: (c, shared, contact, deskLineHtml) => {
    const e = shared.entity;
    const operator = String(e.legalName).replace(/\s+S\.r\.l\.?$/i, '').toUpperCase();
    return [
      '    <footer class="foot">',
      `      <div class="f-top"><svg aria-hidden="true"><use href="#boomMark"/></svg><b>BOOM ${esc(c.city)}</b><p class="stmt">${esc(c.footer.statement)}</p></div>`,
      '      <div class="f-grid">',
      `        <nav aria-label="This desk"><h3>This desk</h3> <a href="mailto:${esc(contact.email)}">${esc(contact.email)}</a> <a href="tel:+${esc(contact.whatsapp)}">${esc(contact.phoneDisplay)}</a> <a href="${esc(contact.waHref)}" target="_blank" rel="noopener">WhatsApp</a> <p>${deskLineHtml}</p></nav>`,
      `        <nav aria-label="Legal"><h3>Legal</h3> <a href="${TERMS_PATH}">Terms</a> <a href="/privacy">Privacy</a>${c.checkout === true ? ` <a href="${WITHDRAWAL_PATH}?desk=${encodeURIComponent(c.city)}">Withdrawal form</a>` : ''}</nav>`,
      `        <div class="f-co"><h3>Company</h3><p><a href="/buy-property-europe">Buying in Europe</a></p><p>${esc(e.legalName)}</p><p>${esc(e.address)}</p><p>Registered office: ${esc(e.registeredOffice)}</p><p>P.IVA ${esc(e.vat)} · REA ${esc(e.rea)}</p></div>`,
      '      </div>',
      `      <p class="tm">${esc(e.trademark)}</p>`,
      `      <p class="cr">© ${esc(shared.copyrightYear)} BOOM <span class="mono" aria-hidden="true">· ${esc(c.iata)} · TENANT SIDE · OPERATED BY ${esc(operator)}</span></p>`,
      '    </footer>'
    ].join('\n');
  },

  // THE TILL (one per page, only where the desk sells) as a native <dialog>:
  // focus trap, Escape and the inert backdrop come from the browser. It opens
  // only from an explicit pay button, on THAT plan. In DOM order: the plan,
  // its price and what it buys (the refund rule on Full Search, LAU art. 20
  // on a Spanish desk); name, email, an optional note; the UNTICKED start-now
  // request; the withdrawal line with the model form; the pay button that
  // follows the tick; the fine print; the way back to the free door.
  till: (c, shared, contact) => {
    if (c.checkout !== true) return '';
    const k = c.checkoutCopy, f = c.form;
    const wd = esc(k.withdrawal)
      .replace('{email}', MAIL(contact))
      .replace('{form}', `<a class="lnk" href="${WITHDRAWAL_PATH}?desk=${encodeURIComponent(c.city)}" target="_blank" rel="noopener">model withdrawal form</a>`);
    return [
      `<dialog class="till" id="till" aria-labelledby="tTitle" data-err-name="${esc(k.errors.name)}" data-err-email="${esc(k.errors.email)}" data-err-net="${esc(k.errors.net)}">`,
      '  <form class="tf" id="tillForm" novalidate action="#" data-analytics-manual data-analytics-kind="checkout" data-analytics-label="Till">',
      '    <button class="x" type="button" id="tillX" aria-label="Close">×</button>',
      `    <p class="k">Fare · BOOM ${esc(c.city)}</p>`,
      '    <div class="t-head"><h2 id="tTitle" tabindex="-1"></h2><p class="t-price"><b id="tPrice"></b><span id="tCond"></span></p></div>',
      '    <p class="t-tag" id="tTag"></p>',
      '    <ul class="t-inc" id="tInc"></ul>',
      `    <p class="refund" id="tRule" hidden>${esc(shared.refund.rule)}</p>`,
      c.pricing.sub ? `    <p class="t-opt">${esc(c.pricing.sub)}</p>` : '',
      `    <div class="fld"><label for="tName">${esc(f.name.label)}</label><input id="tName" autocomplete="name" placeholder="${esc(f.name.placeholder)}" aria-describedby="tNameErr"><p class="err" id="tNameErr" aria-live="polite"></p></div>`,
      '    <div class="fld"><label for="tEmail">Email <i>— the invoice and your file go there</i></label><input id="tEmail" type="email" autocomplete="email" inputmode="email" placeholder="anna@company.com" aria-describedby="tEmailErr"><p class="err" id="tEmailErr" aria-live="polite"></p></div>',
      `    <div class="fld"><label for="tNote">${esc(k.noteLabel)} <i>(optional)</i></label><input id="tNote" placeholder="${esc(k.notePlaceholder)}"></div>`,
      '    <input class="hp" id="tCompany" tabindex="-1" autocomplete="off" aria-hidden="true">',
      `    <label class="tick"><input type="checkbox" id="tStart"><span>${esc(k.startNow)}</span></label>`,
      `    <p class="wd">${wd}</p>`,
      '    <p class="err" id="tErr" role="alert"></p>',
      `    <button class="pay" id="tGo" type="submit" data-label-now="${esc(c.till.label)}" data-label-wait="${esc(c.till.labelWait)}" data-sub-now="${esc(k.btnSubNow)}" data-sub-wait="${esc(k.btnSubWait)}"><span><b id="tGoL">${esc(c.till.labelWait)}</b><small id="tGoS">${esc(k.btnSubWait)}</small></span><span class="ar" aria-hidden="true">→</span></button>`,
      `    <p class="fine">${esc(k.fine)} <a class="lnk" href="${TERMS_PATH}" target="_blank" rel="noopener">Terms</a></p>`,
      `    <p class="alt">${esc(k.altLead)} <button type="button" class="lnk" id="tAlt">${esc(k.altLink)}</button></p>`,
      '  </form>',
      '</dialog>'
    ].filter(Boolean).join('\n');
  }
};

// ── JSON-LD: Organization (shared) + WebPage (speakable) + Service with its
// Offers + FAQ. The FAQ answers are the visible answers, word for word: a
// schema that says something the page doesn't show is hidden content
// (tests/seo, rule FAQ). Breadcrumb in its own block, as on every page.
function jsonLdBreadcrumb(c, shared, pageUrl) {
  return {
    '@context': 'https://schema.org', '@type': 'BreadcrumbList', '@id': pageUrl + '#breadcrumb',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Home', item: shared.siteUrl + '/' },
      { '@type': 'ListItem', position: 2, name: HUB_NAME, item: shared.siteUrl + HUB_PATH },
      { '@type': 'ListItem', position: 3, name: c.city, item: pageUrl }
    ]
  };
}
const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
// THE ORGANIZATION node (RealEstateAgent "BOOM Rome"), ONE function: every
// desk page and the hub declare the same node (the hub's test deep-equals it).
// Where BOOM serves, as a fact: Rome and the desks that are LIVE. A draft
// never puts its city in the Organization's areaServed.
export function orgNode(shared, cities) {
  const site = shared.siteUrl;
  const o = shared.organization;
  const served = ['Rome', ...cities.filter((x) => x.live === true).map((x) => x.city)];
  return {
    '@type': 'RealEstateAgent', '@id': site + '/#organization', name: o.name, alternateName: 'BOOM', legalName: o.legalName, url: site, logo: o.logo,
    founder: o.founder, address: o.address, vatID: o.vatID, contactPoint: o.contactPoint,
    description: o.description, areaServed: served,
    ...(shared.rome && /^https:\/\//.test(shared.rome.profileUrl || '') ? { sameAs: [shared.rome.profileUrl] } : {})
  };
}
// THE SERVICE node of a desk, with its Offers, ONE function: the desk page
// declares it and the hub repeats it byte for byte (deep-equal, tested).
export function serviceNode(c, shared, pageUrl, orgId) {
  const waitlist = c.mode === 'waitlist';
  // "What we don't do" from the fact sheet rides on the Service: a source
  // that says its limits is a source an answer engine quotes
  const dont = (c.bref.rows.find((r) => r.dt === "What we don't do") || {}).ddHtml || '';
  return {
    '@type': 'Service', '@id': pageUrl + '#service', name: c.service.name, serviceType: c.service.serviceType,
    description: c.service.description + (dont ? " What we don't do: " + dont.replace(/<[^>]+>/g, '') : ''), provider: { '@id': orgId },
    areaServed: { '@type': 'City', name: c.city },
    audience: { '@type': 'Audience', audienceType: c.service.audience },
    hoursAvailable: { '@type': 'OpeningHoursSpecification', dayOfWeek: c.desk.days.map((d) => DAY_NAMES[d]), opens: c.desk.hours.from, closes: c.desk.hours.to },
    availableChannel: { '@type': 'ServiceChannel', serviceUrl: pageUrl, availableLanguage: String(c.country).toUpperCase() === 'IT' ? ['en', 'it'] : 'en' }, url: pageUrl,
    // InStock where the desk takes searches, PreOrder where it opens
    // later — a list price whose Offer says in words when it is charged.
    // VAT is included on the page: the price specification states it.
    offers: c.pricing.plans.map((p) => {
      const unitWord = p.unit ? p.unit.replace(/^per\s+/i, '').trim() : '';
      return {
        '@type': 'Offer', name: p.label, price: String(p.price), priceCurrency: currencyOf(c.slug),
        availability: waitlist ? 'https://schema.org/PreOrder' : 'https://schema.org/InStock',
        description: p.offerDescription + (p.unit ? ' Priced ' + p.unit + '.' : '') + ' ' + p.conditionLong
          + (c.checkout === true && p.id === 'full-search' ? ' ' + shared.refund.rule : ''),
        priceSpecification: { '@type': 'UnitPriceSpecification', price: String(p.price), priceCurrency: currencyOf(c.slug), valueAddedTaxIncluded: true,
          ...(unitWord ? { unitText: unitWord, referenceQuantity: { '@type': 'QuantitativeValue', value: 1, unitText: unitWord } } : {}) },
        url: pageUrl + '#fare-' + p.id,
        seller: { '@id': orgId },
        itemOffered: { '@type': 'Service', name: p.label, description: `For: ${p.when}.` }
      };
    })
  };
}
function jsonLd(c, shared, pageUrl, ogImage, cities = [c]) {
  const site = shared.siteUrl;
  const orgId = site + '/#organization';
  return {
    '@context': 'https://schema.org',
    '@graph': [
      orgNode(shared, cities),
      {
        '@type': 'WebPage', '@id': pageUrl + '#page', url: pageUrl, name: c.meta.ogTitle, description: c.meta.description, inLanguage: 'en',
        isPartOf: { '@id': site + '/#website' }, about: { '@id': orgId }, mainEntity: { '@id': pageUrl + '#service' }, breadcrumb: { '@id': pageUrl + '#breadcrumb' },
        primaryImageOfPage: { '@type': 'ImageObject', url: ogImage, width: 1200, height: 630 },
        ...(c.updated ? {
          dateModified: c.updated, publisher: { '@id': orgId },
          author: { '@type': 'Person', name: c.desk.person, jobTitle: c.desk.role, worksFor: { '@id': orgId } }
        } : {}),
        speakable: { '@type': 'SpeakableSpecification', cssSelector: ['.pass .lead', '.foot .stmt', '.enbref'] }
      },
      serviceNode(c, shared, pageUrl, orgId),
      {
        '@type': 'FAQPage', '@id': pageUrl + '#faq', isPartOf: { '@id': pageUrl + '#page' }, inLanguage: 'en',
        mainEntity: list(c, 'faq.items').map((f) => ({
          '@type': 'Question', name: f.q, acceptedAnswer: { '@type': 'Answer', text: f.a }
        }))
      }
    ]
  };
}

// What must be replaced before a page may go live. Bracketed copy is found in
// the VISIBLE text (scripts and styles removed, tags turned into spaces) AND
// in the markup's attribute values (placeholder=, meta content=, alt, aria).
export function findPlaceholders(html, city, { root = ROOT, shared = null } = {}) {
  const found = [];
  const noCode = html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ');
  const text = noCode.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
  for (const m of text.matchAll(/\[[^\[\]]{1,300}\]/g)) found.push(m[0].replace(/\s+/g, ' ').trim());
  for (const tag of noCode.matchAll(/<[a-z][^>]*>/gi)) {
    for (const attr of tag[0].matchAll(/\s[a-z-]+="([^"]*)"/gi)) {
      for (const m of attr[1].matchAll(/\[[^\[\]]{1,300}\]/g)) found.push(`${m[0].replace(/\s+/g, ' ').trim()} (in an attribute)`);
    }
  }
  for (const [k, v] of Object.entries(city.config || {})) {
    if (typeof v === 'string' && /REPLACE|X{4,}/.test(v)) found.push(`config.${k} = ${v}`);
  }
  if (city.slug && !fs.existsSync(path.join(root, `og-${city.slug}.png`))) {
    found.push(`og-${city.slug}.png is missing (python3 design/pages-deco/genera-og-cities.py)`);
  }
  // A desk that sells links the model withdrawal form (Annex I(B)): the page
  // it points to must exist, or the link a payer needs is a 404.
  if (city.checkout === true && !fs.existsSync(path.join(root, WITHDRAWAL_PATH.slice(1) + '.html'))) {
    found.push(`${WITHDRAWAL_PATH.slice(1)}.html is missing: the till links the model withdrawal form`);
  }
  // A sell desk prints "4.9 on Google in Rome": a rating that cannot be
  // clicked is an assertion. The founder owns the URL.
  if (shared && city.checkout === true && !(shared.rome && /^https:\/\//.test(shared.rome.profileUrl || ''))) {
    found.push('_shared.json rome.profileUrl is empty: the Rome rating must link to the Google profile on a desk that sells');
  }
  return [...new Set(found)];
}

// The fragments every page inlines, read from their single source.
export function fragments(root = ROOT) {
  const scrollCss = fs.readFileSync(path.join(root, 'css/boom-scroll.css'), 'utf8');
  const scrollJs = fs.readFileSync(path.join(root, 'js/boom-scroll.js'), 'utf8');
  const solari = fs.readFileSync(path.join(root, 'design/pages-deco/solari-engine.html'), 'utf8');
  const cal = fs.readFileSync(path.join(root, 'js/desk-calendar.js'), 'utf8');
  need(/window\.BoomSolari\s*=/.test(solari) && /\.fc2\s*\{/.test(solari), 'design/pages-deco/solari-engine.html',
    'is not the Solari engine fragment (expected the .fc2 cell CSS and window.BoomSolari)');
  need(/root\.BOOM_DESK_CAL\s*=/.test(cal) && !/<\/?script/i.test(cal), 'js/desk-calendar.js', 'is not the desk calendar (expected window.BOOM_DESK_CAL, no script tags)');
  return {
    scrollBlock: `<!-- BOOM_SCROLL:START -->\n<style>\n${scrollCss}</style>\n<script>\n${scrollJs}</script>\n<!-- BOOM_SCROLL:END -->`,
    solariEngine: solari.trimEnd(),
    // the calendar travels without its comments (they stay in the source);
    // only whole-line comments are dropped, so no string is ever touched
    deskCalendar: `<script>\n${cal.replace(/\/\*[\s\S]*?\*\//g, '').split('\n').filter((l) => !/^\s*\/\//.test(l) && l.trim()).join('\n')}\n</script>`
  };
}

// The first-party bytes of a page, gzipped: the page itself and the files
// it links that every visitor downloads. The budget is a build refusal.
// v1.6: the onda canvas script (assets/boom-onda.js) is counted in the
// total, and the CSS and the onda have caps of their own.
export function weightOf(html, root = ROOT) {
  const gz = (buf) => zlib.gzipSync(buf, { level: 9 }).length;
  const file = (f) => gz(fs.readFileSync(path.join(root, f)));
  const js = file('assets/boom-city.js'), css = file('assets/boom-city.css'), onda = file('assets/boom-onda.js');
  const total = gz(Buffer.from(html)) + css + js + onda + file('js/boom-consent.js') + file('js/boom-track.js');
  return { totalKb: total / 1024, jsKb: js / 1024, cssKb: css / 1024, ondaKb: onda / 1024 };
}

export const visibleText = (html) => html.replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/&[a-z#0-9]+;/g, ' ').replace(/\s+/g, ' ');
export const sliceOf = (h, a, b) => { const i = h.indexOf(a); const j = i < 0 ? -1 : h.indexOf(b, i); return i < 0 || j < 0 ? '' : h.slice(i, j); };
// what a reader sees at load: every <details> closed (its summary only),
// the elements served hidden, the dialog, the noscript lines and the
// screen-reader-only text out (a small tag walk: nested elements of the
// same name are counted, so a hidden card takes all of itself away).
// atLoadHtml keeps the tags of what stays (the per-section caps, the
// prose/instrument split and the node rule read them); comments go.
const VOID_TAGS = new Set(['br', 'img', 'input', 'meta', 'link', 'hr', 'use', 'path', 'stop', 'source', 'wbr', 'circle', 'rect']);
export function atLoadHtml(html) {
  // a closed <details> shows its summary only (the pages nest no details)
  const body = html.slice(html.indexOf('<body'))
    .replace(/<details\b(?![^>]*\sopen\b)[^>]*>\s*<summary\b[^>]*>([\s\S]*?)<\/summary>[\s\S]*?<\/details>/gi, ' $1 ');
  const out = [];
  const re = /<!--[\s\S]*?-->|<(\/?)([a-zA-Z][a-zA-Z0-9]*)\b([^>]*)>/g;
  let i = 0, skip = null, depth = 0, m;
  while ((m = re.exec(body))) {
    if (!skip) out.push(body.slice(i, m.index));
    i = re.lastIndex;
    if (m[0].startsWith('<!--')) continue;
    const close = m[1] === '/', name = m[2].toLowerCase(), attrs = m[3] || '';
    if (skip) {
      if (name === skip && !VOID_TAGS.has(name)) { depth += close ? -1 : (/\/\s*$/.test(attrs) ? 0 : 1); if (depth === 0) skip = null; }
      continue;
    }
    if (close || VOID_TAGS.has(name)) { out.push(m[0]); continue; }
    const hidden = /\shidden(?=[\s>=]|$)/.test(' ' + attrs) || /\bclass="sr"/.test(attrs) || /\baria-hidden="true"/.test(attrs) || ['dialog', 'noscript', 'script', 'style', 'template', 'svg'].includes(name);
    if (hidden) { skip = name; depth = 1; continue; }
    out.push(m[0]);
  }
  if (!skip) out.push(body.slice(i));
  return out.join('');
}
// v1.6: the words at load split in two — INSTRUMENTS (the text inside an
// element carrying data-instr: codes, column heads, statuses, kickers) and
// PROSE (everything else). The richness of the page is meant to come from
// instruments, not paragraphs.
const INSTR_ATTR = /(?:^|\s)data-instr(?=[\s=>/]|$)/;
export function atLoadParts(html) {
  const at = atLoadHtml(html);
  const prose = [], instr = [];
  const re = /<(\/?)([a-zA-Z][a-zA-Z0-9]*)\b([^>]*)>/g;
  const stack = [];
  let i = 0, m, inInstr = 0;
  const put = (t) => (inInstr > 0 ? instr : prose).push(t);
  while ((m = re.exec(at))) {
    put(at.slice(i, m.index));
    i = re.lastIndex;
    prose.push(' '); instr.push(' ');
    const close = m[1] === '/', name = m[2].toLowerCase(), attrs = m[3] || '';
    if (VOID_TAGS.has(name) || /\/\s*$/.test(attrs)) continue;
    if (close) {
      for (let k = stack.length - 1; k >= 0; k--) {
        if (stack[k].name === name) { for (let j = stack.length - 1; j >= k; j--) if (stack[j].instr) inInstr--; stack.length = k; break; }
      }
      continue;
    }
    const isInstr = INSTR_ATTR.test(attrs);
    stack.push({ name, instr: isInstr });
    if (isInstr) inInstr++;
  }
  put(at.slice(i));
  return { html: at, prose: visibleText(prose.join('')), instr: visibleText(instr.join('')) };
}
export function visibleAtLoad(html) {
  const p = atLoadParts(html);
  return visibleText(p.prose + ' ' + p.instr);
}
// THE NODE RULE (Ticket Wallet's anti-paragraph rule): every element's OWN
// direct text, at load, is at most BUDGET.node words — except the footer
// statement (.stmt, the legal sentence). Returns the offenders.
// `exempt(node)` (optional) lets a page exempt more nodes; node is
// { name, cls, parentCls } (the hub: each .enbref dd, capped on its own).
export function longNodes(atHtml, max = BUDGET.node, exempt = null) {
  const re = /<(\/?)([a-zA-Z][a-zA-Z0-9]*)\b([^>]*)>/g;
  const stack = [{ name: '#root', cls: '', parentCls: '', text: [] }];
  const long = [];
  const done = (n) => {
    const t = visibleText(n.text.join(' ')).trim();
    const w = words(t);
    if (w > max && !/(?:^|\s)stmt(?:\s|$)/.test(n.cls) && !(exempt && exempt(n))) long.push({ tag: n.name, cls: n.cls, words: w, text: t.slice(0, 90) });
  };
  let i = 0, m;
  while ((m = re.exec(atHtml))) {
    stack[stack.length - 1].text.push(atHtml.slice(i, m.index));
    i = re.lastIndex;
    const close = m[1] === '/', name = m[2].toLowerCase(), attrs = m[3] || '';
    if (VOID_TAGS.has(name) || /\/\s*$/.test(attrs)) continue;
    if (close) {
      for (let k = stack.length - 1; k >= 1; k--) {
        if (stack[k].name === name) { while (stack.length > k) done(stack.pop()); break; }
      }
      continue;
    }
    stack.push({ name, cls: (/\sclass="([^"]*)"/.exec(' ' + attrs) || [])[1] || '', parentCls: stack[stack.length - 1].cls, text: [] });
  }
  stack[stack.length - 1].text.push(atHtml.slice(i));
  while (stack.length) done(stack.pop());
  return long;
}

// The keys of the quiz pages (v1.2–v1.4) and of the v1.4 hero: refused by
// name, so a stale JSON cannot ship them.
const LEFTOVERS = {
  // v1.6: the rejected proposals' keys (ops, flight, rules, routeMap) too
  top: ['checkin', 'glance', 'plan', 'facts', 'factsDerived', 'nav', 'machine', 'truth', 'band', 'paybar', 'ops', 'flight', 'rules', 'routeMap'],
  hero: ['lead2', 'faresNote', 'eyebrow', 'h1Em', 'sub', 'trust'],
  form: ['email', 'phone', 'moveIn', 'budget', 'budgetOptions', 'service', 'more', 'situation', 'areas', 'message', 'sentBefore', 'sentEm', 'submit'],
  pricing: ['num', 'h2', 'h2g', 'note', 'featuredTag'],
  plan: ['se', 'text', 'prepares', 'cta', 'per'],
  door: ['sub', 'stripSub', 'skip'],
  checkoutCopy: ['title', 'note', 'offer', 'btn', 'btnSub', 'paybarSub'],
  footer: ['tagline', 'status'],
  shared: ['moveInFrom', 'desksLabel']
};

// What the page READS, object by object. Anything else is refused: a key no
// renderer prints is copy everybody believes is on the page.
const ALLOWED = {
  '': ['slug', 'city', 'country', 'currency', 'iata', 'geo', 'live', 'mode', 'config', 'updated', 'word', 'meta', 'service', 'hero', 'pricing', 'stub', 'how', 'checks', 'papers', 'faq', 'bref', 'footer', 'desk', 'door', 'form', 'checkout', 'checkoutCopy', 'till'],
  geo: ['lat', 'lon'],
  // v1.6: the items of every list are key-checked too (closing the gap where
  // a step, a check or a question could carry a key nobody prints — e.g. a
  // check "verdict", a step "when")
  'how.step': ['k', 'h', 'p', 'status'],
  'checks.item': ['id', 'title', 'at', 'text'],
  'faq.item': ['q', 'a'],
  'bref.row': ['dt', 'ddHtml', 'fees', 'contact'],
  meta: ['title', 'description', 'ogTitle', 'ogDescription'],
  service: ['name', 'serviceType', 'description', 'audience'],
  hero: ['h1Before', 'lead', 'leadStrong', 'faresHead'],
  'hero.faresHead': ['b', 'span'],
  pricing: ['plans', 'sub'],
  plan: ['id', 'label', 'unit', 'name', 'price', 'condition', 'conditionLong', 'includes', 'offerDescription', 'when'],
  stub: ['notSure'],
  how: ['h2', 'h2g', 'steps'], checks: ['h2', 'h2g', 'items'], papers: ['summary', 'at', 'items', 'tail'], faq: ['h2', 'items'],
  bref: ['h2', 'rows'], footer: ['statement'], door: ['label'],
  desk: ['person', 'role', 'timeZone', 'tzLabel', 'zoneName', 'hours', 'days'],
  form: ['name', 'contact', 'consentLead', 'consentAlt', 'errors', 'sending', 'sentNext', 'sentWhenDefault'],
  'form.errors': ['name', 'contact', 'email', 'net'],
  checkoutCopy: ['noteLabel', 'notePlaceholder', 'btnSubNow', 'btnSubWait', 'altLead', 'altLink', 'startNow', 'withdrawal', 'fine', 'errors', 'paid'],
  'checkoutCopy.errors': ['name', 'email', 'net'],
  'checkoutCopy.paid': ['before', 'em', 'text', 'next', 'nextWait', 'wait', 'pending', 'unconfirmed', 'startsNow', 'startsWait'],
  till: ['label', 'labelWait']
};
function allowOnly(obj, path, where) {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return;
  const ok = ALLOWED[path];
  for (const k of Object.keys(obj)) need(ok.includes(k), where, `${path ? path + '.' : ''}${k} is a key the page does not read: remove it (copy nobody sees is copy everybody believes is live)`);
}
// the per-item allow-lists and the array each walks
const ITEM_LISTS = { 'how.step': 'how.steps', 'checks.item': 'checks.items', 'faq.item': 'faq.items', 'bref.row': 'bref.rows' };

// the company's identity strings: any "REA XX-…" is entity.rea, any "VAT /
// P.IVA <11 digits>" is entity.vat. Shared by the desks and the hub.
export function identityGuard(text, shared, where) {
  const e = shared.entity || {};
  for (const m of String(text).matchAll(/REA\s+([A-Z]{2}-\d+)/g)) need(m[1] === e.rea, where, `"REA ${m[1]}" is not the company's REA (${e.rea}, cities/_shared.json): the identity is said once, never typed`);
  for (const m of String(text).matchAll(/(?:VAT|P\.?\s?IVA)\s+(?:IT)?(\d{11})/g)) need(m[1] === e.vat, where, `"VAT ${m[1]}" is not the company's VAT number (${e.vat}, cities/_shared.json): the identity is said once, never typed`);
}

export function renderCity({ template, shared, city, assetVersion, frags, root = ROOT, cities = [city], weigh = true, europe = null }) {
  const where = `cities/${city.slug}.json`;
  need(/^[a-z0-9-]+$/.test(city.slug || ''), where, 'slug must be lowercase letters, digits and dashes');
  need(typeof city.live === 'boolean', where, '"live" must be true or false');
  need(city.mode === 'search' || city.mode === 'waitlist', where, '"mode" must be "search" or "waitlist"');
  need(str(city.city), where, '"city" is required');
  need(typeof city.iata === 'string' && /^[A-Z]{3}$/.test(city.iata), where, '"iata" (three upper-case letters) is required: it is the destination on the stub');
  const waitlist = city.mode === 'waitlist';
  const sell = city.checkout === true;
  need(city.checkout === undefined || typeof city.checkout === 'boolean', where, '"checkout" must be true or false when present');
  need(!(waitlist && sell), where, 'a waitlist city cannot open a checkout: shown is not charged (BOOM_CITIES_BRIEF.md v1.1)');
  const ES = String(city.country || '').toUpperCase() === 'ES';
  // the currency the page prints is the one Stripe charges (CITY_MARKETS);
  // a non-euro desk declares it in its JSON too (the og card reads the JSON)
  const CUR = currencyOf(city.slug);
  const pr = (n) => money(n, CUR);
  need(city.currency === undefined ? CUR === 'EUR' : String(city.currency).toUpperCase() === CUR, where, `"currency" must be the desk's own (${CUR}), as api/_market.js charges it`);

  // ── the shared file ──
  const site = shared.siteUrl;
  need(/^https:\/\/[^/]+$/.test(site || ''), 'cities/_shared.json', 'siteUrl must be https://host with no trailing slash');
  need(shared.contact && /^\d{8,15}$/.test(shared.contact.whatsapp || '') && /@/.test(shared.contact.email || '') && str(shared.contact.waText) && /\{city\}/.test(shared.contact.waText) && !/[€£]|\d/.test(shared.contact.waText),
    'cities/_shared.json', 'contact.whatsapp (digits only), contact.email and contact.waText (with {city}, no price) are required');
  need(shared.contact.waPlan === undefined, 'cities/_shared.json', 'contact.waPlan is a v1.4 leftover: no WhatsApp link carries a plan any more');
  for (const k of LEFTOVERS.shared) need(shared[k] === undefined, 'cities/_shared.json', `${k} is a v1.4 leftover (the month select and the menu left the page)`);
  need(shared.refund && typeof shared.refund.rule === 'string' && /refunded in full if we decline the search in the first call/.test(shared.refund.rule),
    'cities/_shared.json', 'refund.rule is the one sentence of the policy: "… refunded in full if we decline the search in the first call" (the founder, 15/10)');
  need(shared.rome && ['rating', 'reviews'].every((f) => str(shared.rome[f])) && typeof shared.rome.profileUrl === 'string',
    'cities/_shared.json', 'rome needs rating, reviews and profileUrl');
  need(!shared.rome.profileUrl || /^https:\/\//.test(shared.rome.profileUrl), 'cities/_shared.json', 'rome.profileUrl must be https');
  // the proof link is the PUBLIC profile, never the "write a review" box
  need(!/\/review\b|writereview/i.test(shared.rome.profileUrl || ''), 'cities/_shared.json',
    'rome.profileUrl is a "write a review" link: the proof link must open the public profile (e.g. https://maps.google.com/?cid=…), not the review box');
  need(/^\d{4}$/.test(String(shared.copyrightYear || '')), 'cities/_shared.json', 'copyrightYear (four digits) is required: the footer year is data, not the clock');
  // v1.6: Rome is the hub of the network map (public coordinates of the city)
  need(validGeo(shared.rome.geo), 'cities/_shared.json', 'rome.geo {lat, lon} is required: the hub of the Network map (lat 35–60, lon −11–30, inside the map)');
  need(shared.entity && ['legalName', 'address', 'registeredOffice', 'vat', 'rea', 'trademark'].every((f) => str(shared.entity[f])), 'cities/_shared.json', 'entity needs legalName, address, registeredOffice, vat, rea, trademark');
  // THE COMPANY'S IDENTITY, said once: a REA or VAT number in a desk's copy
  // is the entity's own (cities/_shared.json), never a typed variant
  identityGuard(JSON.stringify(city), shared, where);

  // ── leftovers ──
  for (const k of LEFTOVERS.top) need(city[k] === undefined, where, `"${k}" is a leftover of the quiz pages (v1.2–v1.4): the ticket page does not read it`);
  need(city.hero && typeof city.hero === 'object', where, 'needs "hero"');
  for (const k of LEFTOVERS.hero) need(city.hero[k] === undefined, where, `hero.${k} is a leftover: the pass reads h1Before, lead, leadStrong and faresHead`);
  need(city.form && typeof city.form === 'object', where, 'needs "form"');
  for (const k of LEFTOVERS.form) need(city.form[k] === undefined, where, `form.${k} is a leftover: the free call asks a name and one contact`);
  need(city.pricing && typeof city.pricing === 'object', where, 'needs "pricing"');
  for (const k of LEFTOVERS.pricing) need(city.pricing[k] === undefined, where, `pricing.${k} is a leftover: the fares are on the pass`);
  need(city.door && typeof city.door === 'object', where, 'needs "door"');
  for (const k of LEFTOVERS.door) need(city.door[k] === undefined, where, `door.${k} is a leftover: the sub-line is the desk window, computed`);
  need(city.footer && typeof city.footer === 'object', where, 'needs "footer"');
  for (const k of LEFTOVERS.footer) need(city.footer[k] === undefined, where, `footer.${k} is a leftover`);
  if (city.checkoutCopy) for (const k of LEFTOVERS.checkoutCopy) need(city.checkoutCopy[k] === undefined, where, `checkoutCopy.${k} is a leftover: the till's header is the plan`);
  for (const pth of Object.keys(ALLOWED)) {
    if (pth === 'plan') { for (const p of (city.pricing && city.pricing.plans) || []) for (const k of LEFTOVERS.plan) need(p[k] === undefined, where, `plan "${p.id}": ${k} is a leftover`); (city.pricing && city.pricing.plans || []).forEach((p) => allowOnly(p, 'plan', where)); continue; }
    if (ITEM_LISTS[pth]) { const arr = get(city, ITEM_LISTS[pth]); if (Array.isArray(arr)) arr.forEach((x) => allowOnly(x, pth, where)); continue; }
    allowOnly(pth ? get(city, pth) : city, pth, where);
  }

  // ── the pass ──
  need(str(city.hero.h1Before) && str(city.hero.lead) && str(city.hero.leadStrong), where, 'hero needs h1Before, lead and leadStrong (the desk\'s must-state, in bold)');
  const leadWords = words(city.hero.lead + ' ' + city.hero.leadStrong);
  need(leadWords <= BUDGET.lead, where, `hero.lead + leadStrong is ${leadWords} words, over ${BUDGET.lead}`);
  if (waitlist) need(/^Opening with/.test(city.hero.lead), where, 'a waitlist desk\'s lead opens with "Opening with" (what exists today)');
  // the brief §4 must-states, verbatim, in the lead (the first thing read)
  if (sell) need(/never paid by landlords|we do not act for the landlord/.test(city.hero.leadStrong), where, 'a sell desk\'s leadStrong is its must-state (Amsterdam: "never paid by landlords"; Spain: "we do not act for the landlord")');
  if (ES && sell) need(city.hero.leadStrong === 'You hire us; we do not act for the landlord.', where, 'on a Spanish desk the must-state is verbatim: "You hire us; we do not act for the landlord."');
  if (city.slug === 'amsterdam') need(city.hero.leadStrong === 'We work exclusively for you; never paid by landlords.', where, 'Amsterdam\'s must-state is verbatim: "We work exclusively for you; never paid by landlords."');
  const fh = city.hero.faresHead;
  need(fh && str(fh.b) && str(fh.span), where, 'hero.faresHead needs b and span (the line over the fares)');
  // Spain (LAU art. 20 as rewritten by RDL 29/2026): the prices on the first
  // screen open by saying the service is optional and chosen in writing
  if (ES && sell) {
    need(fh.b === 'Optional, chosen in writing', where, 'on a Spanish desk that sells, hero.faresHead.b is "Optional, chosen in writing" (LAU art. 20): the prices are on the first screen');
    need(str(city.pricing.sub) && city.pricing.sub.startsWith('Optional, chosen in writing'), where, 'on a Spanish desk that sells, pricing.sub opens "Optional, chosen in writing": the till repeats it before any payment');
    // v1.6 §C.2: the LAU art. 20 lane stays the FIRST of the Pre-flight lanes
    need(list(city, 'checks.items').findIndex((k) => k.id === 'fees' && /LAU art\. 20/.test(k.at)) === 0, where, 'on a Spanish desk the checks keep "Who pays the agent · LAU art. 20", as the first lane');
    need(list(city, 'faq.items').some((f) => /landlord who pays the agent/i.test(f.q)), where, 'on a Spanish desk the FAQ keeps the landlord-pays question');
  } else {
    need(city.pricing.sub === undefined, where, 'pricing.sub is the Spanish till line (LAU art. 20) only');
  }
  if (waitlist) need(/charged/i.test(fh.span), where, 'a waitlist desk\'s faresHead.span says when (or that nothing is) charged: list prices are not prices taken today');

  // ── the plans ──
  const plans = list(city, 'pricing.plans');
  need(plans.map((p) => p.id).join() === 'full-search,application-pack,attended-viewing', where, 'the plans are full-search, application-pack, attended-viewing, in that order (the server sells them by these ids: api/_market.js CITY_PLANS)');
  for (const p of plans) {
    for (const k of LEFTOVERS.plan) need(p[k] === undefined, where, `plan "${p.id}": ${k} is a leftover`);
    need(str(p.label) && str(p.name) && str(p.when), where, `plan "${p.id}" needs label, name (its tag line) and when (for whom, on the fare row)`);
    need(words(p.when) <= 9, where, `plan "${p.id}": the "when" line is ${words(p.when)} words, over 9 (it sits on the fare row)`);
    need(Array.isArray(p.includes) && p.includes.length >= 2 && p.includes.length <= 5 && p.includes.every(str), where, `plan "${p.id}" needs includes: 2–5 lines of what the fee buys`);
    need(Number.isFinite(Number(p.price)) && Number(p.price) > 0, where, `plan "${p.id}" needs a positive price`);
    need(str(p.condition) && str(p.conditionLong) && str(p.offerDescription), where, `plan "${p.id}" needs condition (short), conditionLong (a sentence) and offerDescription`);
    need(/VAT/.test(p.condition), where, `plan "${p.id}": the short condition must say VAT (the total price is the price)`);
    if (waitlist) need(/opening|sign/i.test(p.condition) && /opens|sign/i.test(p.conditionLong), where, `plan "${p.id}": a waitlist plan says when it is charged ("at opening" or "on signing") in both strings`);
    else need(/VAT/.test(p.conditionLong) && !/opening|sign/i.test(p.condition), where, `plan "${p.id}": a sell desk's conditionLong says VAT and never "at opening"`);
  }
  const fsPlan = plans[0];
  // Full Search's own words: one viewing included, more priced, no date
  const avPrice = pr(plans[2].price);
  need(fsPlan.includes.some((x) => x.includes(`(more: ${avPrice} each)`)) || waitlist, where, `Full Search on a desk that sells says "(more: ${avPrice} each)": one viewing is included, the rest are priced at the Attended Viewing's own price`);
  need(fsPlan.includes.some((x) => /Until you sign, or you say stop/.test(x)) || waitlist, where, 'Full Search says how long it runs: "Until you sign, or you say stop"');
  if (city.slug === 'berlin') need(/sign/i.test(fsPlan.condition) && /sign/i.test(fsPlan.conditionLong), where, 'berlin: Full Search is due only once a lease is signed (WoVermRG §2–§3) — both condition strings must say "sign"');

  // ── the stub, the door, the desk ──
  need(city.stub && str(city.stub.notSure), where, 'stub.notSure is required: the line over the door (the free door is the neutral decline)');
  need(str(city.door.label) && !/[€£]|\d/.test(city.door.label), where, 'door.label is the ONE action label, with no price');
  need(city.door.label === (sell ? 'Start with a free call' : 'Open my file'), where, `door.label is "${sell ? 'Start with a free call' : 'Open my file'}" on a ${sell ? 'desk that sells' : 'desk still opening'} (the founder, 22/10)`);
  validateDesk(city.desk, where);
  // a desk open Mon–Fri 09–19 cannot keep a clock promise
  need(!CLOCK_RE.test(JSON.stringify(city)), where, 'no clock promise in the copy ("24 hours", "24h", "24-hour", "within an hour", "<1h", "24/7"): a desk open Mon–Fri 09–19 cannot keep it');

  // ── the form (the free call: a name and one contact) ──
  const fm = city.form;
  need(fm.name && str(fm.name.label) && str(fm.name.placeholder) && fm.contact && str(fm.contact.label) && str(fm.contact.placeholder), where, 'form needs name {label, placeholder} and contact {label, placeholder}');
  need(str(fm.consentLead) && str(fm.consentAlt) && str(fm.sending), where, 'form needs consentLead, consentAlt and sending');
  need(fm.errors && ['name', 'contact', 'email', 'net'].every((f) => str(fm.errors[f])), where, 'form.errors needs name, contact, email and net');
  need(Array.isArray(fm.sentNext) && fm.sentNext.length === 3 && fm.sentNext[0][0] === '{when}' && fm.sentNext.every((x) => Array.isArray(x) && x.length === 2 && x.every(str)) && /\{email\}/.test(fm.sentNext[2][1]) && str(fm.sentWhenDefault),
    where, 'form.sentNext is three [label, line] pairs: the first label {when} (computed by the page), the last line naming {email}; plus sentWhenDefault');
  // a desk that is still opening promises no call: its door, its OPEN card,
  // its "not sure" line
  if (waitlist) need(!CALL_RE.test(JSON.stringify(city)), where, 'a waitlist desk promises no call, callback or phone/video conversation anywhere in its data (it takes no call until it opens)');

  // ── the below ──
  need(city.how && str(city.how.h2) && str(city.how.h2g) && list(city, 'how.steps').length === 3 && city.how.steps.every((s) => str(s.k) && str(s.h) && str(s.p)), where, 'how needs h2, h2g and three steps {k, h, p}');
  // v1.6 — THE DEPARTURES BOARD: N° and step read from k ("1 · Brief", the
  // digit is the row); the status is a fact about the step, upper-case, at
  // most 12 cells (the board), never a flight remark; on a desk still
  // opening, step 1 is FREE and steps 2 and 3 say the partner or the opening
  city.how.steps.forEach((s, i) => {
    const m = STEP_K_RE.exec(s.k);
    need(m && Number(m[1]) === i + 1, where, `how.steps[${i}].k "${s.k}" must read "${i + 1} · <step name>" (2–24 characters): the board prints N° ${pad2(i + 1)} and the name`);
    need(typeof s.status === 'string' && STATUS_RE.test(s.status), where, `how.steps[${i}].status "${s.status}" must be upper-case letters, digits and spaces, 2–12 characters (a 12-cell board)`);
    need(!STATUS_BANNED_RE.test(s.status), where, `how.steps[${i}].status "${s.status}" is a flight remark (ON TIME, DELAY, BOARD, LAST, FINAL, GATE, DEPART, CANCEL, SEAT, NOW, LEFT, ONLY): a status says a fact about the step`);
  });
  if (waitlist) need(city.how.steps[0].status === 'FREE' && city.how.steps.slice(1).every((s) => /PARTNER|OPENING/.test(s.status)), where, 'a desk still opening reads FREE on step 1 and the partner or the opening on steps 2 and 3 (what exists today)');
  // v1.6 — THE NETWORK MAP: the desk's public coordinates
  need(validGeo(city.geo), where, '"geo" {lat, lon} is required (the desk\'s city, public coordinates): lat 35–60, lon −11–30, and the point must fall inside the Network map');
  // v1.6 — THE BAGGAGE heading is split from the papers' summary
  need(PAPERS_RE.test(String(city.papers && city.papers.summary)), where, `papers.summary must read "The papers a/an … asks for" (the Baggage heading: "The papers" + the gold phrase)`);
  // v1.6 — THE SEAL says the desk's must-state, derived, never a new claim
  {
    const phrase = sealPhrase(city);
    need(str(phrase) && phrase.length <= 64, where, `the issuer seal cannot derive its phrase (${phrase.length} characters): a sell desk's leadStrong carries "never paid by landlords" or "we do not act for the landlord"; a desk still opening, a first sentence of at most 64 characters`);
    if (waitlist) need(!CALL_RE.test(sealText(city)), where, 'the seal of a desk still opening promises no call');
  }
  need(city.checks && str(city.checks.h2) && str(city.checks.h2g), where, 'checks needs h2 and h2g');
  for (const k of list(city, 'checks.items')) need(/^[a-z-]+$/.test(k.id || '') && str(k.title) && str(k.at) && str(k.text), where, `check "${k.id}" needs id, title, at and text`);
  need(city.checks.items.length >= 3 && city.checks.items.length <= 6, where, 'three to six checks');
  need(city.papers && str(city.papers.summary) && city.papers.at === '8 papers' && Array.isArray(city.papers.items) && city.papers.items.length === 8 && city.papers.items.every(str) && str(city.papers.tail), where, 'papers needs summary, at ("8 papers"), the eight papers and a tail');
  need(city.faq && str(city.faq.h2), where, 'faq needs h2');
  for (const f of list(city, 'faq.items')) need(str(f.q) && str(f.a) && f.checkin === undefined, where, 'every FAQ item has q and a (the derived "which service" answer left with the quiz)');
  need(city.faq.items.length >= 3 && city.faq.items.length <= 6, where, 'three to six questions');
  need(!list(city, 'faq.items').some((q) => /moving from Rome/i.test(q.q)), where, 'the FAQ item "I\'m moving from Rome with BOOM" left the page (brief v1.3)');
  need(city.bref && str(city.bref.h2) && list(city, 'bref.rows').some((r) => r.fees) && city.bref.rows.some((r) => r.contact) && city.bref.rows.some((r) => r.dt === "What we don't do"), where, 'bref needs h2 and rows with a fees row, a contact row and "What we don\'t do"');
  need(str(city.footer.statement), where, 'footer.statement is required (the tenant-side statement)');

  // ── the till ──
  if (sell) {
    const k = city.checkoutCopy;
    need(k && typeof k === 'object', where, 'checkout:true needs "checkoutCopy"');
    for (const f of ['noteLabel', 'notePlaceholder', 'btnSubNow', 'btnSubWait', 'altLead', 'altLink', 'fine']) need(str(k[f]), where, `checkoutCopy.${f} is required`);
    need(k.altLink.startsWith(city.door.label) && !/open a file/i.test(JSON.stringify(k)), where, `checkoutCopy.altLink must start with door.label ("${city.door.label}"): the way out of the till is the page's one door`);
    need(city.till && str(city.till.label) && !/[€£]|\d/.test(city.till.label) && str(city.till.labelWait) && !/[€£]|\d/.test(city.till.labelWait) && city.till.labelWait !== city.till.label && !/start/i.test(city.till.labelWait), where,
      'till needs label (every pay control) and labelWait (the last button before the tick: never "start" — the work waits for the 14 days)');
    need(/14 days/.test(k.btnSubWait) && !/today|same working day/i.test(k.btnSubNow), where, 'checkoutCopy.btnSubWait says the 14 days; btnSubNow never promises "today" or the same working day');
    need(/refunded in full if we decline the search in the first call/i.test(k.fine), where, 'checkoutCopy.fine must state the refund policy (BOOM policy, 15/10)');
    for (const f of ['name', 'email', 'net']) need(k.errors && str(k.errors[f]), where, `checkoutCopy.errors.${f} is required`);
    // A distance sale to a consumer (Directive 2011/83/EU arts. 6, 7(3), 16(a))
    need(str(k.startNow) && /start/i.test(k.startNow) && /withdraw/i.test(k.startNow) && /fully performed/i.test(k.startNow), where,
      'checkoutCopy.startNow is the payer\'s own request to start inside the withdrawal period, acknowledging the right ends once the service is fully performed');
    need(str(k.withdrawal) && /14 days/.test(k.withdrawal) && /\{email\}/.test(k.withdrawal) && /\{form\}/.test(k.withdrawal), where,
      'checkoutCopy.withdrawal states the 14-day withdrawal right, how to exercise it ({email}) and links the model withdrawal form ({form}) before the payment');
    const pd = k.paid;
    need(pd && ['before', 'em', 'text', 'wait', 'pending', 'unconfirmed', 'startsNow', 'startsWait'].every((f) => str(pd[f])), where, 'checkoutCopy.paid needs before, em, text, wait, pending, unconfirmed, startsNow and startsWait');
    need(/\{date\}/.test(pd.startsWait) && /14-day|14 days/.test(pd.wait) && /\{email\}/.test(pd.wait) && /not confirmed yet/i.test(pd.unconfirmed) && !/[€£]|\d/.test(pd.pending + pd.unconfirmed), where,
      'paid.startsWait carries {date}, paid.wait says the 14 days and {email}, paid.unconfirmed says "not confirmed yet"; no figure in the pending lines');
    // {date} is the webhook's workFromLabel: the first working day AFTER the
    // withdrawal period, never the day it ends (that would misstate the right)
    need(/^From \{date\}/.test(pd.startsWait) && !/when your 14 days end|14 days end/i.test(pd.startsWait), where,
      'paid.startsWait opens "From {date}" and never calls {date} the day the 14 days end: {date} is the first working day after them');
    const three = (a) => Array.isArray(a) && a.length === 3 && a.every((x) => Array.isArray(x) && x.length === 2 && x.every(str));
    need(three(pd.next) && three(pd.nextWait) && !pd.nextWait.flat().some((y) => /same working day|today/i.test(y)), where, 'paid.next and paid.nextWait are three [label, line] pairs; nextWait never "same working day" or "today"');
  } else {
    need(city.till === undefined && city.checkoutCopy === undefined, where, 'till and checkoutCopy belong only to a desk with the checkout open');
  }

  // The board word: the city, letters only, upper-case — the drum has no
  // accents or spaces (the Solari engine's own alphabet).
  const word = String(city.word || city.city).toUpperCase().normalize('NFD').replace(/[^A-Z]/g, '');
  need(word.length >= 2 && word.length <= 12, where, `board word "${word}" must be 2–12 letters (override with "word")`);

  const pageUrl = `${site}/${city.slug}`;
  // The card's URL carries a hash of its bytes: every .png is served
  // `immutable` for a year (vercel.json), so a card rewritten in place under
  // the same URL keeps the OLD one in every cache and every scraper.
  const ogFile = path.join(root, `og-${city.slug}.png`);
  const ogImage = `${site}/og-${city.slug}.png${fs.existsSync(ogFile) ? '?v=' + hash(ogFile) : ''}`;
  const contact = { ...shared.contact, ...(city.config && city.config.WHATSAPP ? { whatsapp: city.config.WHATSAPP } : {}), ...(city.config && city.config.EMAIL ? { email: city.config.EMAIL } : {}) };
  contact.waHref = waHref(contact, city.city);
  const fam = familyFor(city, cities, shared);
  const doorLead = sell ? 'no card' : 'free';
  const holidays = holidayKeyOf(city.slug);

  const config = {
    SLUG: city.slug, CITY: city.city, WORD: word, IATA: city.iata, MODE: city.mode,
    CHECKOUT: sell,
    LEAD_URL: '/api/city-lead',
    CHECKOUT_ENDPOINT: '/api/service-checkout',
    DOOR: city.door.label,
    DOOR_LEAD: doorLead,
    DESK: { timeZone: city.desk.timeZone, hours: city.desk.hours, days: city.desk.days },
    HOLIDAYS: holidays,
    CURRENCY: CUR,
    SYMBOL: SYMBOL[CUR] || '€',
    PLANS: Object.fromEntries(plans.map((p) => [p.id, {
      label: p.label, eur: Number(p.price), condition: p.condition, name: p.name, includes: p.includes,
      rule: sell && p.id === 'full-search'
    }])),
    TILL: sell ? { label: city.till.label, labelWait: city.till.labelWait } : null,
    PAID: sell ? { startsNow: city.checkoutCopy.paid.startsNow, startsWait: city.checkoutCopy.paid.startsWait, nextWait: city.checkoutCopy.paid.nextWait, unconfirmed: city.checkoutCopy.paid.unconfirmed } : null,
    // v1.6 §D: the onda canvas script, injected by boom-city.js at ≥940px after load
    ONDA: `/assets/boom-onda.js?v=${(assetVersion && assetVersion.onda) || '0'}`
  };

  const rome = shared.rome;
  const rating = `${esc(rome.rating)} on Google in Rome, ${esc(rome.reviews)} reviews`;
  // the hour range never breaks after its dash ("09:00– / 19:00")
  const deskLineHtml = esc(deskHoursText(city.desk)).replace(/(\d{2}:\d{2}–\d{2}:\d{2})/, '<span class="nw">$1</span>');
  const data = {
    ...city,
    word,
    wordLen: String(word.length),
    entity: shared.entity,
    contact,
    pageUrl,
    ogImage,
    doorLead,
    deskHoursText: deskHoursText(city.desk),
    // the hour range never breaks after its dash ("09:00– / 19:00")
    deskLineHtml,
    year: String(shared.copyrightYear),
    robotsMeta: city.live
      ? '<meta name="robots" content="index, follow, max-image-preview:large, max-snippet:-1">'
      : '<meta name="robots" content="noindex">',
    jsonLdBreadcrumb: scriptJson(jsonLdBreadcrumb(city, shared, pageUrl), ''),
    jsonLd: scriptJson(jsonLd(city, shared, pageUrl, ogImage, cities), ''),
    configJson: scriptJson(config, '  '),
    assetVersion,
    scrollBlock: frags.scrollBlock,
    solariEngine: frags.solariEngine,
    deskCalendar: frags.deskCalendar,
    ratingHtml: rome.profileUrl ? `<a class="lnk" href="${esc(rome.profileUrl)}" target="_blank" rel="noopener">${rating}</a>` : rating,
    // who operates the desk, under the pass: on the HOME-COUNTRY desk (Milan)
    // what it is — an Italian real estate agency, under the same Italian law
    // as in Rome; elsewhere the registered Italian agency, as before
    proofLead: isHomeDesk(city, shared)
      ? `Operated by ${shared.entity.legalName}, an Italian real estate agency, under the same Italian law as in Rome`
      : `Operated by ${shared.entity.legalName}, a registered Italian agency`,
    faresHtml: R.fares(city, shared),
    actHtml: R.act(city, contact),
    faqHtml: R.faq(city),
    brefHtml: R.bref(city, shared, pageUrl, contact),
    tillHtml: R.till(city, shared, contact),
    // v1.6 — the pass anatomy and the terminal walk
    cityUpper: upperCity(city),
    routePerfHtml: R.route(city, 'perf'),
    routeStubHtml: R.route(city, 'stub'),
    sealHtml: R.seal(city),
    // the code line as served: who issues the ticket, never a file number
    // (the server's BM code replaces it after OPEN / PAID)
    codeLine: `BOOM · ${city.iata} · TENANT SIDE · ISSUED ${ROME_IATA}`,
    papersG: papersG(city),
    depHtml: R.dep(city),
    lanesHtml: R.lanes(city),
    tagsHtml: R.tags(city),
    gateHtml: R.gate(city, contact, doorLead, deskLineHtml),
    netHtml: R.net(city, fam, shared, cities, europe),
    footHtml: R.foot(city, shared, contact, deskLineHtml)
  };

  const html = fill(template, data, where);

  // ── the output, read back ──
  for (const m of html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)) {
    try { JSON.parse(m[1]); } catch (e) { throw new BuildError(`${where}: JSON-LD does not parse: ${e.message}`); }
  }
  need(!/#D4AF37/i.test(html), where, 'the public pages use #FFD700; #D4AF37 is the portal gold');
  identityGuard(html, shared, where);
  // BOOM Desks: a LIVE page never links a desk that is not open — not in
  // the Network, not anywhere (a client never lands on a draft nobody approved)
  if (city.live === true) {
    const off = cities.filter((x) => x.slug !== city.slug && x.live !== true).map((x) => x.slug);
    const reOff = off.length ? new RegExp(`href="(?:${site.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})?/(?:${off.join('|')})(?=[#"?/])`) : null;
    const hit = reOff && html.match(reOff);
    need(!hit, where, `a live page links a desk that is not open (${hit ? hit[0] : ''}): the Network names it, never links it`);
  }
  const vis = visibleText(html);
  need(!/(?<![\d,.])500\+|off-market|whichever is lower/i.test(vis) && !CLOCK_RE.test(vis), where, 'no "500+", clock promise ("24h", "within an hour", "24/7"…), "off-market" or "whichever is lower" on the page');
  // EVERY price the page states — visible, in a meta attribute, in the
  // JSON-LD — is one of the plans' prices: a repriced plan cannot leave a
  // stale figure behind, a hand-typed one cannot drift
  {
    const known = new Set(plans.map((p) => pr(p.price)));
    const strs = (v) => (typeof v === 'string' ? [v] : v && typeof v === 'object' ? Object.values(v).flatMap(strs) : []);
    const ldStr = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].flatMap((m) => strs(JSON.parse(m[1])));
    const metaStr = [...html.matchAll(/<meta [^>]*content="([^"]*)"/g)].map((m) => m[1]);
    const odd = [vis, ...ldStr, ...metaStr].join(' \n ').match(/[€£]\s?\d[\d,]*/g) || [];
    const stray = [...new Set(odd.map((x) => x.replace(/\s/g, '')))].filter((x) => !known.has(x));
    need(!stray.length, where, `a price the plans do not charge is stated on the page: ${stray.join(', ')} (the plans: ${[...known].join(', ')})`);
  }
  need(!/!(?=[\s<"]|$)/.test(html.replace(/<!--[\s\S]*?-->|<!DOCTYPE[^>]*>|<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, '').replace(/<[^>]+>/g, ' ')), where, 'no exclamation mark in the copy');
  // every price is one of the plans', on its row with its condition
  const fares = sliceOf(html, '<!-- FARES -->', '<!-- /FARES -->');
  for (const p of plans) {
    need(fares.includes(`<span class="f-price" data-plan-price="${esc(p.id)}">${pr(p.price)}</span><span class="f-cond">${esc(p.condition).replace(' · incl. VAT', ' ·<br> incl. VAT')}</span>`), where, `plan "${p.id}": its price ${pr(p.price)} is not on its fare row with its condition`);
    need(fares.includes(`<span class="f-when">${esc(p.when)}</span>`), where, `plan "${p.id}": its "when" line is not on its fare row`);
  }
  // one city board, served empty (the raw H1 reads the city once)
  // the board sits OUTSIDE the H1: once the Solari cells mount inside it,
  // the rendered heading would read "AmsterdamAA AMMLM…" to a crawler
  need((html.match(/class="board"/g) || []).length === 1 && html.includes(`<span class="sr">${esc(city.city)}</span></h1>\n      <p class="board-row" aria-hidden="true"><span class="board" id="placeBoard" data-word="${esc(word)}" style="--n:${word.length}"></span></p>`), where, 'one city board, decorative, served empty and outside the H1 (data-word drawn by CSS): the H1 reads "<h1Before> <City>" before and after the board mounts');
  // the pass holds the fares, the door and the desk, once each
  need((html.match(/<article class="pass" id="pass" data-state="blank"/g) || []).length === 1 && (html.match(/id="door"/g) || []).length === 1 && (html.match(/id="fileForm"/g) || []).length === 1, where, 'the pass once, blank at parse; one door, one form');
  const pass = sliceOf(html, '<article class="pass"', '</article>');
  need(pass.includes('<!-- FARES -->') && pass.includes('<!-- /THE DOOR -->') && pass.indexOf('<!-- /FARES -->') < pass.indexOf('<div id="act">'), where, 'the pass holds the fares, then the door');
  // one label: the door, the strip, the till's way out
  const label = esc(city.door.label);
  need(html.includes(`<b id="doorL">${label}</b>`) && html.includes(`<button class="st-go" id="stripGo" type="button">${label}</button>`), where, 'the door and the strip read door.label');
  const strip = sliceOf(html, '<div class="strip js" id="strip"', '</div>');
  need(strip && !/[€£]|\b\d{3,}\b/.test(visibleText(strip).replace(/\d{2}:\d{2}/g, '')), where, 'the strip carries no price (the desk hours only)');
  need(!/Start my search|Get the pack|Book a viewing|Show my plan|Rather write first|Three questions/i.test(vis), where, 'the v1.2–v1.4 labels left the page: one label');
  const payLabels = [...html.matchAll(/data-pay="[^"]*"[^>]*>([\s\S]*?)<\/button>/g)].map((m) => visibleText(m[1]).trim());
  if (sell) need(payLabels.length === plans.length && payLabels.every((t, i) => t.startsWith(`${city.till.label} · ${pr(plans[i].price)}`)), where, `every pay control reads till.label with its plan's price (${JSON.stringify(payLabels)})`);
  // the WhatsApp links open with the desk marker
  const was = [...html.matchAll(/href="(https:\/\/wa\.me\/[^"]*)"/g)].map((m) => m[1].replace(/&amp;/g, '&'));
  need(was.length >= 2 && was.every((u) => u === contact.waHref), where, 'every WhatsApp link opens with the desk marker ("Hi BOOM <city>, …"), never a plan or a price');
  // Rome is Rome: the rating appears once, labelled
  {
    const strs = (v) => (typeof v === 'string' ? [v] : v && typeof v === 'object' ? Object.values(v).flatMap(strs) : []);
    const ldStr = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].flatMap((m) => strs(JSON.parse(m[1])));
    const ratings = ([vis, ...ldStr].join(' \n ').match(RATING_RE) || []).length;
    need((html.match(/on Google/g) || []).length === 1 && /on Google in Rome/.test(html) && ratings === 1, where, `the Rome rating appears once, labelled "in Rome" — no other rating, star or review count anywhere (${ratings} found)`);
  }
  // the leftovers of the quiz pages stay gone. v1.6 (FOUNDER DECISION,
  // 03/11/2026): the SVG plane `boomPlane` comes back — one symbol, on the
  // route, parked where the server's state puts it; ✈ stays banned.
  need(!/id="checkin"|id="ckStatus"|id="passWrap"|#checkin=|class="paybar"|id="flapCity"|class="hero"|data-consent="compact"/.test(html), where, 'the quiz, its ticket, the share links, the v1.4 hero and its strip left the page');
  need((html.match(/<symbol id="boomPlane"/g) || []).length === 1, where, 'one SVG plane symbol (#boomPlane), defined once');
  need(!/\u2708/.test(html), where, 'no ✈ (U+2708) on the page');
  // v1.6 §B.1: the file code is the SERVER's (r.file / v.file): the served
  // page never carries one, not even as an example
  need(!/\bBM [A-HJ-NP-Z2-9]{5}\b/.test(html), where, 'no file code ("BM XXXXX") in the served page: only the server\'s answer prints one');

  // ── v1.6: the terminal walk, read back ──
  // every section opens with an eyebrow and an h2 with exactly ONE gold phrase
  for (const m of html.matchAll(/<section class="sec"[^>]*>([\s\S]*?)<\/section>/g)) {
    const h2 = (m[1].match(/<h2\b[^>]*>([\s\S]*?)<\/h2>/) || [])[1];
    need(h2 !== undefined && (h2.match(/class="g"/g) || []).length === 1, where, `a section h2 needs exactly one gold phrase (<span class="g">): #${(m[0].match(/id="([^"]+)"/) || [])[1] || '?'}`);
    need(/<p class="eb" data-instr>[^<]+<\/p>/.test(m[1]), where, `a section opens with its eyebrow (<p class="eb" data-instr>): #${(m[0].match(/id="([^"]+)"/) || [])[1] || '?'}`);
  }
  // the window line is said twice where the reader acts (the door, the strip);
  // the instruments read the same line through data-gate
  need((html.match(/data-window=/g) || []).length === 2, where, 'exactly two [data-window] nodes: the door and the strip');
  // ONE action label: the door, its header twin, its gate twin, the strip
  for (const id of ['topGo', 'deskGo']) {
    need(sliceOf(html, `id="${id}"`, '</button>').includes(`<b>${esc(city.door.label)}</b>`), where, `#${id} reads door.label ("${city.door.label}")`);
  }
  // the header's wayfinding anchors land on real ids
  {
    const wayf = sliceOf(html, '<nav class="wayf"', '</nav>');
    const ids = [...wayf.matchAll(/href="#([\w-]+)"/g)].map((x) => x[1]);
    need(ids.length >= 4 && ids.every((x) => html.includes(`id="${x}"`)), where, `the header's wayfinding links land on ids that exist (${ids.join(', ')})`);
  }
  // no aviation word that promises a seat, a queue, a countdown or a Wallet pass
  {
    const said = visibleText(html.replace(/<!--[\s\S]*?-->/g, ' '));
    const hit = said.match(AVIATION_BAN_RE);
    need(!hit, where, `no seat, "admit one", boarding, last/final call, on time, delayed, Wallet or countdown on the page (found "${hit ? hit[0] : ''}")`);
  }

  // Shown is not charged. A waitlist page carries no till, no Stripe word, no
  // pay control, no refund rule, no bank transfer, and promises no call
  // ANYWHERE a reader, a crawler or an answer engine reads it.
  if (waitlist) {
    need(!/stripe/i.test(html), where, 'a waitlist page carries no Stripe reference');
    need(!/id="till"|data-pay=|id="cPaid"|id="cConfirm"/.test(html), where, 'a waitlist page mounts no till, no pay button, no paid card');
    need(html.includes('"CHECKOUT": false'), where, 'a waitlist page declares CHECKOUT false');
    need(!html.includes(shared.refund.rule) && !/refunded in full/i.test(html), where, 'a waitlist page prints no refund rule: no money is taken there');
    need(!/bank transfer/i.test(html), where, 'a waitlist page names no bank transfer');
    const strs = (v) => (typeof v === 'string' ? [v] : v && typeof v === 'object' ? Object.values(v).flatMap(strs) : []);
    const ld = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].flatMap((m) => strs(JSON.parse(m[1])));
    const bare = html.replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ');
    const attrs = [...bare.matchAll(/\s(?:content|alt|title|label|value|placeholder|aria-[\w-]+|data-[\w-]+)="([^"]*)"/g)].map((m) => m[1]);
    const said = [vis, ...strs(config), ...ld, ...attrs].join(' \n ');
    const callAt = said.search(CALL_RE);
    need(callAt < 0, where, `a waitlist desk promises no call anywhere on its page (text, JSON-LD, meta, config) — found "…${callAt < 0 ? '' : said.slice(Math.max(0, callAt - 40), callAt + 30).trim()}…"`);
  } else {
    need(!/id="till"|data-pay=/.test(html) || sell, where, 'a desk without checkout mounts no till and no pay button');
  }
  // THE REFUND RULE BESIDE EVERY €500 (sell desks): the closed Full Search
  // row, its open ticket, the till, the fees row — every block that shows
  // the number carries the sentence. A €500 anywhere else is refused.
  if (sell) {
    const rule = esc(shared.refund.rule);
    const fsId = 'full-search';
    const fsRow = sliceOf(html, `<details class="fare" name="fare" id="fare-${fsId}"`, '<!-- /FARES -->');
    const ticket = sliceOf(fsRow, '<div class="tk">', '</details>');
    const outside = sliceOf(fsRow, '</details>', '<details');
    need(ticket.includes(`<p class="refund">${rule}</p>`), where, 'the refund rule is missing from the Full Search ticket, which shows €500');
    need(outside.includes(`<p class="refund fs">${rule}</p>`), where, 'the refund rule is missing under the closed Full Search row, which shows €500');
    need(sliceOf(html, '<dialog class="till"', '</dialog>').includes(rule), where, 'the refund rule is missing from the till, which shows €500');
    need(sliceOf(html, '<dt>Fees</dt>', '</dd>').includes(rule), where, 'the refund rule is missing from the fees row, which shows €500');
    // EVERY €500 sits inside a block that says the rule: its own <details>
    // (a fare row with its ticket, a FAQ answer), <li>, <dd> or the till's
    // <dialog> — never "somewhere nearby"; a meta attribute or a JSON-LD
    // string carrying €500 must carry the rule itself
    const p500 = pr(fsPlan.price);
    const blank = (m) => ' '.repeat(m.length);
    const bodyAt = html.indexOf('<body');
    const flat = html.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>|<!--[\s\S]*?-->/gi, blank);
    const esc500 = p500.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    for (const m of flat.matchAll(new RegExp(esc500, 'g'))) {
      if (m.index < bodyAt) {
        const attr = (flat.slice(flat.lastIndexOf('"', m.index - 1), flat.indexOf('"', m.index + 1) + 1));
        need(/refunded in full/.test(attr), where, `a ${p500} in the head (a meta attribute) stands without the refund rule`);
        continue;
      }
      let box = null;
      for (const t of ['li', 'dd', 'details', 'dialog']) {
        const open = flat.lastIndexOf(`<${t}`, m.index);
        if (open < 0) continue;
        const close = flat.indexOf(`</${t}>`, m.index);
        if (close < 0 || flat.lastIndexOf(`</${t}>`, m.index) > open) continue;
        if (!box || open > box[0]) box = [open, close];
      }
      const inside = box ? flat.slice(box[0], box[1]) : '';
      need(/refunded in full/.test(inside), where, `a ${p500} stands without the refund rule in its own block: "…${visibleText(flat.slice(Math.max(bodyAt, m.index - 120), m.index + 60)).trim()}…"`);
    }
    {
      const strs = (v) => (typeof v === 'string' ? [v] : v && typeof v === 'object' ? Object.values(v).flatMap(strs) : []);
      for (const t of [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].flatMap((x) => strs(JSON.parse(x[1])))) {
        if (t.includes(p500)) need(/refunded in full/.test(t), where, `a ${p500} in the JSON-LD stands without the refund rule: "${t.slice(0, 120)}…"`);
      }
    }
    // the till, in the order the law asks (CRD arts. 6(1)(h), 7(3), 8(2), 16(a))
    const till = sliceOf(html, '<dialog class="till"', '</dialog>');
    const at = (s) => till.indexOf(s);
    need(at('id="tTitle"') > -1 && at('id="tTitle"') < at('id="tStart"') && at('id="tStart"') < at('class="wd"') && at('class="wd"') < at('id="tGo"'), where, 'the till says the plan and its price, then the start-now request, then the withdrawal line, then the pay button — in that order');
    need(/<input type="checkbox" id="tStart">/.test(till) && !/id="tStart"[^>]*checked/.test(till), where, 'the start-now box is never pre-ticked');
    need(till.includes(`href="${WITHDRAWAL_PATH}?desk=${encodeURIComponent(city.city)}"`), where, 'the withdrawal line links the model withdrawal form with the desk');
    need(till.includes(`<b id="tGoL">${esc(city.till.labelWait)}</b>`) && till.includes(`data-label-now="${esc(city.till.label)}"`), where, 'the pay button reads labelWait until the box is ticked');
    if (ES) need(till.includes(`<p class="t-opt">${esc(city.pricing.sub)}</p>`) && at('class="t-opt"') < at('id="tGo"'), where, 'on a Spanish desk the till repeats "Optional, chosen in writing" before the pay button');
  }

  // the visible words at load: short, by measure — v1.6 split into PROSE
  // and INSTRUMENTS ([data-instr]), each with its cap, plus the node rule
  // and a cap per section of the walk
  const parts = atLoadParts(html);
  const proseWords = words(parts.prose), instrWords = words(parts.instr);
  const bodyWords = proseWords + instrWords;
  need(bodyWords <= BUDGET.body, where, `${bodyWords} visible words at load, over the ${BUDGET.body} budget (the page cannot grow back)`);
  need(proseWords <= BUDGET.prose, where, `${proseWords} words of prose at load, over the ${BUDGET.prose} budget: the richness comes from instruments, not paragraphs`);
  need(instrWords <= BUDGET.instr, where, `${instrWords} words of instruments at load ([data-instr]), over the ${BUDGET.instr} budget`);
  {
    const long = longNodes(parts.html, BUDGET.node);
    need(!long.length, where, `a text node over ${BUDGET.node} words at load (the anti-paragraph rule; only the footer statement is exempt): ${long.map((x) => `<${x.tag}${x.cls ? ' class="' + x.cls + '"' : ''}> ${x.words} words "${x.text}…"`).join(' · ')}`);
  }
  for (const [id, cap] of [['how', 'departures'], ['checks', 'preflight'], ['papers', 'baggage'], ['desk', 'gate'], ['network', 'network']]) {
    const sec = sliceOf(parts.html, `<section class="sec" id="${id}"`, '</section>');
    need(sec, where, `the walk needs its #${id} section`);
    const n = words(visibleText(sec));
    need(n <= BUDGET[cap], where, `the #${id} section is ${n} words at load, over its ${BUDGET[cap]} (${cap})`);
  }
  const faresWords = words(visibleText(fares.replace(/<div class="tk">[\s\S]*?<\/details>/g, '</details>')));
  need(faresWords <= BUDGET.fares, where, `the fares block is ${faresWords} words closed, over ${BUDGET.fares}`);
  for (const p of plans) {
    const tk = sliceOf(fares, `id="fare-${p.id}"`, '</details>');
    const n = words(visibleText(sliceOf(tk, '<div class="tk">', '<div class="tk-slot"')));
    need(n <= BUDGET.ticket, where, `the ${p.label} ticket is ${n} words, over ${BUDGET.ticket}`);
  }

  // The page's dateModified is data, and a hand-written date drifts: a live
  // desk declares "updated" and the build pins it to its sitemap <lastmod>.
  need(city.updated === undefined || /^\d{4}-\d{2}-\d{2}$/.test(city.updated), where, '"updated" is YYYY-MM-DD (the date the page last changed in substance)');
  if (city.live) {
    need(typeof city.updated === 'string', where, 'a live desk declares "updated" (YYYY-MM-DD): the WebPage dateModified and the sitemap <lastmod>');
    const sm = path.join(root, 'sitemap.xml');
    if (fs.existsSync(sm)) {
      const m = fs.readFileSync(sm, 'utf8').match(new RegExp(`<loc>${pageUrl.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}</loc>\\s*<lastmod>([^<]+)</lastmod>`));
      need(m && m[1] === city.updated, where, `"updated" (${city.updated}) and the sitemap <lastmod> of ${pageUrl} (${m ? m[1] : 'missing'}) must be the same date`);
    }
  }
  const placeholders = findPlaceholders(html, city, { root, shared });
  if (city.live && placeholders.length) {
    throw new BuildError(`${where} is live:true but still has ${placeholders.length} placeholder(s):\n    - ` + placeholders.join('\n    - '));
  }
  const warnings = [];
  if (+shared.copyrightYear < new Date().getUTCFullYear()) warnings.push(`_shared.json copyrightYear (${shared.copyrightYear}) is behind the calendar: update it and rebuild`);
  let weight = null;
  if (weigh) {
    weight = weightOf(html, root);
    need(weight.totalKb <= WEIGHT_KB.total, where, `first-party weight ${weight.totalKb.toFixed(1)} KB gzipped is over the ${WEIGHT_KB.total} KB budget`);
    need(weight.jsKb <= WEIGHT_KB.js, where, `assets/boom-city.js is ${weight.jsKb.toFixed(1)} KB gzipped, over the ${WEIGHT_KB.js} KB budget`);
    need(weight.cssKb <= WEIGHT_KB.css, where, `assets/boom-city.css is ${weight.cssKb.toFixed(1)} KB gzipped, over the ${WEIGHT_KB.css} KB budget`);
    need(weight.ondaKb <= WEIGHT_KB.onda, where, `assets/boom-onda.js is ${weight.ondaKb.toFixed(1)} KB gzipped, over the ${WEIGHT_KB.onda} KB budget`);
  }
  return { slug: city.slug, file: `${city.slug}.html`, live: city.live, mode: city.mode, html, placeholders, warnings, weight, words: bodyWords, prose: proseWords, instr: instrWords };
}

// ══ BOOM DESKS — the hub (/desks), 03/11/2026 ══════════════════════════════
// Every desk on one page, GENERATED from the same JSONs as the desks (plus
// cities/_hub.json for the hub's own copy): a departures board (the live
// desks with the desk clock and window from the desk calendar, the desks not
// open as NOT OPEN with no link, ROM the hub), the map lit from Rome (the
// same arcs as every desk page), the three fares (the refund rule under every
// €500/£500), the renting rules city by city (each cell the desk's own `at`
// label, or a title alone where the hold list says a lawyer confirms first),
// the questions and the fact sheet, open. No till, no WhatsApp, the rating
// once. Everything that can be derived is derived; the build refuses instead
// of printing (§1.7 of the spec).
export const HUB_FILE = 'desks.html';
export const HUB_VIEWBOX = '0 -40 640 520';
// the hub's caps, set once with the hub; never raised to fit
export const HUB_WEIGHT_KB = { total: 78, page: 28, css: 6, js: 6 };
export const HUB_BUDGET = { body: 980, prose: 740, instr: 280, first: 120, lead: 30, node: 24, dd: 45, faqA: 42,
  board: 120, map: 90, fares: 230, rules: 160, faq: 70, brief: 240 };
export const COUNTRY_NAME = { NL: 'Netherlands', ES: 'Spain', GB: 'United Kingdom', IT: 'Italy', FR: 'France', DE: 'Germany' };

// what the hub READS; anything else is refused (the ALLOWED discipline)
const HUB_ALLOWED = {
  '': ['updated', 'meta', 'hero', 'map', 'fares', 'rules', 'faq', 'brief', 'footer'],
  meta: ['title', 'description', 'descriptionShort', 'ogTitle', 'ogDescription'],
  hero: ['kicker', 'h1', 'word', 'lead'],
  map: ['eb', 'h2g', 'caption', 'rome', 'home'],
  'map.rome': ['h', 'p', 'link'],
  'map.home': ['h', 'p1', 'p2', 'link'],
  fares: ['eb', 'h2', 'h2g', 'spain', 'plans', 'strip', 'gates'],
  'fares.plan': ['who', 'lines'],
  'fares.strip.item': ['k', 'v', 'href'],
  rules: ['eb', 'h2', 'h2g', 'note', 'caption', 'heldNote', 'rows', 'hold', 'cut'],
  'rules.row': ['head', 'ids', 'country'],
  faq: ['eb', 'h2', 'items'],
  'faq.item': ['q', 'a', 'home'],
  brief: ['eb', 'h2', 'h2g', 'rows'],
  'brief.row': ['dt', 'dd', 'derive', 'home'],
  footer: ['statement']
};
const HUB_DERIVE = ['open', 'fees', 'withdrawal', 'rome', 'contact', 'updated'];
// the optional tokens: an item that uses one with no value is DROPPED (a warning)
const HUB_OPTIONAL = new Set(['homeCity', 'esDesks', 'gbpDesks']);
// the literals hub copy may type with a digit in them; every other number is a token
const HUB_DIGIT_OK = ['LAU art. 20', '14 days', '14-day', '3+2'];
const STATUTE_RE = /\bart\.\s?\d+|§\s?\d+|\bLAU\b|\bLlei\b|\bL\.\s?\d+\/\d{4}|\bAct \d{4}\b/g;
const HUB_BANNED = [
  [/\bworldwide\b|\bglobal(?:ly)?\b|pan-European|all of Europe|\bEU desks?\b/i, 'a scope word ("worldwide", "global", "pan-European", "all of Europe", "EU desk"): the desks are in European cities'],
  [/\b(?:office|branch|team|based)\s+in\s+(?!Rome)\w+/i, 'a presence claim outside Rome (office, branch, team or based in …): every desk answers from Rome'],
  [/\b(?:licensed|registered)\s+in\s+(?!Rome)\w+/i, 'a licence or registration outside Rome: the company is registered in Rome'],
  [/(?<!Rome )Chamber of Commerce/, 'a Chamber of Commerce other than Rome\'s'],
  [/AICAT|carte professionnelle|§34c|licensed agent/i, 'a licence the desks do not hold'],
  [/\b10\s*%|one year's rent/, 'Rome\'s 10% commission: the desks charge flat fees'],
  [/\bguarantee|legal advice\b/i, 'a guarantee or legal advice'],
  [/law firm/i, 'a law firm (only "not a law firm" is said)'],
  [/founding|spots? left|places? left|\blimited\b|closing in|\d+\s*min(?:utes)? left/i, 'scarcity'],
  [/\d+\s*(?:km|miles)\b/, 'a distance']
];

const DAY_NAMES_LONG = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
function daysLong(days) {
  const d = [...days].sort((a, b) => a - b);
  const contiguous = d.every((x, i) => i === 0 || x === d[i - 1] + 1);
  return d.length > 1 && contiguous ? `${DAY_NAMES_LONG[d[0]]} to ${DAY_NAMES_LONG[d[d.length - 1]]}` : listJoin(d.map((x) => DAY_NAMES_LONG[x]));
}
// "Rome time" whenever the desk answers on Rome's clock (Milan's "Italian
// time" does not split the group): every desk answers from Rome
const hubZone = (d) => (d.timeZone === 'Europe/Rome' ? 'Rome time' : zoneWords({ ...d, zoneName: undefined }));
// "Monday to Friday, 09:00–19:00 Rome time; the London desk 08:00–18:00 London time":
// the largest group of equal hours first, every other group named by its desks
export function hoursSentence(live) {
  const groups = new Map();
  for (const c of live) {
    const d = c.desk, key = `${[...d.days].sort().join(',')}|${d.hours.from}|${d.hours.to}|${d.timeZone}`;
    if (!groups.has(key)) groups.set(key, { desk: d, cities: [] });
    groups.get(key).cities.push(c.city);
  }
  const all = [...groups.values()];
  need(all.length, 'hoursSentence', 'no live desk to say the hours of');
  const main = all.reduce((a, b) => (b.cities.length > a.cities.length ? b : a));
  const sameDays = (d) => [...d.days].sort().join() === [...main.desk.days].sort().join();
  return [`${daysLong(main.desk.days)}, ${main.desk.hours.from}–${main.desk.hours.to} ${hubZone(main.desk)}`,
    ...all.filter((g) => g !== main).map((g) => `the ${listJoin(g.cities)} desk${g.cities.length > 1 ? 's' : ''} ${sameDays(g.desk) ? '' : daysLong(g.desk.days) + ' '}${g.desk.hours.from}–${g.desk.hours.to} ${hubZone(g.desk)}`)
  ].join('; ');
}

// The hub's own tokens, single braces: {cities} {n} {N} {drafts} {legalName}
// {rea} {vatID} {address} {person} {hours} {refund} {price:<plan>} and the
// optional {homeCity} {esDesks} {gbpDesks}. Returns null when the string uses
// an optional token with no value (the caller drops the item, with a warning);
// any other unknown or empty token is refused.
export function hubText(s, tok, where) {
  let drop = false;
  const out = String(s).replace(/\{([A-Za-z]+)(?::([a-z-]+))?\}/g, (m, k, arg) => {
    if (k === 'price') {
      need(arg && tok.prices && Object.prototype.hasOwnProperty.call(tok.prices, arg), where, `${m} names no plan`);
      return tok.prices[arg];
    }
    need(!arg, where, `unknown token ${m}`);
    if (HUB_OPTIONAL.has(k)) { if (!str(tok[k])) { drop = true; return m; } return tok[k]; }
    need(Object.prototype.hasOwnProperty.call(tok, k) && str(tok[k]), where, `unknown or empty token ${m}`);
    return tok[k];
  });
  if (drop) return null;
  need(!/[{}]/.test(out), where, `a malformed token is left: "${out.slice(0, 80)}"`);
  return out;
}

// the visible text of the innermost element (one of `tags`) that holds the
// character at `idx` — nesting-aware (an <li> inside an <li> closes first)
function enclosingText(flat, idx, tags) {
  let best = null;
  for (const t of tags) {
    const re = new RegExp(`<(/?)${t}(?=[\\s>])[^>]*>`, 'gi');
    const st = [];
    let target = null, m;
    while ((m = re.exec(flat))) {
      if (target === null && m.index > idx) { if (!st.length) break; target = st[st.length - 1]; }
      if (m[1]) { const o = st.pop(); if (target !== null && o === target) { if (!best || o > best[0]) best = [o, m.index]; break; } }
      else st.push(m.index);
    }
  }
  return best ? visibleText(flat.slice(best[0], best[1])) : '';
}
const SITE_RE = (site) => site.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const ldStrings = (html, keep = () => true) => {
  const strs = (v) => (typeof v === 'string' ? [v] : v && typeof v === 'object' ? Object.values(v).flatMap(strs) : []);
  return [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)]
    .flatMap((m) => { const d = JSON.parse(m[1]); return (d['@graph'] || [d]).filter(keep).flatMap(strs); });
};
// the page's text cut at block boundaries, then into sentences
const blockSentences = (html) => html.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>|<!--[\s\S]*?-->/gi, ' ')
  .replace(/<\/?(?:p|li|tr|td|th|dd|dt|h[1-6]|summary|div|section|figcaption|caption|article|header|footer|nav|ul|ol|dl|table|thead|tbody|details|main|figure|svg|text)\b[^>]*>/gi, '\n')
  .replace(/<[^>]+>/g, ' ').replace(/&[a-z#0-9]+;/g, ' ')
  .split('\n').flatMap((l) => l.split(/(?<=[.?!])\s+/)).map((x) => x.replace(/\s+/g, ' ').trim()).filter(Boolean);

export function renderHub({ template, shared, hub, cities, assetVersion, frags, root = ROOT, weigh = true, europe = null }) {
  const where = 'cities/_hub.json';
  const warnings = [];
  const site = shared.siteUrl;
  // ── the keys ──
  const allow = (obj, pth) => {
    need(obj && typeof obj === 'object' && !Array.isArray(obj), where, `${pth || 'the hub'} must be an object`);
    for (const k of Object.keys(obj)) need(HUB_ALLOWED[pth].includes(k), where, `${pth ? pth + '.' : ''}${k} is a key the hub does not read: remove it`);
  };
  allow(hub, '');
  for (const k of ['meta', 'hero', 'map', 'fares', 'rules', 'faq', 'brief', 'footer']) allow(hub[k], k);
  allow(hub.map.rome, 'map.rome');
  if (hub.map.home !== undefined) allow(hub.map.home, 'map.home');
  need(hub.fares.plans && typeof hub.fares.plans === 'object', where, 'fares.plans is required');
  for (const p of Object.values(hub.fares.plans)) allow(p, 'fares.plan');
  need(Array.isArray(hub.fares.strip) && hub.fares.strip.length, where, 'fares.strip is a non-empty list');
  hub.fares.strip.forEach((x) => allow(x, 'fares.strip.item'));
  need(Array.isArray(hub.rules.rows) && hub.rules.rows.length, where, 'rules.rows is a non-empty list');
  hub.rules.rows.forEach((x) => allow(x, 'rules.row'));
  need(Array.isArray(hub.faq.items) && hub.faq.items.length, where, 'faq.items is a non-empty list');
  hub.faq.items.forEach((x) => allow(x, 'faq.item'));
  need(Array.isArray(hub.brief.rows) && hub.brief.rows.length, where, 'brief.rows is a non-empty list');
  hub.brief.rows.forEach((x) => allow(x, 'brief.row'));
  need(/^\d{4}-\d{2}-\d{2}$/.test(hub.updated || ''), where, '"updated" is YYYY-MM-DD');
  need(hub.hero.word && /^[A-Z]{2,12}$/.test(hub.hero.word), where, 'hero.word is the board word: 2–12 capital letters (the drum has no accents)');

  // ── the desks ──
  const bySlug = (a, b) => a.slug.localeCompare(b.slug);
  const live = cities.filter((c) => c.live === true).sort(bySlug);
  const drafts = cities.filter((c) => c.live !== true).sort(bySlug);
  need(live.length >= 1 && live.length <= 12, where, `the hub needs one to twelve live desks (${live.length})`);
  const home = live.find((c) => isHomeDesk(c, shared)) || null;
  const curOf = (c) => currencyOf(c.slug);
  const es = live.filter((c) => String(c.country || '').toUpperCase() === 'ES');
  const gbp = live.filter((c) => curOf(c) === 'GBP');
  // 3 · one set of fares: label, price, condition and unit equal at every live desk
  const plans = live[0].pricing.plans;
  for (const c of live) {
    need(c.pricing.plans.length === plans.length && c.pricing.plans.every((p, i) => p.id === plans[i].id && p.label === plans[i].label && Number(p.price) === Number(plans[i].price) && p.condition === plans[i].condition && (p.unit || '') === (plans[i].unit || '')),
      where, `the fares differ at the ${c.city} desk (label, price, condition or unit): the hub says "same at every desk"`);
    need(c.checkout === true, where, `${c.city} is live without the till: the hub sends every reader to a desk that takes its fares`);
  }
  // 4 · one person answers
  const persons = [...new Set(live.map((c) => c.desk.person))];
  need(persons.length === 1, where, `{person} needs one desk.person across the live desks (${persons.join(', ')})`);
  const roles = [...new Set(live.map((c) => c.desk.role))];
  need(roles.length === 1, where, `the live desks name one role (${roles.join(', ')})`);
  const plansById = Object.fromEntries(plans.map((p) => [p.id, p]));
  const cityPlans = (CITY_MARKETS[live[0].slug] && CITY_MARKETS[live[0].slug].plans) || {};
  // 2 · each ticket line is a line the server sells (CITY_PLANS.desc)
  const ucf = (s) => String(s).charAt(0).toLowerCase() + String(s).slice(1);
  need(Object.keys(hub.fares.plans).join() === plans.map((p) => p.id).join(), where, `fares.plans are ${plans.map((p) => p.id).join(', ')}, in that order`);
  for (const [id, p] of Object.entries(hub.fares.plans)) {
    need(str(p.who) && words(p.who) <= 9, where, `fares.plans.${id}.who is 1–9 words`);
    need(Array.isArray(p.lines) && p.lines.length >= 2 && p.lines.length <= 4 && p.lines.every(str), where, `fares.plans.${id}.lines: 2–4 lines`);
    const desc = String((cityPlans[id] || {}).desc || '');
    for (const l of p.lines) need(desc.includes(ucf(l)) || desc.includes(l), where, `fares.plans.${id}: "${l}" is not a line the server sells (api/_market.js CITY_PLANS["${id}"].desc)`);
  }
  // 5–7 · the rules table: every live check in exactly one row; holds and cuts name real checks
  const rows = hub.rules.rows;
  const rowIds = rows.flatMap((r) => r.ids || []);
  need(rows.filter((r) => r.country === true).length <= 1 && rows.every((r) => str(r.head) && (r.country === true ? r.ids === undefined : Array.isArray(r.ids) && r.ids.length)), where, 'a rules row is {head, ids[]} or the one {head, country: true}');
  need(new Set(rowIds).size === rowIds.length, where, 'a check id sits in one comparison row only');
  const liveCheck = new Map();
  for (const c of live) for (const k of c.checks.items) {
    need(rowIds.includes(k.id), where, `check ${c.slug}:${k.id} is in no comparison row`);
    liveCheck.set(`${c.slug}:${k.id}`, k);
  }
  const hold = hub.rules.hold || {}, cut = hub.rules.cut || {};
  for (const [k, why] of Object.entries(hold)) {
    need(liveCheck.has(k), where, `rules.hold["${k}"] is not a check of a live desk`);
    need(typeof why === 'string' && why.trim().length >= 10, where, `rules.hold["${k}"] needs its reason (10 characters at least): a hold never exists without one`);
  }
  for (const [k, list2] of Object.entries(cut)) {
    need(liveCheck.has(k), where, `rules.cut["${k}"] is not a check of a live desk`);
    need(Array.isArray(list2) && list2.length && list2.every((x) => str(x) && liveCheck.get(k).text.includes(x)), where, `rules.cut["${k}"]: every sentence cut must occur verbatim in that check's text`);
  }
  // 8 · "what we don't do" holds at EVERY live desk
  for (const c of live) {
    const d = (c.bref.rows.find((r) => r.dt === "What we don't do") || {}).ddHtml || '';
    need(/list homes/.test(d) && /represent landlords|act for landlords/.test(d) && /promise a date/.test(d), where, `the ${c.city} desk's "What we don't do" must say it does not list homes, represent or act for landlords, or promise a date (the hub says it of every desk)`);
  }
  // 18 · the company's identity strings are the entity's own (the same guard as the desks)
  identityGuard(JSON.stringify({ ...hub, rules: { ...hub.rules, hold: undefined } }), shared, where);
  // the hub's copy, every string (hold reasons and "updated" aside)
  const hubStrs = (() => {
    const strs = (v, pth) => (typeof v === 'string' ? [[pth, v]] : v && typeof v === 'object' ? Object.entries(v).flatMap(([k, x]) => strs(x, pth ? `${pth}.${k}` : k)) : []);
    return strs({ ...hub, updated: undefined, rules: { ...hub.rules, hold: undefined } }, '');
  })();
  // 10 · a desk not open is never linked, not even from the copy; and the copy is plain text
  {
    const offs0 = drafts.map((c) => c.slug);
    const reOff = offs0.length ? new RegExp(`(?:^|[\\s"'(=])(?:${SITE_RE(site)})?/(?:${offs0.join('|')})(?=[#"'?/\\s)]|$)`) : null;
    for (const [pth, v] of hubStrs) {
      need(!(reOff && reOff.test(v)), where, `${pth}: "${v.slice(0, 80)}" links a desk that is not open: it is named, never linked`);
      need(!/<\/?[a-z][^>]*>/i.test(v), where, `${pth}: "${v.slice(0, 80)}" carries markup: hub copy is plain text (the links are derived)`);
    }
  }
  // 17 · every statute the copy names is one a live desk's check names (before the digits: the precise reason first)
  const knownLaw = live.flatMap((c) => c.checks.items.flatMap((k) => [k.at, k.text]));
  for (const [pth, v] of hubStrs) for (const m of v.matchAll(STATUTE_RE)) {
    need(knownLaw.some((t) => t.includes(m[0])), where, `"${m[0]}" (in ${pth}: "${v.slice(0, 60)}…") is a statute no live desk's check names: the hub cites only what a desk checks`);
  }
  // 9 · digits in hub copy: only inside the allowed literals
  {
    for (const [pth, v] of hubStrs) {
      const rest = HUB_DIGIT_OK.reduce((s, lit) => s.split(lit).join(' '), v);
      need(!/\d/.test(rest), where, `${pth}: "${v.slice(0, 80)}" types a number — numbers come from tokens ({price:…}, {n}, {hours}…), only ${HUB_DIGIT_OK.map((x) => `"${x}"`).join(', ')} are written`);
    }
  }

  // ── the tokens ──
  const e = shared.entity, org = shared.organization;
  const cityList = listJoin(live.map((c) => c.city));
  const tok = {
    cities: cityList, n: numberWord(live.length), N: numberWord(live.length).replace(/^./, (x) => x.toUpperCase()),
    drafts: listJoin(drafts.map((c) => c.city)), legalName: e.legalName, rea: e.rea, vatID: org.vatID, address: e.address,
    person: persons[0], hours: hoursSentence(live), refund: shared.refund.rule,
    prices: Object.fromEntries(plans.map((p) => [p.id, money(p.price, 'EUR')])),
    homeCity: home ? home.city : '', esDesks: listJoin(es.map((c) => c.city)), gbpDesks: listJoin(gbp.map((c) => c.city))
  };
  const T = (s, w2 = where) => { const v = hubText(s, tok, w2); need(v !== null, w2, `"${String(s).slice(0, 60)}" uses an optional token with no value, where nothing can be dropped`); return v; };
  // an item that can be dropped: null when it names the home desk (or Spain, or London) and there is none
  const Topt = (s, label, isHome = false) => {
    if (isHome && !home) { warnings.push(`${label} dropped: no home-country desk`); return null; }
    const v = hubText(s, tok, where);
    if (v === null) warnings.push(`${label} dropped: it uses an optional token with no value`);
    return v;
  };
  const meta = {};
  for (const k of ['title', 'description', 'descriptionShort', 'ogTitle', 'ogDescription']) meta[k] = T(hub.meta[k]);
  if (meta.description.length > 165) meta.description = meta.descriptionShort;
  need(meta.title.length <= 62, where, `meta.title is ${meta.title.length} characters, over 62`);
  need(meta.description.length >= 110 && meta.description.length <= 165, where, `meta.description is ${meta.description.length} characters, outside 110–165`);
  const lead = T(hub.hero.lead);
  need(words(lead) <= HUB_BUDGET.lead, where, `hero.lead is ${words(lead)} words, over ${HUB_BUDGET.lead}`);
  // 17 · every statute the hub's own copy names is one a live desk's check names
  const authored = [];

  // ── the map's geometry: the same bows and the same arcs as every desk page ──
  const hubXY = mapXY(shared.rome.geo);
  const withGeo = cities.filter((x) => x.iata && x.geo);
  const bows = bowArcs(hubXY, withGeo.map((x) => [x.iata, mapXY(x.geo)]));
  const arcs = live.map((c) => { const to = mapXY(c.geo); return { key: c.iata, slug: c.slug, to, c: arcCtrl(hubXY, to, bows.get(c.iata)) }; });
  const offs = drafts.filter((c) => c.iata && c.geo).map((c) => { const to = mapXY(c.geo); return { key: c.iata, to, c: arcCtrl(hubXY, to, bows.get(c.iata)) }; });
  {
    const bad = arcViolations(hubXY, arcs, [...arcs.map((a) => ({ key: a.key, xy: a.to, r: ARC_DOT_R })), ...offs.map((o) => ({ key: o.key, xy: o.to, r: ARC_DOT_R }))]);
    need(!bad.length, where, `the hub map draws an arc over a desk: ${bad.join('; ')}`);
  }
  const drawn = arcs.map((a) => arcPts(hubXY, a.c, a.to, 240));

  // ── the board ──
  const fromOf = (c) => money(Math.min(...c.pricing.plans.map((p) => Number(p.price))), curOf(c));
  // LAU art. 20: on a Spanish desk every fare is optional, chosen in writing —
  // a price shown before the #fares note says so where it stands
  const optOf = (c) => (String(c.country).toUpperCase() === 'ES' ? ' · optional' : '');
  const idOf = (c) => `db-${c.iata.toLowerCase()}`;
  const codeCell = (iata) => `<th scope="row" class="db-code" role="rowheader"><b class="db-b" data-word="${esc(iata)}" aria-hidden="true"></b><span class="db-iata" data-instr>${esc(iata)}</span></th>`;
  const boardRows = [
    ...live.map((c) => [
      `        <tr class="db-r live" id="${idOf(c)}" data-desk="${esc(c.slug)}" role="row">`,
      `          ${codeCell(c.iata)}`,
      `          <td class="db-city" role="cell"><a class="db-go" href="/${esc(c.slug)}">${esc(c.city)}</a><span class="db-sub" data-nosnippet data-dw="${esc(c.slug)}">${esc(deskHoursText(c.desk))}</span>${c === home ? '<span class="db-tag" data-instr>ITALIAN LAW · AS ROME</span>' : ''}</td>`,
      '          <td class="db-st c-w" role="cell" data-instr>LIVE</td>',
      `          <td class="db-t c-w" role="cell"><span class="db-tv" data-nosnippet data-clk="${esc(c.slug)}"></span></td>`,
      `          <td class="db-now c-w" role="cell"><b class="db-nb" aria-hidden="true"></b><span class="sr" data-nosnippet data-nsr="${esc(c.slug)}"></span></td>`,
      `          <td class="db-fare c-w" role="cell">from <b>${fromOf(c)}</b>${optOf(c)}</td>`,
      '          <td class="db-gate" role="cell" aria-hidden="true"><span class="db-pill">Go to desk <i>→</i></span></td>',
      '        </tr>'
    ].join('\n')),
    ...drafts.filter((c) => c.iata).map((c) => `        <tr class="db-r off" id="${idOf(c)}" role="row">${codeCell(c.iata)}<td class="db-city" role="cell"><span class="db-name">${esc(c.city)}</span><span class="db-sub">Not open</span></td><td class="db-st c-w" role="cell" data-instr>NOT OPEN</td><td class="db-t c-w" role="cell"></td><td class="db-now c-w" role="cell"></td><td class="db-fare c-w" role="cell"></td><td class="db-gate" role="cell"></td></tr>`),
    [
      `        <tr class="db-r hub" id="db-${ROME_IATA.toLowerCase()}" role="row">`,
      `          ${codeCell(ROME_IATA)}`,
      '          <td class="db-city" role="cell"><a class="db-go" href="/">Rome</a><span class="db-sub">The hub · homes to rent in Rome</span></td>',
      '          <td class="db-st c-w" role="cell" data-instr>HUB</td><td class="db-t c-w" role="cell"></td><td class="db-now c-w" role="cell"></td><td class="db-fare c-w" role="cell"></td>',
      '          <td class="db-gate" role="cell" aria-hidden="true"><span class="db-pill">Go to BOOM Rome <i>→</i></span></td>',
      '        </tr>'
    ].join('\n')
  ];
  const boardHtml = [
    '      <div class="dboard-w quadro"><i class="tacca"></i>',
    '        <p class="db-h" aria-hidden="true"><b>BOOM · DESKS</b><span class="pill-st js" id="hubPill" data-nosnippet hidden><i class="dot"></i><span>Desks open</span></span></p>',
    '        <table class="dboard" id="dboard" role="table" aria-label="BOOM desks" data-instr>',
    '          <thead data-instr><tr role="row"><th scope="col" role="columnheader">Code</th><th scope="col" role="columnheader">Desk</th><th scope="col" class="c-w" role="columnheader">Status</th><th scope="col" class="c-w" role="columnheader">Desk time</th><th scope="col" class="c-w" role="columnheader">Now</th><th scope="col" class="c-w" role="columnheader">Fares from</th><th scope="col" role="columnheader"><span class="sr">Desk page</span></th></tr></thead>',
    '          <tbody>',
    ...boardRows,
    '          </tbody>',
    '        </table>',
    '      </div>'
  ].join('\n');

  // ── the map ──
  const N = (x) => r1(x);
  const grat = [];
  for (let lon = -10; lon <= 20; lon += 5) { const x = mapXY({ lon, lat: 46.75 })[0]; grat.push(`<line x1="${N(x)}" y1="-40" x2="${N(x)}" y2="480"/>`); }
  for (const lat of [40, 45, 50, 55]) { const y = mapXY({ lon: 5, lat })[1]; grat.push(`<line x1="0" y1="${N(y)}" x2="640" y2="${N(y)}"/><text x="6" y="${N(y - 4)}">${lat}°N</text>`); }
  // the land: Natural Earth's coast (cities/_europe.json, design/pages-deco/genera-europa.py),
  // drawn as a dot matrix clipped to it plus one hairline; without the file, sea dots only
  const land = europe && typeof europe.path === 'string' && europe.path ? europe.path : null;
  if (land) need(/^[MLZ0-9 .\-]+$/.test(land) && land.length <= 16000, 'cities/_europe.json', 'path: plain M/L/Z numbers, at most 16000 characters (python3 design/pages-deco/genera-europa.py)');
  const kOf = (a) => a.key.toLowerCase();
  // each live arc is lit FROM Rome: gold at the hub, fading toward the desk
  const grads = arcs.map((a) => `<linearGradient id="ga-${kOf(a)}" gradientUnits="userSpaceOnUse" x1="${N(hubXY[0])}" y1="${N(hubXY[1])}" x2="${N(a.to[0])}" y2="${N(a.to[1])}"><stop offset="0" stop-color="#FFD700" stop-opacity=".62"/><stop offset="1" stop-color="#fff" stop-opacity=".34"/></linearGradient>`).join('');
  const svg = [
    `<svg class="hmap-svg" viewBox="${HUB_VIEWBOX}" aria-hidden="true" focusable="false">`,
    '<defs><pattern id="seaDots" width="8" height="8" patternUnits="userSpaceOnUse"><circle cx="4" cy="4" r=".5" fill="#fff" fill-opacity=".06"/></pattern>'
      + '<pattern id="landDots" width="5" height="5" patternUnits="userSpaceOnUse"><circle cx="2.5" cy="2.5" r=".9" fill="#fff" fill-opacity=".22"/></pattern>'
      + (land ? `<path id="coast" d="${esc(land)}"/><clipPath id="land" clip-rule="evenodd"><use href="#coast"/></clipPath>` : '') + grads + '</defs>',
    '<rect class="sea" x="0" y="-40" width="640" height="520" fill="url(#seaDots)"/>',
    land ? '<rect class="land" x="0" y="-40" width="640" height="520" fill="url(#landDots)" clip-path="url(#land)"/><use class="coast" href="#coast" fill="none"/>' : '',
    `<g class="grat">${grat.join('')}</g>`,
    ...arcs.map((a, i) => `<path class="arc" id="arc-${kOf(a)}" style="--i:${i + 1};--s:url(#ga-${kOf(a)})" pathLength="1" fill="none" d="${arcD(hubXY, a)}"/>`),
    // the comet: the same curve, one short dash that runs ROM → desk once on hover or focus (the generated rules)
    ...arcs.map((a) => `<path class="comet" id="cm-${kOf(a)}" pathLength="1" fill="none" d="${arcD(hubXY, a)}"/>`),
    ...arcs.map((a) => `<circle class="lr" cx="${N(a.to[0])}" cy="${N(a.to[1])}" r="6" fill="none"/>`),
    ...arcs.map((a) => `<circle class="d" cx="${N(a.to[0])}" cy="${N(a.to[1])}" r="${ARC_DOT_R}"/>`),
    ...offs.map((o) => `<circle class="d off" cx="${N(o.to[0])}" cy="${N(o.to[1])}" r="${ARC_DOT_R}" fill="none"/>`),
    `<circle class="hub" cx="${N(hubXY[0])}" cy="${N(hubXY[1])}" r="5" fill="none"/><circle class="hub-r" cx="${N(hubXY[0])}" cy="${N(hubXY[1])}" r="${HUB_RING_R}" fill="none"/><circle class="hub-r r2" cx="${N(hubXY[0])}" cy="${N(hubXY[1])}" r="16" fill="none"/>`,
    ...arcs.map((a) => labelFor(a, drawn)),
    ...offs.map((o) => labelFor(o, drawn, ' off')),
    `<text class="m-l hub" x="${N(hubXY[0] + 20)}" y="${N(hubXY[1] + 4)}">${ROME_IATA} · HUB</text>`,
    '</svg>'
  ].filter(Boolean).join('');
  const pins = live.map((c) => {
    const [x, y] = mapXY(c.geo);
    const px = Math.round(r1n(x) / 640 * 1000) / 10, py = Math.round((r1n(y) + 40) / 520 * 1000) / 10;
    return `<a class="pin${px > 60 ? ' pc-l' : ''}" id="pin-${c.iata.toLowerCase()}" href="/${esc(c.slug)}" style="--x:${px.toFixed(1)}%;--y:${py.toFixed(1)}%" aria-label="Tenant-side rental agent in ${esc(c.city)}">`
      + '<i class="pin-dot" aria-hidden="true"></i>'
      + `<span class="pc" aria-hidden="true"><span class="pc-h"><b>${esc(c.iata)}</b> ${esc(c.city)} · Live<span class="pc-t" data-nosnippet data-clk="${esc(c.slug)}"></span></span><span class="pc-w" data-nosnippet data-dw="${esc(c.slug)}">${esc(deskHoursText(c.desk))}</span><span class="pc-f">from ${fromOf(c)}${optOf(c)}</span><span class="pc-go">Go to the ${esc(c.city)} desk →</span></span></a>`;
  });
  // one rule per live desk: its pin lights its arc; with motion allowed, the comet runs once
  const mapCss = '<style>' + arcs.map((a) => `.hmap:has(#pin-${kOf(a)}:is(:hover,:focus-visible)) #arc-${kOf(a)}{stroke:var(--gold);stroke-width:2;opacity:1}`).join('')
    + '@media (prefers-reduced-motion:no-preference){' + arcs.map((a) => `.hmap:has(#pin-${kOf(a)}:is(:hover,:focus-visible)) #cm-${kOf(a)}`).join(',') + '{animation:comet .9s cubic-bezier(.3,.7,.2,1) both}}</style>';
  const mp = hub.map;
  const romeCard = `          <article class="m-card"><h3><b data-instr>${ROME_IATA}</b> ${esc(T(mp.rome.h))}</h3><p>${esc(T(mp.rome.p))}</p><a class="lnk" href="/">${esc(T(mp.rome.link))} →</a></article>`;
  let homeCard = '';
  if (mp.home) {
    const h = Topt(mp.home.h, 'map.home card', true), p1 = h === null ? null : Topt(mp.home.p1, 'map.home card'), p2 = h === null ? null : Topt(mp.home.p2, 'map.home card'), lk = h === null ? null : Topt(mp.home.link, 'map.home card');
    if ([h, p1, p2, lk].every((x) => x !== null)) {
      homeCard = `          <article class="m-card home"><h3><b data-instr>${esc(home.iata)}</b> ${esc(h)}</h3><p>${esc(p1)}</p><p>${esc(p2)}</p><a class="lnk" href="/${esc(home.slug)}">${esc(lk)} →</a></article>`;
      authored.push(h, p1, p2, lk);
    }
  }
  authored.push(T(mp.eb), T(mp.h2g), T(mp.caption), T(mp.rome.h), T(mp.rome.p), T(mp.rome.link));
  const mapHtml = [
    `      <p class="eb" data-instr>${esc(T(mp.eb))}</p>`,
    `      <h2 id="mapH">${esc(tok.N)} desks, <span class="g">${esc(T(mp.h2g))}</span></h2>`,
    `      <p class="net-c">${esc(T(mp.caption))}</p>`,
    '      <div class="hmap-g">',
    `        <figure class="hmap" id="hmap"><div class="hmap-box">${svg}${pins.join('')}</div>`,
    '          <figcaption class="m-legend" aria-hidden="true"><i class="lg-l"></i>live desk <i class="lg-o"></i>not open <i class="lg-h"></i>Rome, the hub</figcaption></figure>',
    '        <div class="m-rail">',
    romeCard,
    homeCard,
    '        </div>',
    '      </div>'
  ].filter(Boolean).join('\n');

  // ── the fares ──
  const fr = hub.fares;
  const spain = fr.spain ? Topt(fr.spain, 'fares.spain note') : null;
  const gbpDesk = gbp.length ? `at the ${listJoin(gbp.map((c) => c.city))} desk${gbp.length > 1 ? 's' : ''}` : '';
  const tickets = plans.map((p) => {
    const hp = fr.plans[p.id];
    authored.push(hp.who, ...hp.lines);
    return [
      `        <li class="hft" id="hf-${esc(p.id)}">`,
      `          <p class="hft-band" data-instr>${esc(p.label)}</p>`,
      `          <p class="hft-who">${esc(hp.who)}</p>`,
      `          <p class="hft-price"><b>${money(p.price, 'EUR')}</b><span>${esc(p.condition)}</span></p>`,
      gbpDesk ? `          <p class="hft-gbp">${money(p.price, 'GBP')} ${esc(gbpDesk)}</p>` : '',
      `          <ul class="hft-inc">${hp.lines.map((l) => `<li>${esc(l)}</li>`).join('')}</ul>`,
      p.id === 'full-search' ? `          <p class="refund">${esc(shared.refund.rule)}</p>` : '',
      '        </li>'
    ].filter(Boolean).join('\n');
  });
  const strip = fr.strip.map((x, i) => {
    const k = Topt(x.k, `fares.strip[${i}]`), v = k === null ? null : Topt(x.v, `fares.strip[${i}]`);
    if (k === null || v === null) return null;
    need(x.href === undefined || /^\/[a-z0-9/#-]*$/.test(x.href), where, `fares.strip[${i}].href is a path on the site`);
    authored.push(k, v);
    return `          <li><b data-instr>${esc(k)}</b> ${x.href ? `<a class="lnk" href="${esc(x.href)}">${esc(v)}</a>` : esc(v)}</li>`;
  }).filter(Boolean);
  const gates = T(fr.gates);
  authored.push(T(fr.eb), T(fr.h2), T(fr.h2g), gates);
  if (spain) authored.push(spain);
  const faresHtml = [
    `      <p class="eb" data-instr>${esc(T(fr.eb))}</p>`,
    `      <h2 id="faresH2">${esc(T(fr.h2))} <span class="g">${esc(T(fr.h2g))}</span></h2>`,
    spain ? `      <p class="hnote es">${esc(spain)}</p>` : '',
    '      <ol class="hfares">',
    ...tickets,
    '      </ol>',
    '      <ul class="hrules">',
    ...strip,
    '      </ul>',
    `      <nav class="hgates" aria-label="${esc(gates)}"><p data-instr>${esc(gates)}</p>`,
    ...live.map((c) => `        <a href="/${esc(c.slug)}#fares"><b data-instr>${esc(c.iata)}</b> ${esc(c.city)}</a>`),
    '      </nav>'
  ].filter(Boolean).join('\n');

  // ── the rules ──
  const ru = hub.rules;
  const updatedIso = [hub.updated, ...live.map((c) => c.updated)].filter(Boolean).sort().pop();
  const updatedLong = dateLong(updatedIso);
  const cellOf = (c, row) => {
    if (row.country === true) {
      const cc = String(c.country || '').toUpperCase();
      // a country the hub cannot name is not invented: a dash, and a warning
      if (!COUNTRY_NAME[cc]) { warnings.push(`the ${c.city} desk's country "${cc}" has no name in COUNTRY_NAME: its cell reads "—"`); return `<span class="rc none" aria-hidden="true">—</span><span class="sr">Country not stated</span>`; }
      return `${esc(COUNTRY_NAME[cc])}${c === home ? ' <span class="rc-tag" data-instr>same law as BOOM Rome</span>' : ''}`;
    }
    const ks = c.checks.items.filter((k) => row.ids.includes(k.id));
    if (!ks.length) return `<span class="rc none" aria-hidden="true">—</span><span class="sr">Not one of the ${esc(c.city)} checks</span>`;
    return ks.map((k) => (hold[`${c.slug}:${k.id}`]
      ? `<a class="rc held" href="/${esc(c.slug)}#check-${esc(k.id)}"><span class="rc-t">${esc(k.title)}</span></a>`
      : `<a class="rc" href="/${esc(c.slug)}#check-${esc(k.id)}"><span class="rc-at" data-instr>${esc(k.at)}</span></a>`)).join('');
  };
  const anyHeld = live.some((c) => c.checks.items.some((k) => hold[`${c.slug}:${k.id}`]));
  const cutText = (c, k) => (cut[`${c.slug}:${k.id}`] || []).reduce((t, s) => t.split(s).join(''), k.text).replace(/\s+/g, ' ').trim();
  const full = live.map((c) => {
    const shown = c.checks.items.filter((k) => !hold[`${c.slug}:${k.id}`]);
    const held = c.checks.items.filter((k) => hold[`${c.slug}:${k.id}`]);
    return [
      `          <h3><a class="lnk" href="/${esc(c.slug)}#checks">${esc(c.city)}</a></h3>`,
      shown.length ? `          <dl>${shown.map((k) => `<dt>${esc(k.title)} <cite>${esc(k.at)}</cite></dt><dd>${esc(cutText(c, k))}</dd>`).join('')}</dl>` : '',
      held.length ? `          <p>Also on the ${esc(c.city)} page: ${esc(listJoin(held.map((k) => k.title)))}.</p>` : ''
    ].filter(Boolean).join('\n');
  });
  authored.push(T(ru.eb), T(ru.h2), T(ru.h2g), T(ru.note), T(ru.caption), T(ru.heldNote), ...rows.map((r) => T(r.head)));
  const rulesHtml = [
    `      <p class="eb" data-instr>${esc(T(ru.eb))}</p>`,
    `      <h2 id="rulesH">${esc(T(ru.h2))} <span class="g">${esc(T(ru.h2g))}</span></h2>`,
    `      <p class="r-note">${esc(T(ru.note))}</p>`,
    '      <table class="rtab" data-instr>',
    `        <caption>${esc(T(ru.caption))} · updated ${esc(updatedLong)}</caption>`,
    `        <thead><tr><td></td>${live.map((c) => `<th scope="col"><a href="/${esc(c.slug)}#checks"><b data-instr>${esc(c.iata)}</b> ${esc(c.city)}</a></th>`).join('')}</tr></thead>`,
    '        <tbody>',
    ...rows.map((r) => `          <tr><th scope="row">${esc(T(r.head))}</th>${live.map((c) => `<td data-k="${esc(c.iata)}">${cellOf(c, r)}</td>`).join('')}</tr>`),
    '        </tbody>',
    '      </table>',
    anyHeld ? `      <p class="r-held">${esc(T(ru.heldNote))}</p>` : '',
    '      <details class="sheet rfull"><summary>Every rule in full</summary>',
    '        <div class="rfull-in">',
    ...full,
    '        </div>',
    '      </details>'
  ].filter(Boolean).join('\n');

  // ── the questions ──
  const faqs = hub.faq.items.map((f, i) => {
    need(str(f.q) && str(f.a) && (f.home === undefined || typeof f.home === 'boolean'), where, `faq.items[${i}] needs q and a (home: true or nothing)`);
    const q = Topt(f.q, `faq.items[${i}]`, f.home === true), a = q === null ? null : Topt(f.a, `faq.items[${i}]`);
    if (q === null || a === null) return null;
    need(words(a) <= HUB_BUDGET.faqA, where, `faq "${q}": the answer is ${words(a)} words, over ${HUB_BUDGET.faqA}`);
    authored.push(q, a);
    return { q, a };
  }).filter(Boolean);
  need(faqs.length >= 3 && faqs.length <= 8, where, `three to eight questions (${faqs.length})`);
  const faqHtml = faqs.map((f, i) => `        <details><summary><span class="qn" aria-hidden="true">${pad2(i + 1)}</span> <span class="t">${esc(f.q)}</span></summary><p>${esc(f.a)}</p></details>`).join('\n');
  authored.push(T(hub.faq.eb), T(hub.faq.h2));

  // ── in brief ──
  const ruleTxt = esc(shared.refund.rule);
  const derived = {
    open: () => `${listJoin(live.map((c) => `<a class="lnk" href="/${esc(c.slug)}">${esc(c.city)}</a>`))}.${drafts.length ? ` ${esc(listJoin(drafts.map((c) => c.city)))} desk${drafts.length > 1 ? 's are' : ' is'} not open.` : ''}`,
    fees: () => `The same three flat fees at every desk, VAT included: ${plans.map((p) => `<b>${esc(p.label)} ${money(p.price, 'EUR')}</b>${p.unit ? ' ' + esc(p.unit) : ''}`).join(' · ')}${gbpDesk ? `; ${esc(gbpDesk)} ${listJoin(plans.map((p) => money(p.price, 'GBP')))}` : ''}. ${ruleTxt}`,
    withdrawal: () => `14 days from payment. Work starts inside them only if you ask: the “Start now” tick at checkout, or later in writing. <a class="lnk" href="${WITHDRAWAL_PATH}">Model withdrawal form</a>.`,
    rome: () => 'In Rome, BOOM is the agency itself, with <a class="lnk" href="/apartments">homes to rent</a>.',
    contact: () => `<a class="lnk" href="mailto:${esc(shared.contact.email)}">${esc(shared.contact.email)}</a> · <a class="lnk" href="tel:+${esc(shared.contact.whatsapp)}">${esc(shared.contact.phoneDisplay)}</a>`,
    updated: () => `<time datetime="${esc(updatedIso)}">${esc(updatedLong)}</time>`
  };
  const briefRows = hub.brief.rows.map((r, i) => {
    need(str(r.dt) && (r.home === undefined || typeof r.home === 'boolean') && ((str(r.dd) && r.derive === undefined) || (r.dd === undefined && HUB_DERIVE.includes(r.derive))), where, `brief.rows[${i}] is {dt, dd} or {dt, derive: ${HUB_DERIVE.join('|')}}`);
    const dt = Topt(r.dt, `brief.rows[${i}]`, r.home === true);
    if (dt === null) return null;
    let dd;
    if (r.derive) dd = derived[r.derive]();
    else { const v = Topt(r.dd, `brief.rows[${i}] (${dt})`); if (v === null) return null; dd = esc(v); authored.push(v); }
    authored.push(dt);
    return `        <dt>${esc(dt)}</dt><dd>${dd}</dd>`;
  }).filter(Boolean);
  authored.push(T(hub.brief.eb), T(hub.brief.h2), T(hub.brief.h2g));
  const briefHtml = [
    `      <p class="eb" data-instr>${esc(T(hub.brief.eb))}</p>`,
    `      <h2 id="briefH">${esc(T(hub.brief.h2))} <span class="g">${esc(T(hub.brief.h2g))}</span></h2>`,
    '      <dl class="enbref" id="enbref">',
    ...briefRows,
    '      </dl>'
  ].join('\n');

  // ── the footer ──
  const operator = String(e.legalName).replace(/\s+S\.r\.l\.?$/i, '').toUpperCase();
  const statement = T(hub.footer.statement);
  authored.push(statement, T(hub.hero.kicker), T(hub.hero.h1), lead, meta.title, meta.description, meta.ogTitle, meta.ogDescription);
  const footHtml = [
    '    <footer class="foot">',
    `      <div class="f-top"><svg aria-hidden="true"><use href="#boomMark"/></svg><b>${esc(HUB_NAME)}</b><p class="stmt">${esc(statement)}</p></div>`,
    '      <div class="f-grid">',
    `        <nav aria-label="Desks"><h3>Desks</h3> ${live.map((c) => `<a href="/${esc(c.slug)}">BOOM ${esc(c.city)}</a>`).join(' ')} <a href="/">BOOM Rome</a></nav>`,
    `        <nav aria-label="Legal"><h3>Legal</h3> <a href="${TERMS_PATH}">Terms</a> <a href="/privacy">Privacy</a> <a href="${WITHDRAWAL_PATH}">Withdrawal form</a></nav>`,
    `        <div class="f-co"><h3>Company</h3><p><a href="/buy-property-europe">Buying in Europe</a></p><p>${esc(e.legalName)}</p><p>${esc(e.address)}</p><p>Registered office: ${esc(e.registeredOffice)}</p><p>P.IVA ${esc(e.vat)} · REA ${esc(e.rea)}</p></div>`,
    '      </div>',
    `      <p class="tm">${esc(e.trademark)}</p>`,
    `      <p class="cr">© ${esc(shared.copyrightYear)} BOOM <span class="mono" aria-hidden="true">· DESKS · TENANT SIDE · OPERATED BY ${esc(operator)}</span></p>`,
    '    </footer>'
  ].join('\n');

  // 17 · statutes named by the hub's own copy, once its tokens are resolved
  {
    for (const s of authored) for (const m of String(s).matchAll(STATUTE_RE)) {
      need(knownLaw.some((t) => t.includes(m[0])), where, `"${m[0]}" (in "${String(s).slice(0, 60)}…") is a statute no live desk's check names: the hub cites only what a desk checks`);
    }
  }

  // ── JSON-LD ──
  const pageUrl = site + HUB_PATH;
  const orgId = site + '/#organization';
  const ogFile = path.join(root, 'og-desks.png');
  const ogImage = `${site}/og-desks.png${fs.existsSync(ogFile) ? '?v=' + hash(ogFile) : ''}`;
  const breadcrumb = {
    '@context': 'https://schema.org', '@type': 'BreadcrumbList', '@id': pageUrl + '#breadcrumb',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Home', item: site + '/' },
      { '@type': 'ListItem', position: 2, name: HUB_NAME, item: pageUrl }
    ]
  };
  const graph = {
    '@context': 'https://schema.org',
    '@graph': [
      orgNode(shared, cities),
      {
        '@type': 'CollectionPage', '@id': pageUrl + '#page', url: pageUrl, name: meta.ogTitle, description: meta.description, inLanguage: 'en',
        isPartOf: { '@id': site + '/#website' }, about: { '@id': orgId }, mainEntity: { '@id': pageUrl + '#desks' }, breadcrumb: { '@id': pageUrl + '#breadcrumb' },
        primaryImageOfPage: { '@type': 'ImageObject', url: ogImage, width: 1200, height: 630 },
        dateModified: updatedIso, publisher: { '@id': orgId },
        author: { '@type': 'Person', name: persons[0], jobTitle: roles[0], worksFor: { '@id': orgId } },
        hasPart: live.map((c) => ({ '@id': `${site}/${c.slug}#page` })),
        speakable: { '@type': 'SpeakableSpecification', cssSelector: ['.hub-lead', '.enbref'] }
      },
      {
        '@type': 'ItemList', '@id': pageUrl + '#desks', name: HUB_NAME, numberOfItems: live.length, itemListOrder: 'https://schema.org/ItemListOrderAscending',
        itemListElement: live.map((c, i) => ({ '@type': 'ListItem', position: i + 1, url: `${site}/${c.slug}`, item: { '@id': `${site}/${c.slug}#service` } }))
      },
      ...live.map((c) => serviceNode(c, shared, `${site}/${c.slug}`, orgId)),
      {
        '@type': 'FAQPage', '@id': pageUrl + '#faq', isPartOf: { '@id': pageUrl + '#page' }, inLanguage: 'en',
        mainEntity: faqs.map((f) => ({ '@type': 'Question', name: f.q, acceptedAnswer: { '@type': 'Answer', text: f.a } }))
      }
    ]
  };

  const config = {
    WORD: hub.hero.word,
    CODES: [...live.map((c) => c.iata), ...drafts.filter((c) => c.iata).map((c) => c.iata), ROME_IATA],
    DESKS: live.map((c) => ({ slug: c.slug, iata: c.iata, city: c.city, desk: { timeZone: c.desk.timeZone, hours: c.desk.hours, days: c.desk.days }, holidays: holidayKeyOf(c.slug) })),
    // the onda behind the hero (≥940): the same script as the desk pages, versioned in its URL
    ...(assetVersion && assetVersion.onda ? { ONDA: `/assets/boom-onda.js?v=${assetVersion.onda}` } : {})
  };
  const rome = shared.rome;
  const rating = `${esc(rome.rating)} on Google in Rome, ${esc(rome.reviews)} reviews`;
  // the H1 reads the board word once, in words ("Europe")
  const wordTitle = hub.hero.word.charAt(0) + hub.hero.word.slice(1).toLowerCase();
  const data = {
    meta, pageUrl, ogImage, assetVersion,
    robotsMeta: '<meta name="robots" content="index, follow, max-image-preview:large, max-snippet:-1">',
    jsonLdBreadcrumb: scriptJson(breadcrumb, ''),
    jsonLd: scriptJson(graph, ''),
    configJson: scriptJson(config, '  '),
    scrollBlock: frags.scrollBlock, solariEngine: frags.solariEngine, deskCalendar: frags.deskCalendar,
    mapCss,
    kicker: T(hub.hero.kicker), h1: T(hub.hero.h1), word: hub.hero.word, wordTitle, wordLen: String(hub.hero.word.length), lead,
    boardHtml,
    proofHtml: `Operated by ${esc(e.legalName)}, an Italian real estate agency registered in Rome · ${rome.profileUrl ? `<a class="lnk" href="${esc(rome.profileUrl)}" target="_blank" rel="noopener">${rating}</a>` : rating}`,
    mapHtml, faresHtml, rulesHtml,
    faqEb: T(hub.faq.eb), faqH2: T(hub.faq.h2), faqHtml,
    briefHtml, footHtml
  };
  const html = fill(template, data, 'cities/_hub.html');

  // ══ the output, read back ══
  for (const m of html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)) {
    try { JSON.parse(m[1]); } catch (err) { throw new BuildError(`${where}: JSON-LD does not parse: ${err.message}`); }
  }
  need(html.includes(GENERATED_MARK), 'cities/_hub.html', `the template must carry the mark "${GENERATED_MARK}"`);
  need(!/#D4AF37/i.test(html), where, 'the public pages use #FFD700; #D4AF37 is the portal gold');
  identityGuard(html, shared, where);
  const vis = visibleText(html);
  const bare = html.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>|<!--[\s\S]*?-->/gi, ' ');
  const metaStr = [...html.matchAll(/<meta [^>]*content="([^"]*)"/g)].map((m) => m[1]);
  const ldAll = ldStrings(html);
  // the hub's own JSON-LD (the desk-derived Services and the shared organization are the desks' words, vetted by their own build)
  const ldHub = ldStrings(html, (n) => n['@type'] !== 'Service' && n['@type'] !== 'RealEstateAgent');
  // 10 · the desks not open: named, never linked, never in the structured data, never a price or a call
  {
    const offSlugs = drafts.map((c) => c.slug);
    if (offSlugs.length) {
      const reOff = new RegExp(`href="(?:${SITE_RE(site)})?/(?:${offSlugs.join('|')})(?=[#"?/])`);
      const hit = html.match(reOff);
      need(!hit, where, `the hub links a desk that is not open (${hit ? hit[0] : ''}): it names it, never links it`);
      // the structured nodes (organization, page, list, services) never name a desk not open; the FAQPage
      // is the visible questions word for word (a "not open" sentence there is the page's own)
      const reName = new RegExp(`\\b(?:${drafts.flatMap((c) => [c.city, c.slug, c.iata].filter(Boolean)).join('|')})\\b`);
      const ldNodes = ldStrings(html, (n) => n['@type'] !== 'FAQPage');
      const hit2 = ldNodes.find((s) => reName.test(s));
      need(!hit2, where, `a desk that is not open appears in the JSON-LD: "${(hit2 || '').slice(0, 80)}"`);
      const reNameCity = new RegExp(`\\b(?:${drafts.map((c) => c.city).join('|')})\\b`);
      for (const s of [...blockSentences(html), ...ldAll.flatMap((x) => x.split(/(?<=[.?!])\s+/))]) {
        if (reNameCity.test(s)) need(!CALL_RE.test(s), where, `a sentence that names a desk not open promises a call: "${s.slice(0, 100)}"`);
      }
    }
    for (const a of arcs) need(live.some((c) => c.iata === a.key), where, `an arc ends at ${a.key}, which is not a live desk`);
    for (const row of html.matchAll(/<tr class="db-r off"[\s\S]*?<\/tr>/g)) {
      const t = visibleText(row[0]);
      need(!/[€£]|\d{2}:\d{2}|opening|partner/i.test(t) && !plans.some((p) => t.includes(p.label)) && !CALL_RE.test(t), where, `a "not open" row carries a price, an hour, a plan, "opening", "partner" or a call: "${t.trim()}"`);
    }
  }
  // 11 · no till anywhere
  need(!/id="till"|data-pay|"CHECKOUT"|cPaid|cConfirm/.test(html) && !/stripe/i.test(html), where, 'the hub carries no till: no pay control, no checkout config, no Stripe word (each desk takes its fares on its own page)');
  need(!/wa\.me|whatsapp:\/\//i.test(html), where, 'the hub carries no WhatsApp link (an unknown city lands in the Rome machine): email and phone only');
  // 12 · prices: the six figures, £ beside London, the refund rule beside every €500/£500
  {
    const known = new Set(plans.flatMap((p) => [money(p.price, 'EUR'), money(p.price, 'GBP')]));
    const odd = [vis, ...ldAll, ...metaStr].join(' \n ').match(/[€£]\s?\d+(?:,\d{3})*/g) || [];
    const stray = [...new Set(odd.map((x) => x.replace(/\s/g, '')))].filter((x) => !known.has(x));
    need(!stray.length, where, `a price the plans do not charge is stated on the hub: ${stray.join(', ')}`);
    const blank = (m) => ' '.repeat(m.length);
    const flat = html.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>|<!--[\s\S]*?-->/gi, blank);
    const bodyAt = flat.indexOf('<body');
    const boxOf = (idx, tags) => enclosingText(flat, idx, tags);
    const gbpNames = new RegExp(gbp.map((c) => c.city).join('|') || '(?!)');
    for (const m of flat.matchAll(/£/g)) {
      if (m.index < bodyAt) continue;
      need(gbpNames.test(boxOf(m.index, ['tr', 'li', 'dd', 'details', 'p', 'a'])), where, `a £ stands in a block that does not name ${listJoin(gbp.map((c) => c.city)) || 'a pound desk'}: "…${visibleText(flat.slice(Math.max(bodyAt, m.index - 80), m.index + 30)).trim()}…"`);
    }
    for (const p500 of [money(plans[0].price, 'EUR'), money(plans[0].price, 'GBP')]) {
      const re = new RegExp(p500.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '(?![\\d,])', 'g');
      for (const m of flat.matchAll(re)) {
        if (m.index < bodyAt) { const attr = flat.slice(flat.lastIndexOf('"', m.index - 1), flat.indexOf('"', m.index + 1) + 1); need(/refunded in full/.test(attr), where, `a ${p500} in the head stands without the refund rule`); continue; }
        need(/refunded in full/.test(boxOf(m.index, ['li', 'dd', 'details'])), where, `a ${p500} stands without the refund rule in its own block: "…${visibleText(flat.slice(Math.max(bodyAt, m.index - 100), m.index + 40)).trim()}…"`);
      }
      for (const t of ldAll) if (t.includes(p500)) need(/refunded in full/.test(t), where, `a ${p500} in the JSON-LD stands without the refund rule: "${t.slice(0, 100)}…"`);
    }
    if (es.length) {
      const fa = sliceOf(html, '<section class="sec" id="fares"', '</section>');
      const note = fa.indexOf('class="hnote es"'), first = fa.search(/[€£]\d/);
      need(note > -1 && note < first, where, `the Spain note ("optional, chosen in writing", LAU art. 20) comes before the first price in #fares`);
      need(listJoin(es.map((c) => c.city)) === tok.esDesks && (spain || '').includes(tok.esDesks), where, 'the Spain note names exactly the Spanish live desks');
      // outside #fares (the board row, the pin card) a Spanish price stands
      // beside its own "optional": it is read before the note (LAU art. 20)
      for (const c of es) for (const [open, close] of [[`<tr class="db-r live" id="db-${c.iata.toLowerCase()}"`, '</tr>'], [`<a class="pin" id="pin-${c.iata.toLowerCase()}"`, '</a>']]) {
        const box = sliceOf(html, open, close);
        need(box && (!/[€£]\d/.test(box) || /[€£]\d[\d,]*<\/b>\s*· optional|[€£]\d[\d,]*\s*· optional/.test(box)), where, `${c.city}: a price outside #fares stands without "· optional" (LAU art. 20)`);
      }
    }
  }
  // 13 · the rating once, in Rome
  {
    const ratings = ([vis, ...ldAll].join(' \n ').match(RATING_RE) || []).length;
    need(ratings === 1 && (html.match(/on Google in Rome/g) || []).length === 1 && (html.match(/on Google/g) || []).length === 1, where, `the Rome rating appears exactly once, labelled "in Rome" (${ratings} found)`);
  }
  // 14 · the static HTML is never live: the clock, the window and the status are the script's
  {
    const said = bare.replace(/<[^>]+>/g, ' ');
    const hit = said.match(/(?<!not |NOT )\bOPEN\b|\bCLOSED\b/) || said.match(/desk open until/i);
    need(!hit, where, `the static HTML says a desk is open or closed ("${hit ? hit[0] : ''}"): only the script, from the desk calendar, says it`);
    for (const m of html.matchAll(/<[^>]*\sdata-(?:clk|dw|nsr)="[^"]*"[^>]*>/g)) need(/\sdata-nosnippet(?=[\s>])/.test(m[0]), where, `a live instrument without data-nosnippet: ${m[0]}`);
    for (const m of html.matchAll(/<(\w+)[^>]*\sdata-(?:clk|nsr)="[^"]*"[^>]*>([^<]*)<\/\1>/g)) need(!m[2].trim(), where, `a clock or a status is served filled: ${m[0]}`);
  }
  // 15 · banned copy (the hub's own words and chrome; the desks' check text on the full sheet is vetted by their own build)
  {
    const own = [visibleText(html.replace(/<details class="sheet rfull">[\s\S]*?<\/details>/, ' ')), ...metaStr, ...ldHub].join(' \n ');
    const said = own.replace(/not a law firm/gi, ' ');
    for (const [re, why] of HUB_BANNED) { const m = said.match(re); need(!m, where, `${why}: "${m ? m[0] : ''}"`); }
    for (const re of [AVIATION_BAN_RE, CLOCK_RE]) { const m = own.match(re); need(!m, where, `no seat, boarding, countdown or clock promise on the hub ("${m ? m[0] : ''}")`); }
    need(!/✈/.test(html), where, 'no ✈ (U+2708) on the hub');
    need(!/!(?=[\s<"]|$)/.test(bare.replace(/<!DOCTYPE[^>]*>/i, '').replace(/<[^>]+>/g, ' ')), where, 'no exclamation mark in the copy');
    need(!/(?<![\d,.])500\+|off-market|whichever is lower/i.test(vis), where, 'no "500+", "off-market" or "whichever is lower"');
  }
  // 16 · counts: every "N desks" / "N European cities" is the live count; no head counts
  {
    const said = [vis, ...metaStr, ...ldHub].join(' \n ');
    for (const m of said.matchAll(/\b(one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|\d+)\s+(?:desks|European cities)\b/gi)) {
      const n = /^\d+$/.test(m[1]) ? Number(m[1]) : NUMBER_WORDS.indexOf(m[1].toLowerCase()) + 1;
      need(n === live.length, where, `"${m[0]}" is not the live count (${live.length})`);
    }
    const m2 = said.match(/\d+\s*(?:clients|tenants|moves|searches|leases|families)|(?<![\d,.])500\+|\bhundreds\b|\bthousands\b/i);
    need(!m2, where, `a head count the hub cannot prove: "${m2 ? m2[0] : ''}"`);
  }
  // 19 · the structure
  for (const m of html.matchAll(/<section class="sec[^"]*"[^>]*>([\s\S]*?)<\/section>/g)) {
    const id = (m[0].match(/id="([^"]+)"/) || [])[1] || '?';
    const h2 = (m[1].match(/<h2\b[^>]*>([\s\S]*?)<\/h2>/) || [])[1];
    need(h2 !== undefined && (h2.match(/class="g"/g) || []).length === 1, where, `a section h2 needs exactly one gold phrase: #${id}`);
    need(/<p class="eb" data-instr>[^<]+<\/p>/.test(m[1]), where, `a section opens with its eyebrow: #${id}`);
  }
  {
    const wayf = sliceOf(html, '<nav class="wayf"', '</nav>');
    const ids = [...wayf.matchAll(/href="#([\w-]+)"/g)].map((x) => x[1]);
    need(ids.length >= 4 && ids.every((x) => html.includes(`id="${x}"`)), where, `the header's wayfinding links land on ids that exist (${ids.join(', ')})`);
  }
  need((html.match(/class="board"/g) || []).length === 1 && html.includes(`<span class="sr">${esc(wordTitle)}</span></h1>`), where, 'one board, served empty, outside the H1 (the H1 reads the word once, in its .sr span)');
  need(/class="hub-lead"/.test(html) && /<dl class="enbref" id="enbref">/.test(html) && !/<details[^>]*>\s*<summary[^>]*>[^<]*<\/summary>\s*<dl class="enbref"/.test(html), where, 'the speakable nodes (.hub-lead, .enbref) exist, and the fact sheet is open');
  // 20 · dates and placeholders (the hub is live)
  {
    const sm = path.join(root, 'sitemap.xml');
    if (fs.existsSync(sm)) {
      const m = fs.readFileSync(sm, 'utf8').match(new RegExp(`<loc>${SITE_RE(pageUrl)}</loc>\\s*<lastmod>([^<]+)</lastmod>`));
      need(m && m[1] === updatedIso, where, `the hub's dateModified (${updatedIso}) and the sitemap <lastmod> of ${pageUrl} (${m ? m[1] : 'missing'}) must be the same date`);
    }
    const ph = (bare.replace(/<[^>]+>/g, ' ').match(/\[[^\[\]]{1,300}\]/g) || []);
    need(!ph.length, where, `the hub is live and carries placeholders: ${ph.join(', ')}`);
    need(fs.existsSync(ogFile), where, 'og-desks.png is missing (python3 design/pages-deco/genera-og-cities.py --hub)');
  }

  // ══ budgets ══
  const parts = atLoadParts(html);
  const proseWords = words(parts.prose), instrWords = words(parts.instr), bodyWords = proseWords + instrWords;
  need(bodyWords <= HUB_BUDGET.body, where, `${bodyWords} visible words at load, over ${HUB_BUDGET.body}`);
  need(proseWords <= HUB_BUDGET.prose, where, `${proseWords} words of prose at load, over ${HUB_BUDGET.prose}`);
  need(instrWords <= HUB_BUDGET.instr, where, `${instrWords} words of instruments at load, over ${HUB_BUDGET.instr}`);
  {
    const ddEx = (n) => n.name === 'dd' && /(?:^|\s)enbref(?:\s|$)/.test(n.parentCls);
    const long = longNodes(parts.html, HUB_BUDGET.node, ddEx);
    need(!long.length, where, `a text node over ${HUB_BUDGET.node} words at load: ${long.map((x) => `<${x.tag}${x.cls ? ' class="' + x.cls + '"' : ''}> ${x.words} "${x.text}…"`).join(' · ')}`);
    for (const m of sliceOf(parts.html, '<dl class="enbref"', '</dl>').matchAll(/<dd>([\s\S]*?)<\/dd>/g)) {
      const n = words(visibleText(m[1]));
      need(n <= HUB_BUDGET.dd, where, `a fact-sheet answer is ${n} words, over ${HUB_BUDGET.dd}: "${visibleText(m[1]).trim().slice(0, 80)}…"`);
    }
  }
  const sections = {};
  for (const [id, cap] of [['board', 'board'], ['map', 'map'], ['fares', 'fares'], ['rules', 'rules'], ['faq', 'faq'], ['brief', 'brief']]) {
    const sec = sliceOf(parts.html, `id="${id}"`, '</section>');
    need(sec, where, `the hub needs its #${id} section`);
    const n = words(visibleText(sec.slice(sec.indexOf('>') + 1)));
    sections[id] = n;
    need(n <= HUB_BUDGET[cap], where, `the #${id} section is ${n} words at load, over its ${HUB_BUDGET[cap]}`);
  }
  let weight = null;
  if (weigh) {
    const gz = (buf) => zlib.gzipSync(buf, { level: 9 }).length;
    const file = (f) => gz(fs.readFileSync(path.join(root, f)));
    const page = gz(Buffer.from(html)), css = file('assets/boom-desks.css'), js = file('assets/boom-desks.js');
    const total = page + css + js + file('assets/boom-city.css') + file('assets/boom-onda.js') + file('js/boom-consent.js') + file('js/boom-track.js');
    weight = { totalKb: total / 1024, pageKb: page / 1024, cssKb: css / 1024, jsKb: js / 1024 };
    need(weight.totalKb <= HUB_WEIGHT_KB.total, where, `first-party weight ${weight.totalKb.toFixed(1)} KB gzipped, over ${HUB_WEIGHT_KB.total}`);
    need(weight.pageKb <= HUB_WEIGHT_KB.page, where, `desks.html is ${weight.pageKb.toFixed(1)} KB gzipped, over ${HUB_WEIGHT_KB.page}`);
    need(weight.cssKb <= HUB_WEIGHT_KB.css, where, `assets/boom-desks.css is ${weight.cssKb.toFixed(1)} KB gzipped, over ${HUB_WEIGHT_KB.css}`);
    need(weight.jsKb <= HUB_WEIGHT_KB.js, where, `assets/boom-desks.js is ${weight.jsKb.toFixed(1)} KB gzipped, over ${HUB_WEIGHT_KB.js}`);
  }
  return { slug: 'desks', file: HUB_FILE, live: true, mode: 'hub', html, placeholders: [], warnings, weight, words: bodyWords, prose: proseWords, instr: instrWords, sections, dateModified: updatedIso };
}

// Reads the hub's template and copy, the shared file, every city (each
// validated through renderCity first: buildAll), the optional coast path.
export function buildHub({ root = ROOT, pages = null } = {}) {
  const dir = path.join(root, 'cities');
  const desks = pages || buildAll({ root });
  const template = fs.readFileSync(path.join(dir, '_hub.html'), 'utf8');
  const hub = readJson(path.join(dir, '_hub.json'));
  const shared = readJson(path.join(dir, '_shared.json'));
  const cities = desks.map((p) => readJson(path.join(dir, `${p.slug}.json`)));
  const ef = path.join(dir, '_europe.json');
  const europe = fs.existsSync(ef) ? readJson(ef) : null;
  for (const f of ['assets/boom-desks.css', 'assets/boom-desks.js']) need(fs.existsSync(path.join(root, f)), f, 'is missing: the hub links it');
  const assetVersion = {
    css: hash(path.join(root, 'assets/boom-city.css')),
    onda: hash(path.join(root, 'assets/boom-onda.js')),
    desksCss: hash(path.join(root, 'assets/boom-desks.css')),
    desksJs: hash(path.join(root, 'assets/boom-desks.js'))
  };
  return renderHub({ template, shared, hub, cities, assetVersion, frags: fragments(root), root, europe });
}

function readJson(file) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); }
  catch (e) { throw new BuildError(`${path.relative(ROOT, file) || file}: ${e.message}`); }
}
const hash = (file) => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex').slice(0, 10);

export function buildAll({ root = ROOT } = {}) {
  const dir = path.join(root, 'cities');
  const template = fs.readFileSync(path.join(dir, '_template.html'), 'utf8');
  const shared = readJson(path.join(dir, '_shared.json'));
  // the onda canvas script is weighed in every page and versioned in its URL
  need(fs.existsSync(path.join(root, 'assets/boom-onda.js')), 'assets/boom-onda.js', 'is missing: every page weighs it and boom-city.js loads it at ≥940px (v1.6 §D)');
  const assetVersion = {
    css: hash(path.join(root, 'assets/boom-city.css')),
    js: hash(path.join(root, 'assets/boom-city.js')),
    onda: hash(path.join(root, 'assets/boom-onda.js')),
    // the hub's own files (BOOM Desks): the desk pages do not read them
    ...(fs.existsSync(path.join(root, 'assets/boom-desks.css')) ? { desksCss: hash(path.join(root, 'assets/boom-desks.css')) } : {}),
    ...(fs.existsSync(path.join(root, 'assets/boom-desks.js')) ? { desksJs: hash(path.join(root, 'assets/boom-desks.js')) } : {})
  };
  const frags = fragments(root);
  // Every city is read before any is rendered: the family of one page is
  // made of the others.
  const cities = fs.readdirSync(dir)
    .filter((f) => f.endsWith('.json') && !f.startsWith('_'))
    .sort()
    .map((f) => {
      const city = readJson(path.join(dir, f));
      need(city.slug === f.replace(/\.json$/, ''), `cities/${f}`, `slug "${city.slug}" must match the file name`);
      return city;
    });
  // the coast under every network map (optional: design/pages-deco/genera-europa.py)
  const ef = path.join(dir, '_europe.json');
  const europe = fs.existsSync(ef) ? readJson(ef) : null;
  return cities.map((city) => renderCity({ template, shared, city, assetVersion, frags, root, cities, europe }));
}

// Writes (or, with check, compares) every page. Every page is validated
// before the first byte is written: one bad city leaves the others untouched.
// BOOM Desks: the hub (desks.html) is built with them when cities/_hub.json
// exists; a committed desks.html whose copy is gone is an error, never a
// page left behind unchecked.
export function writeAll({ root = ROOT, check = false } = {}) {
  const desks = buildAll({ root });
  const hasHub = fs.existsSync(path.join(root, 'cities', '_hub.json'));
  need(hasHub || !fs.existsSync(path.join(root, HUB_FILE)), HUB_FILE, 'exists but cities/_hub.json is missing: restore the hub\'s copy or remove the page');
  const pages = hasHub ? [...desks, buildHub({ root, pages: desks })] : desks;
  const results = pages.map((p) => {
    const out = path.join(root, p.file);
    const cur = fs.existsSync(out) ? fs.readFileSync(out, 'utf8') : null;
    if (cur !== null && !cur.includes(GENERATED_MARK)) {
      throw new BuildError(`${p.file} exists and was not generated by this script — refusing to overwrite it`);
    }
    return { ...p, out, stale: cur !== p.html };
  });
  if (!check) for (const r of results) if (r.stale) fs.writeFileSync(r.out, r.html);
  return results;
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const check = process.argv.includes('--check');
  try {
    let stale = 0;
    for (const p of writeAll({ check })) {
      if (check && p.stale) { stale++; console.error(`✗ ${p.file} is stale — run: npm run build:cities`); continue; }
      if (p.mode === 'hub') console.log(`${check ? '✓ up to date' : '✓ built'}  ${p.file}  ·  HUB  ·  ${p.words} words at load (prose ${p.prose} · instr ${p.instr}; ${Object.entries(p.sections).map(([k, v]) => `${k} ${v}`).join(' · ')})  ·  ${p.weight.totalKb.toFixed(1)} KB gz (page ${p.weight.pageKb.toFixed(1)} · css ${p.weight.cssKb.toFixed(1)} · js ${p.weight.jsKb.toFixed(1)})`);
      else console.log(`${check ? '✓ up to date' : '✓ built'}  ${p.file}  ·  ${p.live ? 'LIVE' : 'draft (noindex)'}  ·  mode ${p.mode}  ·  ${p.words} words at load (prose ${p.prose} · instr ${p.instr})  ·  ${p.weight ? p.weight.totalKb.toFixed(1) + ' KB gz (js ' + p.weight.jsKb.toFixed(1) + ' · css ' + p.weight.cssKb.toFixed(1) + ' · onda ' + p.weight.ondaKb.toFixed(1) + ')' : ''}`);
      for (const w of p.warnings) console.log(`  ⚠ ${w}`);
      if (p.placeholders.length) {
        console.log(`  ${p.placeholders.length} placeholder(s) to replace before live:true:`);
        for (const x of p.placeholders) console.log('   - ' + x);
      }
    }
    if (stale) process.exit(1);
  } catch (e) {
    if (e instanceof BuildError) { console.error('✗ ' + e.message); process.exit(1); }
    throw e;
  }
}
