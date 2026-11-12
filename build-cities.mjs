#!/usr/bin/env node
// build-cities.mjs — the BOOM city pages, built from data. Zero dependencies.
//
//   node build-cities.mjs           emit assets/boom-*.{css,js} from assets/src/ (comments
//                                   stripped), then regenerate /<slug>.html from cities/<slug>.json
//   node build-cities.mjs --check   exit 1 when a committed page, or a served asset, is not what the build makes
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
//     follow the tick; v1.8 stage W: a selling desk whose withdrawal line
//     ({online}), footer ("Withdraw from contract here") or the hub strip
//     does not link the online withdrawal function (/withdrawal…#online);
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
//
// v1.8 (stage B1, dark until the flip) — THE THIRD SHAPE: a desk that sells
// and CHARGES AT SIGNING (spec v1.8 §3.2, §3.3, §3.7). The registry says it
// (CITY_MARKETS.<slug>.chargeAt 'signing', read like the currency) and the
// JSON repeats it ("chargeAt"): the build refuses the two apart, either way.
// The till takes an ORDER under ONE label (never labelWait), states how long
// the order runs (checkoutCopy.order) and links the online withdrawal
// function ({online}); every fare says which signing earns it (trigger); the
// signing rule (cities/_shared.json signing.rule) sits where the six print
// the refund rule — under the closed €500, the Fees row, the Offers, the
// fine print — and the order shows BOOKED (checkoutCopy.booked), never PAID:
// paid and booked are exclusive. A page that charges at signing never says
// "refunded in full" or "work already done", never PreOrder; a desk that
// charges at the till never says it is paid at signing, nor prints the
// signing rule. A French or German desk that sells charges at signing (loi
// Hoguet art. 6, WoVermRG §2(4)). The spec's "SHIP-DATE" is refused.

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import zlib from 'node:zlib';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { CITY_MARKETS } from './api/_market.js';
// v1.8: the order terms of the desks that charge at signing — the page posts their version, the server
// refuses an older one with 409 terms_changed (ORDER_TERMS_V in the page config)
import { ORDER_TERMS } from './api/_cityterms.js';
import { upgradePathsOf, upgradeLine, upgradeFact, upgradeDaysOf, upgradeTillHint, upgradeHubLine } from './api/_upgrade.js';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
// The model withdrawal form (Directive 2011/83/EU Annex I(B)), linked from the
// till's withdrawal line and from the paid email (api/stripe-webhook.js).
export const WITHDRAWAL_PATH = '/withdrawal';
// v1.8 stage W: the online withdrawal function (Directive 2023/2673, CRD art.
// 11a) sits at WITHDRAWAL_PATH#online; its label is the statutory one, word
// for word — the footer of every selling desk, the managed ticket (BOOKED)
export const WITHDRAW_LABEL = 'Withdraw from contract here';
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
// v1.7 — THE MAP ON VIEW, weighed apart AND counted: assets/boom-map.js (the
// Horizon's night, glow and planes) is injected only when the map nears the
// screen (600px ahead), never before the page works, like an image below the
// fold. It has its own cap (a NEW line), and it is counted in a page's total
// too: the 82 KB hold WITH the map (the lead's rule for Stage 2), so a page
// that fits only without its map does not fit.
export const MAP_KB = 3.5;
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
// v1.8 (W1): the JSON-LD is read by machines, never by a person, so it goes out on ONE line (the same `<` escape).
// Every reader parses it (the claims guard, run.mjs ldOf, seo, answers, faqtruth): the parsed objects are the same,
// only the whitespace between tokens goes. It is what lets the hub hold its 28 KB page cap with eight live desks.
const ldJson = (obj) => JSON.stringify(obj).replace(/</g, '\\u003c');

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

// ══ THE HORIZON (v1.7, 03/11/2026) — the map of /desks and of every desk ═══
// The founder, on a real iPhone: «the map is beautiful; iterate it much
// more: more like a map, routes, animations, a globe». A tilted satellite
// still of the real Earth: a camera above the Sahara looks north at Europe,
// so the curve of the planet and its lit rim cross the top of the frame and
// the arcs from Rome rise over it. Everything that does not change is built
// HERE into a static SVG (the page without JS, the print, reduced motion);
// assets/boom-map.js adds only what changes with time: the night (the real
// terminator, from the date), the glow of the desks open now (the desk
// calendar, the same as the board), one plane per arc when the map comes
// into view and on a desk's pin or link.
//
// THE CAMERA FITS ITSELF: it looks from a fixed point, and the frame is
// fitted to every desk with coordinates plus Rome (the same set on every
// page, so a dot, an arc and a label are the same everywhere). A new desk
// re-frames the map; nothing is refused by a fixed rectangle.
export const HZ_W = 640, HZ_H = 520, HZ_VIEWBOX = `0 0 ${HZ_W} ${HZ_H}`;
// The side paddings are uneven on purpose (Stage 2, 04/11/2026): the fit is
// bound by the WIDTH, and at 0.1/0.1 the two closest pins (AMS and LON) stood
// 42.4px apart on a 320px phone — 44px targets overlapping by 1.6px. Room is
// taken from the right, where Rome's label sits under its ring anyway, and a
// little from the left, where Madrid's label needs the margin: with the
// eight desks of 04/11/2026 AMS–LON measure 44.7px at 320px and 55.6px at
// 390px. Since v1.8 the hub build asserts the 44px spacing only where a pin
// is a target, from 600px (HUB_MAP_PX); a phone taps the map box (option (b)).
export const HZ_CAM = { lon: 5, lat: 29, dist: 1.3, tlon: 5, tlat: 51, pad: { l: 0.09, r: 0.06, t: 0.25, b: 0.08 } };
// THE FIT NEVER ZOOMS IN PAST THIS SCALE (frame units per unit of the pinhole
// plane; today's eight desks fit at 981). A far desk zooms the map OUT and
// re-frames it; with few desks (a hub with one desk live, a test root with one
// city) the fit alone would zoom IN past the horizon and refuse ("the camera
// looks too low") — the globe is the point of the drawing, so the frame keeps
// the scale of the full map and the limb stays across its top.
export const HZ_SCALE_MAX = 1000;
const RAD = Math.PI / 180;
export const v3 = (lon, lat) => [Math.cos(lat * RAD) * Math.cos(lon * RAD), Math.cos(lat * RAD) * Math.sin(lon * RAD), Math.sin(lat * RAD)];
const vdot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const vadd = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const vsub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const vmul = (a, k) => [a[0] * k, a[1] * k, a[2] * k];
const vcross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const vnrm = (a) => vmul(a, 1 / Math.hypot(a[0], a[1], a[2]));
const r1n = (n) => Math.round(n * 10) / 10;
const geoOk = (g) => !!g && typeof g === 'object' && !Array.isArray(g) && typeof g.lat === 'number' && typeof g.lon === 'number' && Number.isFinite(g.lat) && Number.isFinite(g.lon);
// The camera: C above (lon, lat) at `dist` Earth radii from the centre,
// looking at the target on the surface; north stays up. `raw` is the pinhole
// projection; S, TX, TY fit the points to the frame inside its paddings.
export function hzCamera(points, o = HZ_CAM, W = HZ_W, H = HZ_H) {
  const C = vmul(v3(o.lon, o.lat), o.dist), fwd = vnrm(vsub(v3(o.tlon, o.tlat), C));
  const right = vnrm(vcross(fwd, [0, 0, 1])), up = vcross(right, fwd);
  const raw = (X) => { const d = vsub(X, C), z = vdot(d, fwd); return z <= 1e-6 ? null : [vdot(d, right) / z, -vdot(d, up) / z]; };
  const rs = points.map((g) => raw(v3(g.lon, g.lat)));
  need(rs.every(Boolean), 'the Horizon map', 'a desk sits behind the camera');
  const xs = rs.map((p) => p[0]), ys = rs.map((p) => p[1]);
  const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
  const aw = W * (1 - o.pad.l - o.pad.r), ah = H * (1 - o.pad.t - o.pad.b);
  const S = Math.min(aw / Math.max(x1 - x0, 1e-9), ah / Math.max(y1 - y0, 1e-9), HZ_SCALE_MAX);
  const TX = W * o.pad.l + (aw - S * (x1 - x0)) / 2 - S * x0, TY = H * o.pad.t + (ah - S * (y1 - y0)) / 2 - S * y0;
  const Cn = Math.hypot(...C), Ch = vmul(C, 1 / Cn), cosH = 1 / Cn, sinH = Math.sqrt(1 - cosH * cosH);
  const proj = (X) => { const p = raw(X); return p && [TX + S * p[0], TY + S * p[1]]; };
  // a point ON the sphere faces the camera when X·C ≥ 1 (the horizon is X·C = 1)
  const seen = (X) => vdot(X, C) >= 1;
  // a point beyond the horizon, laid on the limb in its own direction (the coast that runs over the curve)
  const onLimb = (X) => { const u = vnrm(vsub(X, vmul(Ch, vdot(X, Ch)))); return vadd(vmul(Ch, cosH), vmul(u, sinH)); };
  const clampProj = (X) => proj(seen(X) ? X : onLimb(X));
  // a point ABOVE the sphere (a lifted arc) is hidden when the ray from the camera meets the sphere first
  const hidden = (X) => {
    const d = vsub(X, C), L = Math.hypot(...d), u = vmul(d, 1 / L), b = vdot(C, u), disc = b * b - (vdot(C, C) - 1);
    if (disc < 0) return false;
    const t = -b - Math.sqrt(disc);
    return t > 0 && t < L - 1e-6;
  };
  const e1 = vnrm(vcross(Ch, [0, 0, 1])), e2 = vcross(Ch, e1);
  const limbAt = (phi) => vadd(vmul(Ch, cosH), vmul(vadd(vmul(e1, Math.cos(phi)), vmul(e2, Math.sin(phi))), sinH));
  const xy = (g) => proj(v3(g.lon, g.lat)).map(r1n);
  // what assets/boom-map.js needs to cast the same rays (the night): C, the basis, the fit
  const data = [...[...C, ...fwd, ...right, ...up].map((n) => Math.round(n * 1e5) / 1e5), ...[S, TX, TY].map(r1n)];
  return { C, fwd, right, up, S, TX, TY, raw, proj, seen, onLimb, clampProj, hidden, limbAt, xy, data, W, H };
}
// finite, in the band of Europe the camera faces, and well inside the
// horizon (a desk on the curve would be a sliver no one can tap)
export function validGeo(g) {
  if (!geoOk(g)) return false;
  if (g.lat < 35 || g.lat > 60 || g.lon < -11 || g.lon > 30) return false;
  return vdot(v3(g.lon, g.lat), vmul(v3(HZ_CAM.lon, HZ_CAM.lat), HZ_CAM.dist)) >= 1.04;
}

// ── 2-D helpers: clip, simplify, area, cubic fit (also used by
// design/pages-deco/genera-europa.mjs, in degrees) ──
export function clipRect(ring, [xmin, ymin, xmax, ymax]) {
  const edges = [
    [(p) => p[0] >= xmin, (a, b) => [xmin, a[1] + (b[1] - a[1]) * (xmin - a[0]) / (b[0] - a[0])]],
    [(p) => p[0] <= xmax, (a, b) => [xmax, a[1] + (b[1] - a[1]) * (xmax - a[0]) / (b[0] - a[0])]],
    [(p) => p[1] >= ymin, (a, b) => [a[0] + (b[0] - a[0]) * (ymin - a[1]) / (b[1] - a[1]), ymin]],
    [(p) => p[1] <= ymax, (a, b) => [a[0] + (b[0] - a[0]) * (ymax - a[1]) / (b[1] - a[1]), ymax]]
  ];
  let out = ring;
  for (const [inside, cut] of edges) {
    if (!out.length) break;
    const inp = out; out = [];
    for (let i = 0; i < inp.length; i++) {
      const a = inp[(i + inp.length - 1) % inp.length], b = inp[i];
      if (inside(b)) { if (!inside(a)) out.push(cut(a, b)); out.push(b); } else if (inside(a)) out.push(cut(a, b));
    }
  }
  return out;
}
const segGap = (p, a, b) => {
  const dx = b[0] - a[0], dy = b[1] - a[1], L = dx * dx + dy * dy;
  const t = L ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / L)) : 0;
  return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy);
};
function dpLine(pts, eps) {
  if (pts.length < 3) return pts.slice();
  const keep = new Uint8Array(pts.length); keep[0] = keep[pts.length - 1] = 1;
  const st = [[0, pts.length - 1]];
  while (st.length) {
    const [i, j] = st.pop(); let m = -1, d = eps;
    for (let k = i + 1; k < j; k++) { const e = segGap(pts[k], pts[i], pts[j]); if (e > d) { d = e; m = k; } }
    if (m > 0) { keep[m] = 1; st.push([i, m], [m, j]); }
  }
  return pts.filter((_, k) => keep[k]);
}
// a closed ring: two anchors (the first point and the one farthest from it)
export function dpRing(ring, eps) {
  if (ring.length < 4) return ring.slice();
  let far = 0, fd = -1;
  ring.forEach((p, k) => { const d = Math.hypot(p[0] - ring[0][0], p[1] - ring[0][1]); if (d > fd) { fd = d; far = k; } });
  const a = dpLine(ring.slice(0, far + 1), eps), b = dpLine([...ring.slice(far), ring[0]], eps);
  return [...a, ...b.slice(1, -1)];
}
export const ringArea = (r) => r.reduce((s, a, i) => { const b = r[(i + 1) % r.length]; return s + a[0] * b[1] - b[0] * a[1]; }, 0) / 2;
// A polyline as cubic Béziers (Schneider): fixed ends, end tangents from the
// polyline, split where the error is worst. [[p0, c1, c2, p3], …]
export const bezAt = (P, t) => { const u = 1 - t; return [0, 1].map((i) => u * u * u * P[0][i] + 3 * u * u * t * P[1][i] + 3 * u * t * t * P[2][i] + t * t * t * P[3][i]); };
const d2 = { s: (a, b) => [a[0] - b[0], a[1] - b[1]], a: (a, b) => [a[0] + b[0], a[1] + b[1]], m: (a, k) => [a[0] * k, a[1] * k], d: (a, b) => a[0] * b[0] + a[1] * b[1] };
const unit2 = (a) => { const L = Math.hypot(a[0], a[1]) || 1; return [a[0] / L, a[1] / L]; };
function fitOne(pts, t1, t2, u) {
  const p0 = pts[0], p3 = pts[pts.length - 1];
  let c00 = 0, c01 = 0, c11 = 0, x0 = 0, x1 = 0;
  pts.forEach((p, i) => {
    const t = u[i], s = 1 - t, b0 = s * s * s, b1 = 3 * s * s * t, b2 = 3 * s * t * t, b3 = t * t * t;
    const A1 = d2.m(t1, b1), A2 = d2.m(t2, b2), tmp = d2.s(p, d2.a(d2.m(p0, b0 + b1), d2.m(p3, b2 + b3)));
    c00 += d2.d(A1, A1); c01 += d2.d(A1, A2); c11 += d2.d(A2, A2); x0 += d2.d(A1, tmp); x1 += d2.d(A2, tmp);
  });
  const det = c00 * c11 - c01 * c01, seg = Math.hypot(...d2.s(p3, p0));
  let a1 = det ? (x0 * c11 - x1 * c01) / det : 0, a2 = det ? (c00 * x1 - c01 * x0) / det : 0;
  if (!(a1 > 1e-6 * seg) || !(a2 > 1e-6 * seg)) a1 = a2 = seg / 3;
  return [p0, d2.a(p0, d2.m(t1, a1)), d2.a(p3, d2.m(t2, a2)), p3];
}
function reparam(P, pts, u) {
  return u.map((t, i) => {
    const s = 1 - t, q = d2.s(bezAt(P, t), pts[i]);
    const D1 = [0, 1].map((k) => 3 * s * s * (P[1][k] - P[0][k]) + 6 * s * t * (P[2][k] - P[1][k]) + 3 * t * t * (P[3][k] - P[2][k]));
    const D2 = [0, 1].map((k) => 6 * s * (P[2][k] - 2 * P[1][k] + P[0][k]) + 6 * t * (P[3][k] - 2 * P[2][k] + P[1][k]));
    const den = d2.d(D1, D1) + d2.d(q, D2);
    return Math.max(0, Math.min(1, den ? t - d2.d(q, D1) / den : t));
  });
}
export function fitCubic(pts, tol = 0.5, t1 = null, t2 = null, depth = 0) {
  const n = pts.length;
  t1 = t1 || unit2(d2.s(pts[Math.min(2, n - 1)], pts[0]));
  t2 = t2 || unit2(d2.s(pts[Math.max(n - 3, 0)], pts[n - 1]));
  const len = [0]; for (let i = 1; i < n; i++) len.push(len[i - 1] + Math.hypot(...d2.s(pts[i], pts[i - 1])));
  let u = len.map((x) => x / (len[n - 1] || 1)), P = fitOne(pts, t1, t2, u);
  for (let it = 0; it < 6; it++) { u = reparam(P, pts, u); P = fitOne(pts, t1, t2, u); }
  let worst = 0, wi = 0;
  pts.forEach((p, i) => { const e = Math.hypot(...d2.s(bezAt(P, u[i]), p)); if (e > worst) { worst = e; wi = i; } });
  if (worst <= tol || n < 8 || depth > 4) return [P];
  wi = Math.max(3, Math.min(n - 4, wi));
  const tm = unit2(d2.s(pts[wi + 1], pts[wi - 1]));
  return [...fitCubic(pts.slice(0, wi + 1), tol, t1, d2.m(tm, -1), depth + 1), ...fitCubic(pts.slice(wi), tol, tm, t2, depth + 1)];
}
// the cubics as drawn (one decimal), and read back from a `d` (the checks read what is drawn)
export const cubicD = (segs) => 'M' + segs[0][0].map(r1n).join(' ') + segs.map((s) => 'C' + [s[1], s[2], s[3]].map((p) => p.map(r1n).join(' ')).join(' ')).join('');
export function hzPathPts(d, n = 40) {
  const num = [...String(d).matchAll(/-?\d+(?:\.\d+)?/g)].map((m) => +m[0]);
  if (!/^M[^MLQZ]*C/.test(d) || (num.length - 2) % 6) return [];
  const out = [];
  let p = [num[0], num[1]];
  for (let i = 2; i < num.length; i += 6) {
    const P = [p, [num[i], num[i + 1]], [num[i + 2], num[i + 3]], [num[i + 4], num[i + 5]]];
    for (let k = out.length ? 1 : 0; k <= n; k++) out.push(bezAt(P, k / n));
    p = P[3];
  }
  return out;
}
const drawnPts = (segs, n = 40) => hzPathPts(cubicD(segs), n);

// THE ARCS: a great circle from Rome LIFTED off the ground, the height
// proportional to the distance (lift × angle × sin πt), so the long arcs
// rise higher and, seen from the south, clear the desks they pass over. The
// lift (and, only if no pure lift works, a lean to one side) is SEARCHED,
// shortest arc first, over every desk with coordinates (so an arc is the same
// on every page): the first whose DRAWN curve passes no other desk's dot
// closer than ARC_ME_R + ARC_CLEAR (any desk is "this desk", with its 10px
// ring, on its own page), stays in the frame, is not hidden by the globe and
// does not run along an arc already drawn. A desk no arc can serve is a build
// error, never an arc through a sister.
export const ARC_CLEAR = 6;
export const ARC_DOT_R = 3, ARC_ME_R = 10;
export const HZ_LIFT = [0.22, 0.2, 0.24, 0.26, 0.18, 0.3, 0.16, 0.36, 0.14, 0.4, 0.12], HZ_LEAN = [0, 0.3, -0.3, 0.6, -0.6, 0.9, -0.9];
export function hzLifted(cam, from, to, lift, lean, n = 64) {
  const R = v3(from.lon, from.lat), B = v3(to.lon, to.lat), ang = Math.acos(Math.min(1, vdot(R, B))), s = Math.sin(ang);
  if (!(s > 1e-6)) return null;
  const nn = vnrm(vcross(R, B)), out = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n, v = vadd(vmul(R, Math.sin((1 - t) * ang) / s), vmul(B, Math.sin(t * ang) / s));
    const X = vadd(v, vmul(vadd(vmul(v, Math.cos(lean)), vmul(nn, Math.sin(lean))), lift * ang * Math.sin(Math.PI * t)));
    if (cam.hidden(X)) return null;
    const p = cam.proj(X);
    if (!p) return null;
    out.push(p);
  }
  return out;
}
const gapTo = (pts, [x, y]) => Math.min(...pts.map(([a, b]) => Math.hypot(a - x, b - y)));
// ONE lift for the whole map (the height stays proportional to the distance
// on every arc), the first of HZ_LIFT that serves every desk; each arc may
// lean to one side (HZ_LEAN, upright first). Only if no single lift serves
// them all does each arc take its own (a warning, never an arc through a sister).
function hzArcsWith(cam, rome, dests, lifts) {
  const hub = cam.xy(rome), R = v3(rome.lon, rome.lat);
  const at = new Map(dests.map(([k, g]) => [k, cam.xy(g)]));
  const away = (p) => Math.hypot(p[0] - hub[0], p[1] - hub[1]) > 36;
  const drawn = [], arcs = new Map();
  const order = [...dests].sort((a, b) => vdot(R, v3(b[1].lon, b[1].lat)) - vdot(R, v3(a[1].lon, a[1].lat)) || a[0].localeCompare(b[0]));
  for (const [key, g] of order) {
    let pick = null;
    for (const lean of HZ_LEAN) {
      for (const lift of lifts) {
        const raw = hzLifted(cam, rome, g, lift, lean);
        if (!raw) continue;
        const segs = fitCubic(raw, 0.5), pts = drawnPts(segs, 60);
        if (pts.some(([x, y]) => x < 4 || x > cam.W - 4 || y < 4 || y > cam.H - 4)) continue;
        if ([...at].some(([k, xy]) => k !== key && gapTo(pts, xy) < ARC_ME_R + ARC_CLEAR + 0.5)) continue;
        const out = pts.filter(away);
        if (!drawn.every((o) => out.filter((p) => gapTo(o, p) < 8).length <= 0.12 * out.length)) continue;
        pick = { key, lift, lean, segs, d: cubicD(segs), pts, to: at.get(key) };
        break;
      }
      if (pick) break;
    }
    if (!pick) return { fail: key };
    arcs.set(key, pick);
    drawn.push(pick.pts.filter(away));
  }
  return { arcs };
}
export function hzArcs(cam, rome, dests /* [[KEY, geo]] */, warn = null) {
  for (const k of HZ_LIFT) { const r = hzArcsWith(cam, rome, dests, [k]); if (r.arcs) return r.arcs; }
  const r = hzArcsWith(cam, rome, dests, HZ_LIFT);
  if (!r.arcs) throw new BuildError(`network map: no bow takes the arc ROM → ${r.fail} clear of the other desks`);
  if (warn) warn('the network map: no single lift serves every desk, each arc takes its own (heights no longer exactly proportional to distance)');
  return r.arcs;
}
// what is drawn, checked: every arc ≥ ARC_CLEAR from the edge of every dot it
// does not serve. `arcs` are {key, d} (the drawn path); returns the violations.
export function hzViolations(arcs, dots) {
  const bad = [];
  for (const a of arcs) {
    const pts = hzPathPts(a.d, 60);
    for (const d of dots) {
      if (d.key === a.key) continue;
      const g = gapTo(pts, d.xy) - d.r;
      if (g < ARC_CLEAR) bad.push(`ROM → ${a.key} passes ${g.toFixed(1)}px from ${d.key}`);
    }
  }
  return bad;
}

// THE LABELS: a code beside its dot, placed once over the whole network
// (every arc, every dot) so it sits on the same side on every page. The box
// is the phone's (font 20 units, the size boom-map.css gives a map under
// 640px) joined with the desktop's (11 units, wider tracking), so neither
// overlaps another label, a dot's ring, an arc or the frame. Searched with
// backtracking; impossible is a build error.
export const HZ_FONT = { phone: { fs: 20, adv: 13 }, desk: { fs: 11, adv: 7.95 } };
const LABEL_OFF = 13;
const LABEL_SPOTS = [['e', 1, 0], ['w', -1, 0], ['ne', 0.72, -0.72], ['nw', -0.72, -0.72], ['se', 0.72, 0.72], ['sw', -0.72, 0.72], ['n', 0, -1], ['s', 0, 1]];
function labelBox(x, y, spot, wPhone, wDesk, off = LABEL_OFF) {
  const [name, ux, uy] = spot, cap = 0.72;
  const ax = x + ux * off, ay = y + uy * off;
  const anchor = ux > 0.1 ? 'start' : ux < -0.1 ? 'end' : 'middle';
  const dyEm = uy > 0.1 ? cap : uy < -0.1 ? 0 : cap / 2;
  const boxes = [[HZ_FONT.phone.fs, wPhone], [HZ_FONT.desk.fs, wDesk]].map(([fs, w]) => {
    const x0 = anchor === 'start' ? ax : anchor === 'end' ? ax - w : ax - w / 2;
    const base = ay + dyEm * fs;
    return [x0, base - cap * fs, x0 + w, base + 1];
  });
  const b = [Math.min(boxes[0][0], boxes[1][0]), Math.min(boxes[0][1], boxes[1][1]), Math.max(boxes[0][2], boxes[1][2]), Math.max(boxes[0][3], boxes[1][3])];
  return { name, x: r1n(ax), y: r1n(ay), anchor, dy: dyEm, box: b };
}
const boxHit = (a, b, pad = 2) => a[0] < b[2] + pad && b[0] < a[2] + pad && a[1] < b[3] + pad && b[1] < a[3] + pad;
const boxNearCircle = (b, [x, y], r) => Math.hypot(Math.max(b[0] - x, 0, x - b[2]), Math.max(b[1] - y, 0, y - b[3])) < r;
export function hzLabels(items /* [{key, xy, phone, desk, prefer[]}] */, dots /* [{xy, r}] */, arcPts /* [[x,y]…] */, W = HZ_W, H = HZ_H) {
  const width = (txt, f) => Math.max(0, txt.length * f.adv - (f.adv - f.fs * 0.6));
  const cands = items.map((it) => (it.prefer || LABEL_SPOTS.map((s) => s[0])).map((n) => LABEL_SPOTS.find((s) => s[0] === n))
    .map((spot) => labelBox(it.xy[0], it.xy[1], spot, width(it.phone, HZ_FONT.phone), width(it.desk, HZ_FONT.desk), it.off))
    .filter((c) => c.box[0] >= 2 && c.box[2] <= W - 2 && c.box[1] >= 2 && c.box[3] <= H - 2
      && dots.every((d) => !boxNearCircle(c.box, d.xy, d.r + 1.5))
      && !arcPts.some(([x, y]) => x > c.box[0] - 1.5 && x < c.box[2] + 1.5 && y > c.box[1] - 1.5 && y < c.box[3] + 1.5)));
  const order = items.map((_, i) => i).sort((a, b) => cands[a].length - cands[b].length || a - b);
  const pick = new Array(items.length);
  const go = (k) => {
    if (k === order.length) return true;
    const i = order[k];
    for (const c of cands[i]) {
      if (order.slice(0, k).some((j) => boxHit(pick[j].box, c.box))) continue;
      pick[i] = c;
      if (go(k + 1)) return true;
    }
    return false;
  };
  if (!go(0)) throw new BuildError(`network map: no place for the labels (${items.filter((_, i) => !cands[i].length).map((it) => it.key).join(', ') || 'they overlap each other'})`);
  return new Map(items.map((it, i) => [it.key, pick[i]]));
}
export const hzText = (p, cls, txt) => `<text class="${cls}" x="${p.x}" y="${p.y}"${p.anchor === 'start' ? '' : ` text-anchor="${p.anchor}"`}${p.dy ? ` dy="${p.dy}em"` : ''}>${txt}</text>`;

// THE SEAS: a few true names, light, at their real places, along the curve
// of their own parallel; one that would touch a label, a dot or an arc is
// left out (never moved somewhere false)
// the coast in screen units: simplified at 1.3 (the land is a 5-unit dot matrix), islands under 16 u² left out
export const HZ_COAST = { eps: 1.3, minArea: 16 };
export const HZ_SEAS = [
  { t: 'ATLANTIC OCEAN', lon: -10.5, lat: 46.5 },
  { t: 'NORTH SEA', lon: 3.2, lat: 56.2 },
  { t: 'MEDITERRANEAN SEA', lon: 5.2, lat: 38.6 },
  { t: 'BAY OF BISCAY', lon: -4.6, lat: 45.2 }
];

// The whole static model, once per set of desks (memoised: a build renders
// eight pages and the hub, the tests a hundred).
const HZ_MEMO = new Map();
export function horizon(rome, desks /* [{iata, geo, live}] */, europe = null) {
  const set = desks.filter((d) => d.iata && geoOk(d.geo)).map((d) => ({ iata: d.iata, geo: { lat: d.geo.lat, lon: d.geo.lon }, live: d.live === true }))
    .sort((a, b) => a.iata.localeCompare(b.iata));
  const key = JSON.stringify([HZ_CAM, HZ_SCALE_MAX, rome.lat, rome.lon, set, europe ? [europe.generated, (europe.rings || []).length] : 0]);
  if (HZ_MEMO.has(key)) return HZ_MEMO.get(key);
  const cam = hzCamera([...set.map((d) => d.geo), rome]);
  const W = cam.W, H = cam.H, hub = cam.xy(rome);
  const arcs = hzArcs(cam, rome, set.map((d) => [d.iata, d.geo]));
  const dotsAll = set.map((d) => ({ key: d.iata, xy: cam.xy(d.geo), r: ARC_ME_R, live: d.live }));
  const allArcPts = [...arcs.values()].flatMap((a) => a.pts);
  const labels = hzLabels([
    ...dotsAll.map((d) => ({ key: d.key, xy: d.xy, phone: d.key, desk: d.key, prefer: ['e', 'w', 'ne', 'nw', 'se', 'sw', 'n', 's'] })),
    { key: ROME_IATA, xy: hub, phone: ROME_IATA, desk: `${ROME_IATA} · HUB`, off: 20, prefer: ['e', 's', 'se', 'ne', 'n', 'w', 'sw', 'nw'] }
  ], [...dotsAll.map((d) => ({ xy: d.xy, r: d.r })), { xy: hub, r: 16 }], allArcPts, W, H);
  // the limb: the horizon circle, the run that crosses the frame, left to right
  const ring = Array.from({ length: 1440 }, (_, i) => {
    const p = cam.proj(cam.limbAt(i / 1440 * 2 * Math.PI));
    return p && p[0] > -700 && p[0] < W + 700 && p[1] > -700 && p[1] < H + 700 ? p : null;
  });
  const cut0 = ring.findIndex((p) => !p);
  const seq = cut0 < 0 ? ring : [...ring.slice(cut0), ...ring.slice(0, cut0)];
  const runs = [];
  let cur = [];
  for (const p of seq) { if (p) cur.push(p); else if (cur.length) { runs.push(cur); cur = []; } }
  if (cur.length) runs.push(cur);
  const inFrame = (r) => r.filter(([x, y]) => x >= 0 && x <= W && y >= 0 && y <= H).length;
  let limb = runs.sort((a, b) => inFrame(b) - inFrame(a))[0] || [];
  if (limb.length && limb[0][0] > limb[limb.length - 1][0]) limb = limb.reverse();
  need(limb.length > 8 && inFrame(limb) > 8, 'the Horizon map', 'the horizon does not cross the frame: the camera looks too low');
  const limbSegs = fitCubic(limb, 0.4), limbD = cubicD(limbSegs);
  const e0 = limb[0], e1 = limb[limb.length - 1];
  const earthD = `${limbD}L${r1n(e1[0])} ${H + 700}L${r1n(e0[0])} ${H + 700}Z`;
  // the graticule, every 10°, on the side that faces the camera
  const grat = [];
  const line = (f, n) => {
    let run = [];
    const flush = () => { if (run.length > 3) grat.push(cubicD(fitCubic(run, 0.6))); run = []; };
    for (let i = 0; i <= n; i++) {
      const [lon, lat] = f(i / n), X = v3(lon, lat), p = cam.seen(X) && cam.proj(X);
      if (p && p[0] > -20 && p[0] < W + 20 && p[1] > -20 && p[1] < H + 20) run.push(p); else flush();
    }
    flush();
  };
  for (let lon = -40; lon <= 60; lon += 10) line((s) => [lon, 10 + s * 78], 156);
  for (let lat = 20; lat <= 80; lat += 10) line((s) => [-60 + s * 140, lat], 280);
  // the coast: degrees (cities/_europe.json) → the camera, beyond-the-horizon
  // points laid on the limb, cut to the frame, simplified in screen units,
  // whole units, written relative (l): the shortest path that draws it
  let coastD = null;
  if (europe && Array.isArray(europe.rings) && europe.rings.length) {
    const parts = [];
    for (const flat of europe.rings) {
      const ring = [];
      for (let i = 0; i + 1 < flat.length; i += 2) { const p = cam.clampProj(v3(flat[i], flat[i + 1])); if (p) ring.push(p); }
      const c = clipRect(ring, [-6, -6, W + 6, H + 6]);
      if (c.length < 3) continue;
      const s = dpRing(c, HZ_COAST.eps).map(([x, y]) => [Math.round(x), Math.round(y)]).filter((p, i, a) => i === 0 || p[0] !== a[i - 1][0] || p[1] !== a[i - 1][1]);
      if (s.length < 3 || Math.abs(ringArea(s)) < HZ_COAST.minArea) continue;
      parts.push(`M${s[0][0]} ${s[0][1]}l` + s.slice(1).map((p, i) => { const dx = p[0] - s[i][0], dy = p[1] - s[i][1]; return `${dx}${dy < 0 ? '' : ' '}${dy}`; }).join(' ').replace(/ -/g, '-') + 'z');
    }
    coastD = parts.join('');
  }
  // the seas that fit
  const labelBoxes = [...labels.values()].map((l) => l.box);
  const seas = HZ_SEAS.map((sea) => {
    const X = v3(sea.lon, sea.lat), p = cam.seen(X) && cam.proj(X);
    if (!p) return null;
    const a = cam.proj(v3(sea.lon - 1, sea.lat)), b = cam.proj(v3(sea.lon + 1, sea.lat));
    const deg = r1n(Math.atan2(b[1] - a[1], b[0] - a[0]) / RAD);
    const w = sea.t.length * 6.6, h = 8, box = [p[0] - w / 2 - 3, p[1] - h - 3, p[0] + w / 2 + 3, p[1] + 4];
    if (box[0] < 4 || box[2] > W - 4 || box[1] < 4 || box[3] > H - 4) return null;
    if (labelBoxes.some((lb) => boxHit(lb, box, 4)) || dotsAll.some((d) => boxNearCircle(box, d.xy, d.r + 4)) || boxNearCircle(box, hub, 20)) return null;
    if (allArcPts.some(([x, y]) => x > box[0] && x < box[2] && y > box[1] && y < box[3])) return null;
    return { t: sea.t, x: r1n(p[0]), y: r1n(p[1]), deg };
  }).filter(Boolean);
  // THE CROP: the frame is cut to what is drawn — a band of sky over the limb's
  // peak (the curve and its glow), the arcs and the labels, a margin under the
  // lowest desk, label or sea name. The same coordinates on every page: only
  // the viewBox is cut, so a dot, an arc and a pin stay where they are
  const limbPk = Math.min(...limb.filter(([x]) => x >= 0 && x <= W).map(([, y]) => y));
  const ys = [...allArcPts.map(([, y]) => y), ...[...labels.values()].flatMap((l) => [l.box[1], l.box[3]]), ...dotsAll.map((d) => d.xy[1]), hub[1]];
  const top = Math.max(0, Math.floor(Math.min(limbPk - 34, Math.min(...ys) - 12)));
  const bot = Math.min(H, Math.ceil(Math.max(Math.max(...ys) + 30, ...seas.map((s) => s.y + 10))));
  const view = [0, top, W, bot - top];
  const model = { cam, W, H, hub, set, arcs, dots: dotsAll, labels, limbD, earthD, gratD: grat.join(''), coastD, seas, view };
  HZ_MEMO.set(key, model);
  return model;
}

// THE SVG, one drawing for the hub and the desks. `opts`: page ('hub' |
// 'desk'), me (this desk's IATA on a desk page), live (the IATA codes with an
// arc). The night (g.hz-nite) is EMPTY in the HTML: the terminator moves with
// the hour, so only the script draws it. What a page shows:
//   the hub — every live desk's arc lit from Rome (gradient), dots, rings;
//   a desk  — its sisters' arcs in grey and its own in gold, with its ring.
// The desks not open are hollow dots with no arc, everywhere.
export function hzSvg(m, { page, me = null, live = [], cal = {} }) {
  const hubXY = m.hub, kOf = (k) => k.toLowerCase();
  const arcs = [...m.arcs.values()].filter((a) => live.includes(a.key) || a.key === me);
  // the hub lights each live arc FROM Rome (gold at the hub, fading to white at the desk)
  const grads = page === 'hub' ? arcs.map((a) => `<linearGradient id="ga-${kOf(a.key)}" gradientUnits="userSpaceOnUse" x1="${hubXY[0]}" y1="${hubXY[1]}" x2="${a.to[0]}" y2="${a.to[1]}"><stop offset="0" stop-color="#FFD700" stop-opacity=".7"/><stop offset="1" stop-color="#fff" stop-opacity=".38"/></linearGradient>`).join('') : '';
  const path = (a, i) => page === 'hub'
    ? `<path class="arc" id="arc-${kOf(a.key)}" data-k="${kOf(a.key)}" style="--s:url(#ga-${kOf(a.key)})" pathLength="1" fill="none" d="${a.d}"/>`
    : `<path class="arc${a.key === me ? ' me' : ''}" data-k="${kOf(a.key)}" pathLength="1" fill="none" d="${a.d}"/>`;
  const ordered = [...arcs.filter((a) => a.key !== me), ...arcs.filter((a) => a.key === me)];
  const dot = (d) => {
    const [x, y] = d.xy, k = kOf(d.key);
    if (!d.live && d.key !== me) return `<circle class="d off" cx="${x}" cy="${y}" r="${ARC_DOT_R}" fill="none"/>`;
    const meDot = d.key === me;
    return `<g class="dk" id="hzd-${k}"><circle class="gl" cx="${x}" cy="${y}" r="15"/>`
      + (meDot ? `<circle class="d-ring" cx="${x}" cy="${y}" r="${ARC_ME_R}" fill="none"/><circle class="d me" cx="${x}" cy="${y}" r="4"/>` : `<circle class="lr" cx="${x}" cy="${y}" r="6" fill="none"/><circle class="d" cx="${x}" cy="${y}" r="${ARC_DOT_R}"/>`)
      + '</g>';
  };
  const labs = [
    ...m.dots.map((d) => hzText(m.labels.get(d.key), `m-l${!d.live && d.key !== me ? ' off' : ''}${d.key === me ? ' me' : ''}`, esc(d.key))),
    hzText(m.labels.get(ROME_IATA), 'm-l hub', page === 'hub' ? `${ROME_IATA}<tspan class="hb"> · HUB</tspan>` : ROME_IATA)
  ];
  const data = { c: m.cam.data, v: m.view, d: cal };
  return [
    `<svg class="hz" viewBox="${m.view.join(' ')}" aria-hidden="true" focusable="false">`,
    '<defs>',
    '<pattern id="hzSea" width="8" height="8" patternUnits="userSpaceOnUse"><circle cx="4" cy="4" r=".55" fill="#fff" fill-opacity=".07"/></pattern>',
    '<pattern id="hzDots" width="5" height="5" patternUnits="userSpaceOnUse"><circle cx="2.5" cy="2.5" r=".95" fill="#fff" fill-opacity=".27"/></pattern>',
    '<radialGradient id="hzEg" cx="50%" cy="115%" r="115%"><stop offset="0" stop-color="#121216"/><stop offset=".72" stop-color="#0b0b0e"/><stop offset="1" stop-color="#17171b"/></radialGradient>',
    '<radialGradient id="hzGl"><stop offset="0" stop-color="#FFD700" stop-opacity=".55"/><stop offset=".45" stop-color="#FFD700" stop-opacity=".16"/><stop offset="1" stop-color="#FFD700" stop-opacity="0"/></radialGradient>',
    `<path id="hzEarth" d="${m.earthD}"/><clipPath id="hzEc"><use href="#hzEarth"/></clipPath><path id="hzLimb" d="${m.limbD}"/>`,
    m.coastD ? `<path id="hzCoast" d="${m.coastD}"/><clipPath id="hzLc" clip-rule="evenodd"><use href="#hzCoast"/></clipPath>` : '',
    grads,
    '</defs>',
    '<use class="earth" href="#hzEarth"/>',
    `<rect class="sea" width="${m.W}" height="${m.H}" fill="url(#hzSea)" clip-path="url(#hzEc)"/>`,
    m.coastD ? `<rect class="land" width="${m.W}" height="${m.H}" fill="url(#hzDots)" clip-path="url(#hzLc)"/><use class="coast" href="#hzCoast"/>` : '',
    `<path class="grat" d="${m.gratD}"/>`,
    '<g class="hz-nite"></g>',
    '<use class="limb l3" href="#hzLimb"/><use class="limb l2" href="#hzLimb"/><use class="limb l1" href="#hzLimb"/>',
    ...m.seas.map((s) => `<text class="m-s" x="${s.x}" y="${s.y}" text-anchor="middle"${s.deg ? ` transform="rotate(${s.deg} ${s.x} ${s.y})"` : ''}>${esc(s.t)}</text>`),
    ...ordered.map(path),
    ...m.dots.map(dot),
    `<circle class="hub" cx="${hubXY[0]}" cy="${hubXY[1]}" r="5" fill="none"/><circle class="hub-r" cx="${hubXY[0]}" cy="${hubXY[1]}" r="${HUB_RING_R}" fill="none"/>${page === 'hub' ? `<circle class="hub-r r2" cx="${hubXY[0]}" cy="${hubXY[1]}" r="16" fill="none"/>` : ''}`,
    ...labs,
    '</svg>',
    `<script type="application/json" class="hz-data">${JSON.stringify(data).replace(/</g, '\\u003c')}</script>`
  ].filter(Boolean).join('');
}
// The live desks' calendar facts for the map's glow (assets/boom-map.js):
// the same calendar as the board and the Gate
// the map's key, one copy (hub and desks): the last two are facts only the
// script knows (it shows them when it has drawn them)
export const HZ_KEY = '<span><i class="k-l"></i>live desk</span><span><i class="k-o"></i>not open</span><span><i class="k-h"></i>Rome, the hub</span>'
  + '<span class="k-x" hidden><i class="k-g"></i>open now</span><span class="k-x" hidden><i class="k-n"></i>night, now</span>';
// (the defaults — Rome time, 09:00–19:00, Monday to Friday — are boom-map.js's and left out)
export const hzCal = (cities) => Object.fromEntries(cities.filter((c) => c.live === true && c.iata && c.desk).map((c) => {
  const d = c.desk, o = { h: holidayKeyOf(c.slug) };
  if (d.timeZone !== 'Europe/Rome') o.z = d.timeZone;
  if (d.hours.from !== '09:00') o.f = d.hours.from;
  if (d.hours.to !== '19:00') o.t = d.hours.to;
  if (d.days.join() !== '1,2,3,4,5') o.w = d.days;
  return [c.iata.toLowerCase(), o];
}));

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
    .map((c) => ({ label: c.city, href: `/${c.slug}`, iata: c.iata, geo: c.geo }));
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
    + (c.checkout === true ? ' ' + esc(ruleOf(c, shared)) : '')
    + upgradesOf(c).map((u) => ' ' + esc(upgradeFact(u.fromLabel, u.toLabel, u.days))).join('');
}
// THE UPGRADE CREDIT (api/_upgrade.js — a policy since 12/11/2026): on a desk
// that takes the card at the order, a paid Application Pack is credited in
// full towards Full Search — for UPGRADE_DAYS, or with no deadline where the
// server gives none (upgradeDaysOf: Berlin). DERIVED from the server's own
// paths, window and words, never typed per desk: the ticket of the plan that
// can be upgraded says it (its ✓ line), the fact sheet's Fees row and that
// plan's Offer say it with the door that applies it (the personal link), and
// the till of the plan the credit leads to points a pack holder to that link
// (upgradeTillHint) — the page's own till charges the list price. A desk that
// charges at signing, or is still opening, takes nothing at the order: no
// credit exists there and the sentences are refused.
export const upgradesOf = (c) => (c && c.checkout === true && c.mode !== 'waitlist' && !isSigning(c)
  ? upgradePathsOf(list(c, 'pricing.plans')).map((u) => ({ ...u, days: upgradeDaysOf(c.slug) })) : []);
// The fact sheet's withdrawal row (audit, 06/11): the 14 days were said only
// inside the till, to whoever opened it; "can I cancel after paying?" is
// asked before. DERIVED from the desk's mode, never typed per desk: the six
// count from payment, Paris and Berlin from the order and take nothing before
// the lease. Same three ways as the till ({online}, email, model form); no
// tick to speak of here, so "without the tick" becomes "if you did not".
// Terms §12.4, word for word: the right ends once the service is fully
// performed (CRD art. 16(a); UK CCR 2013 reg. 36) — the start-now tick says it
// at the till, the fact sheet says it too (review, 06/11)
export const WITHDRAW_END = 'Once the service is fully performed, the right to withdraw ends.';
export function withdrawalRowOf(c, contact) {
  if (c.checkout !== true) return '';
  const desk = encodeURIComponent(c.city);
  const ways = `withdraw <a class="lnk" href="${WITHDRAWAL_PATH}?desk=${desk}#online">online</a>, by email to `
    + `<a class="lnk" href="mailto:${esc(contact.email)}">${esc(contact.email)}</a> or with the `
    + `<a class="lnk" href="${WITHDRAWAL_PATH}?desk=${desk}">model withdrawal form</a>.`;
  return isSigning(c)
    ? `<b>14 days from your order</b>: ${ways} Nothing is charged before you sign a lease, so withdrawing before then costs nothing. Unless you ask us to start sooner, we start when the 14 days end. ${WITHDRAW_END}`
    : `<b>14 days from payment</b>: ${ways} If you asked us to start and then withdraw, we refund the price minus the work already done. If you did not, we start when the 14 days end. ${WITHDRAW_END}`;
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
// v1.8 — WHEN a desk charges, from the server's registry (CITY_MARKETS.<slug>.chargeAt), read like the
// currency: 'checkout' (the six: Stripe takes the fee at the till) or 'signing' (the till takes the ORDER;
// the fee is invoiced when a lease is signed — loi Hoguet art. 6, WoVermRG §2). One word per desk, never
// per plan; the desk JSON repeats it ("chargeAt") and the build refuses the two apart, either way.
export function chargeAtOf(slug) {
  const m = CITY_MARKETS[slug];
  return m && m.chargeAt === 'signing' ? 'signing' : 'checkout';
}
export const isSigning = (c) => !!c && chargeAtOf(c.slug) === 'signing';
// the ✓ sentence beside the €500 of a desk that sells: the refund policy where the till takes the fee, the
// signing rule (cities/_shared.json signing.rule) where nothing is taken before the lease — a refund of a
// sum never taken is not printed there (B19)
export const ruleOf = (c, shared) => (isSigning(c) ? shared.signing.rule : shared.refund.rule);
// the rule's signature in a block that shows €500: a sentence saying nothing is charged and naming the
// signing (the signing rule, every fare's trigger); the six keep /refunded in full/ and their messages
export const SIGN_RULE_RE = /\bNothing is charged\b[^.]*\bsign/;
export const ruleReOf = (c) => (isSigning(c) ? SIGN_RULE_RE : /refunded in full/);

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
  // v1.8: a desk that charges at signing says when it is paid ("Paid only by you, and only when you sign.")
  if (isSigning(c) && /only when you sign/i.test(ls)) return 'PAID ONLY WHEN YOU SIGN';
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
// a pair member's condition in three parts ('per viewing · incl. VAT · at opening'): the closed pair breaks it after
// its first part below 600 px, so both tickets carry two lines and their stubs start on one line (v1.7, CI fonts)
const condThree = (p) => p.id !== 'full-search' && String(p.condition || '').split(' · ').length > 2;

const R = {
  // THE FARES: one row per plan, DERIVED from pricing.plans. The row is the
  // <summary> of its ticket (label · for whom · price · condition), the
  // ticket under it says what the fee buys; on a desk that sells, the
  // refund rule sits under the €500 row (closed) and inside its ticket
  // (open — the duplicate outside hides by CSS), then the slot the door
  // moves into on a phone, then the quiet pay button.
  fares: (c, shared) => {
    // v1.7 «card-S»: three tickets in the home's grammar, inside the one
    // pass. Full Search LIES DOWN (a wordless gold-leaf band, the situation as
    // a question, the name, its promise | a punched tear | the stub: the price
    // as the ticket's value, its condition, a barcode, the pip); its ✓ rule is
    // a coupon torn under it. Application Pack and Attended Viewing are an
    // economy pair (silver leaf). An open fare is the full ticket: the band
    // lit, the promise, the ✓ lines, a second tear, a darker stub with the
    // door (phones), a barcode and the quiet pay button. Same <details>, the
    // same verbatim price/condition pair; each ticket is an <li>, so the €500
    // and its rule share one block; .bp-pay is where the pay button sits on a
    // DESK while the ticket is closed (one node, moved by the page).
    // v1.8: on a desk that charges at signing the coupon under the closed €500
    // says the signing rule, and EVERY open ticket says its own fare's trigger
    // (which signing earns that fee, D4) where the six print the refund rule.
    const sell = c.checkout === true;
    const signing = isSigning(c);
    const rule = esc(ruleOf(c, shared));
    const cur = currencyOf(c.slug);
    // the upgrade credit: the ✓ line of the plan that can be upgraded (api/_upgrade.js)
    const ups = upgradesOf(c);
    const rows = list(c, 'pricing.plans').map((p) => {
      const first = p.id === 'full-search', fs0 = sell && first;
      const up = ups.find((u) => u.from === p.id);
      const cond = esc(p.condition).replace(' · incl. VAT', ' ·<br> incl. VAT');
      const c3 = condThree(p);  // a three-part condition breaks after its first part in the closed pair (boom-city.css)
      return [
        `        <li class="bp${first ? ' eroe' : ''}">`,
        `        <details class="fare" name="fare" id="fare-${esc(p.id)}" data-plan="${esc(p.id)}"${fs0 ? ' data-fs' : ''}>`,
        '          <summary>',
        `            <span class="f-l"><b class="f-name">${esc(p.label)}</b><span class="f-when">${esc(p.when)}</span>${first ? `<span class="f-say">${esc(p.name)}</span>` : ''}</span>`,
        `            <span class="f-r"><span class="f-price" data-plan-price="${esc(p.id)}">${money(p.price, cur)}</span><span class="f-cond${c3 ? ' f-c3' : ''}">${cond}</span>${first ? '<i class="bars" aria-hidden="true"></i>' : ''}<i class="f-tog" aria-hidden="true"></i></span>`,
        '          </summary>',
        '          <div class="tk">',
        first ? '' : `            <p class="tk-tag">${esc(p.name)}</p>`,
        `            <ul class="tk-inc">${p.includes.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>`,
        signing ? `            <p class="refund">${esc(p.trigger)}</p>` : fs0 ? `            <p class="refund">${rule}</p>` : up ? `            <p class="refund">${esc(upgradeLine(up.toLabel, up.days))}</p>` : '',
        '            <div class="tk-stub">',
        '            <div class="tk-slot" data-slot></div>',
        '            <i class="bars" aria-hidden="true"></i>',
        sell ? `            <button class="pay2 js" type="button" data-pay="${esc(p.id)}"><span>${esc(c.till.label)} · ${money(p.price, cur)}</span><span class="ar" aria-hidden="true">→</span></button>` : '',
        '            </div>',
        '          </div>',
        '        </details>',
        fs0 ? `        <p class="refund fs">${rule}</p>` : '',
        fs0 ? '        <span class="bp-pay"></span>' : '',
        '        </li>'
      ].filter(Boolean).join('\n');
    });
    return [
      `      <div class="fares${c.mode === 'waitlist' ? ' long' : ''}" id="fares" role="group" aria-labelledby="faresH">`,
      `        <p class="fares-h"><b id="faresH">${esc(c.hero.faresHead.b)}</b><span>${esc(c.hero.faresHead.span)}</span></p>`,
      '        <ol class="bps">',
      ...rows,
      '        </ol>',
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
    if (sell && isSigning(c)) {
      // v1.8 — a desk that charges at signing takes an ORDER, never a payment.
      // BOOKED (D9) is its own card and its own stamp, never the PAID card:
      // nothing has been paid. Only the server's answer (the till's POST, or
      // the managed view the email opens) shows it; while the page waits for
      // that word it says the order is being confirmed — never "Payment".
      const mail = MAIL(contact), b = k.booked;
      out.push(
        '',
        `          <div id="cConfirm" class="card reveal" tabindex="-1" hidden data-unconfirmed="${esc(b.unconfirmed)}">`,
        '            <p class="k">Order</p>',
        `            <h2 id="cText">${esc(b.pending)}</h2>`,
        `            <p>Questions? ${mail}</p>`,
        '          </div>',
        '',
        '          <div id="cBooked" class="card reveal" tabindex="-1" hidden>',
        `            ${R.stamp(c, 'booked')}`,
        '            <p class="k">Booked</p>',
        `            <h2>${esc(b.before)} <em>${esc(b.em)}</em></h2>`,
        '            <dl class="fields">',
        '              <div><dt>File</dt><dd id="bFile"></dd></div>',
        '              <div><dt>Fare</dt><dd id="bFare"></dd></div>',
        '              <div class="wide"><dt>Order</dt><dd id="bOrder"></dd></div>',
        '              <div class="wide"><dt>Starts</dt><dd id="bStart"></dd></div>',
        '            </dl>',
        `            <ul class="next" id="bNext">${b.next.map(([x, y]) => `<li><b>${esc(x)}</b> ${esc(y)}</li>`).join('')}</ul>`,
        `            <p id="bText">${esc(b.text)} ${mail}.</p>`,
        `            <p id="bWait" hidden>${esc(b.wait).replace('{email}', mail)}</p>`,
        '          </div>'
      );
    } else if (sell) {
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
  // v1.8: the BOOKED card of a desk that charges at signing has its own word;
  // .st-w is 15 px (boom-city.css), so a word longer than four letters is
  // fitted to 50 units, inside the dashed inner ring (r 29).
  stamp: (c, kind) => {
    const word = kind === 'paid' ? 'PAID' : kind === 'booked' ? 'BOOKED' : 'OPEN';
    const ring = `${word === 'OPEN' ? 'FILE OPEN' : word} · BOOM ${upperCity(c)} · TENANT SIDE · `;
    return `<span class="stamp" aria-hidden="true"><svg viewBox="0 0 92 92" width="84" height="84" focusable="false"><circle class="st-o" cx="46" cy="46" r="44" fill="none"/><circle class="st-i" cx="46" cy="46" r="29" fill="none"/>`
      + `<text class="st-t"><textPath href="#stampArc" textLength="222" lengthAdjust="spacing">${esc(ring)}</textPath></text>`
      + `<text class="st-w" x="46" y="50.5" text-anchor="middle"${word.length > 4 ? ' textLength="50" lengthAdjust="spacingAndGlyphs"' : ''}>${word}</text></svg></span>`;
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
    // v1.7 THE HORIZON: the same drawing as the hub (one camera over every
    // desk, so a dot, an arc and a label are the same on every page), now
    // shown on a phone too; this desk's arc in gold, its sisters' in grey,
    // the desks not open as hollow dots with no arc
    const all = cities.some((x) => x.slug === c.slug) ? cities : [...cities, c];
    const m = horizon(shared.rome.geo, all, europe);
    const others = cities.filter((x) => x.slug !== c.slug && x.iata && x.geo).sort((a, b) => a.slug.localeCompare(b.slug));
    const liveSis = others.filter((x) => x.live === true), offSis = others.filter((x) => x.live !== true);
    const bad = hzViolations([...m.arcs.values()].filter((a) => a.key === c.iata || liveSis.some((x) => x.iata === a.key)),
      [...liveSis.map((x) => ({ key: x.iata, xy: m.cam.xy(x.geo), r: ARC_DOT_R })), ...offSis.map((x) => ({ key: x.iata, xy: m.cam.xy(x.geo), r: ARC_DOT_R })), { key: c.iata, xy: m.cam.xy(c.geo), r: ARC_ME_R }]);
    need(!bad.length, `cities/${c.slug}.json`, `the network map draws an arc over a desk: ${bad.join('; ')}`);
    const svg = hzSvg(m, { page: 'desk', me: c.iata, live: liveSis.map((x) => x.iata), cal: hzCal([...liveSis, ...(c.live === true ? [c] : [])]) });
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
      `        <p class="net-k" aria-hidden="true">${HZ_KEY}</p>`,
      '        <ul class="net">',
      ...items,
      '        </ul>',
      '      </div>'
    ].join('\n');
  },

  // The fact sheet: the fees row is DERIVED from the plans (with each plan's
  // own condition and, on a sell desk, the refund rule) and the contact row
  // from _shared.json, so the quotable ledger cannot drift from the page.
  // A desk that sells adds the Withdrawal row right after the fees: the
  // money, then how to take it back (withdrawalRowOf).
  bref: (c, shared, pageUrl, contact = shared.contact) => list(c, 'bref.rows').flatMap((r) => {
    let dd = r.ddHtml || '';
    if (r.fees) dd = feesRowOf(c, shared, dd);
    // the reply promise names the clock it runs on, from desk.hours (never
    // typed in the JSON: "the same working day" said nothing of whose day)
    if (r.hours) dd = `${dd.replace(/\.\s*$/, '')} (desk hours: ${esc(deskHoursText(c.desk))}).`;
    if (r.contact) {
      const k = contact;
      dd = `<a class="lnk" href="mailto:${esc(k.email)}">${esc(k.email)}</a> · <a class="lnk" href="${esc(waHref(k, c.city))}">WhatsApp ${esc(k.phoneDisplay)}</a>`
        + ` · <a class="lnk" href="${esc(pageUrl)}">${esc(pageUrl.replace(/^https:\/\/(www\.)?/, ''))}</a>`;
    }
    need(dd, `cities/${c.slug}.json`, `bref row "${r.dt}" has no content`);
    const row = `          <dt>${esc(r.dt)}</dt><dd>${dd}</dd>`;
    const wd = r.fees ? withdrawalRowOf(c, contact) : '';
    return wd ? [row, `          <dt>Withdrawal</dt><dd>${wd}</dd>`] : [row];
  }).join('\n'),

  // §D THE FOOTER: the statement under the mark, then three columns — this
  // desk (contacts and hours), legal (terms, privacy — the cookie link is
  // cloned next to it by boom-consent.js — and, where the desk sells, the
  // online withdrawal function under its statutory label, v1.8 stage W; the
  // model form stays on that page, below it), the company. The sister desks
  // moved to Network.
  foot: (c, shared, contact, deskLineHtml) => {
    const e = shared.entity;
    const operator = String(e.legalName).replace(/\s+S\.r\.l\.?$/i, '').toUpperCase();
    return [
      '    <footer class="foot">',
      `      <div class="f-top"><svg aria-hidden="true"><use href="#boomMark"/></svg><b>BOOM ${esc(c.city)}</b><p class="stmt">${esc(c.footer.statement)}</p></div>`,
      '      <div class="f-grid">',
      `        <nav aria-label="This desk"><h3>This desk</h3> <a href="mailto:${esc(contact.email)}">${esc(contact.email)}</a> <a href="tel:+${esc(contact.whatsapp)}">${esc(contact.phoneDisplay)}</a> <a href="${esc(contact.waHref)}" target="_blank" rel="noopener">WhatsApp</a> <p>${deskLineHtml}</p></nav>`,
      `        <nav aria-label="Legal"><h3>Legal</h3> <a href="${TERMS_PATH}">Terms</a> <a href="/privacy">Privacy</a>${c.checkout === true ? ` <a href="${WITHDRAWAL_PATH}?desk=${encodeURIComponent(c.city)}#online">${WITHDRAW_LABEL}</a>` : ''}</nav>`,
      `        <div class="f-co"><h3>Company</h3><p><a href="/buy-property-europe">Buy property</a></p><p>${esc(e.legalName)}</p><p>${esc(e.address)}</p><p>Registered office: ${esc(e.registeredOffice)}</p><p>P.IVA ${esc(e.vat)} · REA ${esc(e.rea)}</p></div>`,
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
    // v1.8: a desk that charges at signing has ONE label (the tick changes
    // the sub-line, never the obligation, D6), says its fare's trigger in the
    // ✓ line (the page fills it per plan from PLANS[id].trigger; served: Full
    // Search's) and how long the order runs before the button (CRD art. 8(2));
    // its 409 terms_changed has its own words (data-err-stale)
    const signing = isSigning(c);
    const labelWait = signing ? c.till.label : c.till.labelWait;
    // {online}: the online withdrawal function (Dir. 2023/2673 art. 11a): every
    // selling desk carries the token from stage W (the build refuses one without)
    const wd = esc(k.withdrawal)
      .replace('{email}', MAIL(contact))
      .replace('{online}', `<a class="lnk" href="${WITHDRAWAL_PATH}?desk=${encodeURIComponent(c.city)}#online" target="_blank" rel="noopener">online</a>`)
      .replace('{form}', `<a class="lnk" href="${WITHDRAWAL_PATH}?desk=${encodeURIComponent(c.city)}" target="_blank" rel="noopener">model withdrawal form</a>`);
    return [
      `<dialog class="till" id="till" aria-labelledby="tTitle" data-err-name="${esc(k.errors.name)}" data-err-email="${esc(k.errors.email)}" data-err-net="${esc(k.errors.net)}"${signing ? ` data-err-stale="${esc(k.errors.stale)}"` : ''}>`,
      '  <form class="tf" id="tillForm" novalidate action="#" data-analytics-manual data-analytics-kind="checkout" data-analytics-label="Till">',
      '    <button class="x" type="button" id="tillX" aria-label="Close">×</button>',
      `    <p class="k">Fare · BOOM ${esc(c.city)}</p>`,
      '    <div class="t-head"><h2 id="tTitle" tabindex="-1"></h2><p class="t-price"><b id="tPrice"></b><span id="tCond"></span></p></div>',
      '    <p class="t-tag" id="tTag"></p>',
      '    <ul class="t-inc" id="tInc"></ul>',
      `    <p class="refund" id="tRule" hidden>${esc(signing ? list(c, 'pricing.plans')[0].trigger : ruleOf(c, shared))}</p>`,
      // a pack holder who opens the till of the plan a credit leads to: the door that applies it (boom-city.js shows it on that plan only)
      ...upgradesOf(c).slice(0, 1).map((u) => `    <p class="t-up" id="tUp" hidden>${esc(upgradeTillHint(u.fromLabel))}</p>`),
      signing ? `    <p class="t-order" id="tOrder">${esc(k.order)}</p>` : '',
      c.pricing.sub ? `    <p class="t-opt">${esc(c.pricing.sub)}</p>` : '',
      `    <div class="fld"><label for="tName">${esc(f.name.label)}</label><input id="tName" autocomplete="name" placeholder="${esc(f.name.placeholder)}" aria-describedby="tNameErr"><p class="err" id="tNameErr" aria-live="polite"></p></div>`,
      '    <div class="fld"><label for="tEmail">Email <i>— the invoice and your file go there</i></label><input id="tEmail" type="email" autocomplete="email" inputmode="email" placeholder="anna@company.com" aria-describedby="tEmailErr"><p class="err" id="tEmailErr" aria-live="polite"></p></div>',
      `    <div class="fld"><label for="tNote">${esc(k.noteLabel)} <i>(optional)</i></label><input id="tNote" placeholder="${esc(k.notePlaceholder)}"></div>`,
      '    <input class="hp" id="tCompany" tabindex="-1" autocomplete="off" aria-hidden="true">',
      `    <label class="tick"><input type="checkbox" id="tStart"><span>${esc(k.startNow)}</span></label>`,
      `    <p class="wd">${wd}</p>`,
      '    <p class="err" id="tErr" role="alert"></p>',
      `    <button class="pay" id="tGo" type="submit" data-label-now="${esc(c.till.label)}" data-label-wait="${esc(labelWait)}" data-sub-now="${esc(k.btnSubNow)}" data-sub-wait="${esc(k.btnSubWait)}"><span><b id="tGoL">${esc(labelWait)}</b><small id="tGoS">${esc(k.btnSubWait)}</small></span><span class="ar" aria-hidden="true">→</span></button>`,
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
    // the desk hours in words, zone named: hoursAvailable has no time zone in
    // schema.org, so "09:00" alone did not say whose 09:00 (audit 06/11)
    description: c.service.description + (dont ? " What we don't do: " + dont.replace(/<[^>]+>/g, '') : '') + ` Desk hours: ${deskHoursText(c.desk)}.`, provider: { '@id': orgId },
    areaServed: { '@type': 'City', name: c.city },
    audience: { '@type': 'Audience', audienceType: c.service.audience },
    hoursAvailable: { '@type': 'OpeningHoursSpecification', dayOfWeek: c.desk.days.map((d) => DAY_NAMES[d]), opens: c.desk.hours.from, closes: c.desk.hours.to },
    availableChannel: { '@type': 'ServiceChannel', serviceUrl: pageUrl, availableLanguage: String(c.country).toUpperCase() === 'IT' ? ['en', 'it'] : 'en' }, url: pageUrl,
    // InStock where the desk takes searches, PreOrder where it opens
    // later — a list price whose Offer says in words when it is charged.
    // VAT is included on the page: the price specification states it.
    // v1.8: a desk that charges at signing sells TODAY (the order is taken
    // now, the fee invoiced at signing): InStock, never PreOrder, and every
    // Offer carries the signing rule (it holds for every fare there), where
    // the six carry the refund rule on Full Search alone.
    offers: c.pricing.plans.map((p) => {
      const unitWord = p.unit ? p.unit.replace(/^per\s+/i, '').trim() : '';
      return {
        '@type': 'Offer', name: p.label, price: String(p.price), priceCurrency: currencyOf(c.slug),
        availability: waitlist && !isSigning(c) ? 'https://schema.org/PreOrder' : 'https://schema.org/InStock',
        description: p.offerDescription + (p.unit ? ' Priced ' + p.unit + '.' : '') + ' ' + p.conditionLong
          + (c.checkout === true && (isSigning(c) || p.id === 'full-search') ? ' ' + ruleOf(c, shared) : '')
          // the upgrade credit, on the Offer of the plan it starts from
          + upgradesOf(c).filter((u) => u.from === p.id).map((u) => ' ' + upgradeFact(u.fromLabel, u.toLabel, u.days)).join(''),
        priceSpecification: { '@type': 'UnitPriceSpecification', price: String(p.price), priceCurrency: currencyOf(c.slug), valueAddedTaxIncluded: true,
          ...(unitWord ? { unitText: unitWord, referenceQuantity: { '@type': 'QuantitativeValue', value: 1, unitText: unitWord } } : {}) },
        url: pageUrl + '#fare-' + p.id,
        seller: { '@id': orgId },
        // the service it sells, by name: the "For: Haven't started yet." the
        // fare's situation question printed here read as a definition (audit 06/11)
        itemOffered: { '@type': 'Service', name: p.label }
      };
    })
  };
}
// The page's English, by country: London is British English (og:locale
// en_GB, inLanguage en-GB); the other desks stay en_US / en. Derived, never a
// JSON key: hreflang is untouched (one file per desk, no alternates).
export const isGB = (c) => String(c.country || '').toUpperCase() === 'GB';
export const ogLocaleOf = (c) => (isGB(c) ? 'en_GB' : 'en_US');
export const inLanguageOf = (c) => (isGB(c) ? 'en-GB' : 'en');
function jsonLd(c, shared, pageUrl, ogImage, cities = [c]) {
  const site = shared.siteUrl;
  const orgId = site + '/#organization';
  return {
    '@context': 'https://schema.org',
    '@graph': [
      orgNode(shared, cities),
      {
        '@type': 'WebPage', '@id': pageUrl + '#page', url: pageUrl, name: c.meta.ogTitle, description: c.meta.description, inLanguage: inLanguageOf(c),
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
        '@type': 'FAQPage', '@id': pageUrl + '#faq', isPartOf: { '@id': pageUrl + '#page' }, inLanguage: inLanguageOf(c),
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

// ══ STAGE 0 (04/11/2026) — THE SERVED ASSETS ARE EMITTED WITHOUT THEIR COMMENTS ══
// The commented sources of the five page files live in assets/src/ (never
// deployed: .vercelignore). This build EMITS assets/<name> from each one
// with the comments stripped by stripComments(), a scanner that knows
// strings, template literals, regex literals and url(): CSS loses its
// /* … */ blocks outside quotes; JS loses the /* … */ blocks that BEGIN a
// line and the lines that are only a // comment — a // mid-line
// ('https://' included) and a block mid-line are never touched, nor is
// anything inside a literal. Then four or more newlines between tokens
// (three blank lines) fold to two. Everything else is byte-identical, and
// the stripper REFUSES (a BuildError) when it loses sync — an unterminated
// string, comment, url( or ${ — or when it dropped anything that is not
// comment-shaped; a stripped JS that does not compile is refused too
// (vm.Script is node --check in process). The ?v= hashes are those of the
// EMITTED files, the weights are measured on the served files; a served
// copy that is not its source minus the comments is stale and --check
// names it. The bytes saved (≈2.7 KB of CSS and 3.8 KB of JS gzipped on a
// desk page) are the room v1.7 builds in: the caps do not move. Edit
// assets/src/, never assets/.
export const SERVED_ASSETS = [
  { name: 'boom-city.css', kind: 'css', of: 'desk' },
  { name: 'boom-city.js', kind: 'js', of: 'desk' },
  { name: 'boom-onda.js', kind: 'js', of: 'desk' },
  { name: 'boom-map.js', kind: 'js', of: 'desk' },
  { name: 'boom-desks.css', kind: 'css', of: 'hub' },
  { name: 'boom-desks.js', kind: 'js', of: 'hub' }
];
// after these words a / opens a regex literal, not a division
const REGEX_AFTER = new Set(['return', 'typeof', 'instanceof', 'in', 'of', 'new', 'delete', 'void', 'throw', 'case', 'do', 'else', 'yield', 'await']);
// One pass over src. strip=true drops the comments (whole lines go with their
// newline); strip=false drops nothing but folds runs of ≥4 newlines between
// tokens to two. Returns the text and what was dropped, for the structural
// check in stripComments (only whitespace and comment-shaped text may go).
function scanSource(src, kind, strip) {
  const n = src.length, out = [], removed = [];
  let from = 0;
  const lineOf = (at) => src.slice(0, at).split('\n').length;
  const fail = (what, at) => { throw new BuildError(`stripComments(${kind}): ${what} at line ${lineOf(at)} — the stripper is not safe on this file; shorten its comments by hand instead`); };
  const ws = (c) => c === ' ' || c === '\t' || c === '\r';
  const word = (c) => /[A-Za-z0-9_$]/.test(c);
  // the start of i's line when only blanks precede i on it, else -1
  const bol = (i) => { let j = i; while (j > 0 && ws(src[j - 1])) j--; return j === 0 || src[j - 1] === '\n' ? j : -1; };
  // the index after the newline when only blanks follow i on its line (n at the end of the file), else -1
  const eol = (i) => { let j = i; while (j < n && ws(src[j])) j++; return j >= n ? n : src[j] === '\n' ? j + 1 : -1; };
  const drop = (a, b, put = '') => { const s = Math.max(from, a); out.push(src.slice(from, s), put); removed.push(src.slice(s, b)); from = b; };
  const str = (i, q) => { for (let j = i + 1; j < n; j++) { if (src[j] === '\\') { j++; continue; } if (src[j] === q) return j + 1; if (src[j] === '\n') break; } return fail('unterminated string', i); };
  const block = (i) => {
    const e = src.indexOf('*/', i + 2); if (e < 0) fail('unterminated comment', i);
    const end = e + 2, a = bol(i), b = eol(end);
    if (!strip || (kind === 'js' && a < 0)) return end;                               // kept (a JS block mid-line always is)
    if (a >= 0 && b >= 0) drop(a, b);                                                 // whole line(s): gone with their newline
    else if (a >= 0) { let k = end; while (k < n && ws(src[k])) k++; drop(i, k); }     // code follows on the line: it keeps the indent
    else { let k = i; if (b >= 0) while (k > 0 && ws(src[k - 1])) k--; drop(k, end); } // CSS mid-line: gone, with the blanks before it when it ended the line
    return end;
  };
  const line = (i) => { let e = src.indexOf('\n', i); if (e < 0) e = n; const a = bol(i); if (strip && a >= 0) drop(a, e < n ? e + 1 : n); return e; };
  const rex = (i) => { let cls = false; for (let j = i + 1; j < n; j++) { const c = src[j]; if (c === '\\') { j++; continue; } if (c === '\n') return -1; if (cls) { if (c === ']') cls = false; } else if (c === '[') cls = true; else if (c === '/') { j++; while (j < n && /[a-z]/i.test(src[j])) j++; return j; } } return -1; };
  const tpl = (i) => { for (let j = i + 1; j < n; j++) { if (src[j] === '\\') { j++; continue; } if (src[j] === '`') return j + 1; if (src[j] === '$' && src[j + 1] === '{') j = code(j + 2, true) - 1; } return fail('unterminated template literal', i); };
  // last: null at the start, a word (identifier, number, keyword), one punctuator, or 'v' after a literal value
  const regexOk = (t) => t === null || REGEX_AFTER.has(t) || (!word(t[0]) && t !== ')' && t !== ']');
  const code = (start, inExpr) => {
    let i = start, depth = 0, last = null;
    while (i < n) {
      const c = src[i], d = src[i + 1];
      if (c === '/' && d === '*') { i = block(i); continue; }
      if (kind === 'js' && c === '/' && d === '/') { i = line(i); continue; }
      if (c === '\n') {
        let j = i, nl = 0, lastNl = i;
        while (j < n && (ws(src[j]) || src[j] === '\n')) { if (src[j] === '\n') { nl++; lastNl = j; } j++; }
        if (!strip && nl >= 4) drop(i, lastNl + 1, '\n\n');
        i = j; continue;
      }
      if (ws(c)) { i++; continue; }
      if (c === '"' || c === "'") { i = str(i, c); last = 'v'; continue; }
      if (kind === 'css') {
        if (/^url\(/i.test(src.substr(i, 4))) {                                       // an unquoted url(…) is one token: nothing in it is a comment
          let j = i + 4; while (j < n && ws(src[j])) j++;
          if (src[j] === '"' || src[j] === "'") { i = j; continue; }
          const e = src.indexOf(')', j); if (e < 0) fail('unterminated url(', i);
          i = e + 1; continue;
        }
        i++; continue;
      }
      if (c === '`') { i = tpl(i); last = 'v'; continue; }
      if (c === '/') { if (regexOk(last)) { const e = rex(i); if (e > 0) { i = e; last = 'v'; continue; } } last = '/'; i++; continue; }
      if (c === '{') { depth++; last = '{'; i++; continue; }
      if (c === '}') { if (inExpr && depth === 0) return i + 1; depth--; last = '}'; i++; continue; }
      if (word(c)) { let j = i + 1; while (j < n && word(src[j])) j++; last = src.slice(i, j); i = j; continue; }
      last = c; i++;
    }
    if (inExpr) fail('unterminated ${', start);
    return i;
  };
  code(0, false);
  out.push(src.slice(from));
  return { text: out.join(''), removed, fail };
}
export function stripComments(src, kind) {
  if (kind !== 'css' && kind !== 'js') throw new BuildError(`stripComments: kind must be "css" or "js", not "${kind}"`);
  const one = scanSource(String(src), kind, true);
  for (const r of one.removed) {
    if (!/^\s*$/.test(r) && !/^\s*\/\*[\s\S]*\*\/\s*$/.test(r) && !(kind === 'js' && /^\s*\/\/[^\n]*\n?$/.test(r))) one.fail('dropped text that is not a comment', src.indexOf(r));
  }
  const two = scanSource(one.text, kind, false);
  for (const r of two.removed) if (!/^\s*$/.test(r)) two.fail('folded text that is not blank', one.text.indexOf(r));
  return two.text;
}
const gzLen = (s) => zlib.gzipSync(Buffer.from(s), { level: 9 }).length;
const hashOf = (s) => crypto.createHash('sha256').update(s).digest('hex').slice(0, 10);
// Every served asset whose source exists: its emitted text, hash and whether
// the served copy on disk is that text. Nothing is written here.
export function emittedAssets(root = ROOT) {
  return SERVED_ASSETS.filter((a) => fs.existsSync(path.join(root, 'assets/src', a.name))).map((a) => {
    const src = `assets/src/${a.name}`, file = `assets/${a.name}`;
    const source = fs.readFileSync(path.join(root, src), 'utf8');
    const content = stripComments(source, a.kind);
    if (a.kind === 'js') {
      try { new vm.Script(content, { filename: file }); }
      catch (e) { throw new BuildError(`${src}: the stripped copy does not compile (${e.message}) — the stripper is not safe on this file; shorten its comments by hand instead`); }
    }
    const out = path.join(root, file);
    const cur = fs.existsSync(out) ? fs.readFileSync(out, 'utf8') : null;
    return { ...a, src, file, out, content, hash: hashOf(content), stale: cur !== content, written: false, gzKb: gzLen(content) / 1024, sourceGzKb: gzLen(source) / 1024 };
  });
}
// Writes the stale served copies (unless check) and reads each one back.
export function emitAssets({ root = ROOT, check = false } = {}) {
  const list = emittedAssets(root);
  if (!check) for (const a of list) if (a.stale) {
    fs.mkdirSync(path.dirname(a.out), { recursive: true });
    fs.writeFileSync(a.out, a.content);
    need(fs.readFileSync(a.out, 'utf8') === a.content, a.file, 'was not written as emitted');
    a.stale = false; a.written = true;
  }
  return list;
}
// The ?v= versions the pages link: hashes of the EMITTED text (never of the
// source, never of a served copy edited by hand). The desk pages need their
// four files (the map's script included); the hub (hub:true) needs its two as well.
function assetVersionOf(root, { hub = false } = {}) {
  const em = Object.fromEntries(emittedAssets(root).map((a) => [a.name, a]));
  for (const a of SERVED_ASSETS) if (a.of === 'desk' || hub) need(em[a.name], `assets/src/${a.name}`, `is missing: the served assets/${a.name} is emitted from it${a.name === 'boom-onda.js' ? ' — every page weighs it and boom-city.js loads it at ≥940px (v1.6 §D)' : a.of === 'hub' ? ' and the hub links it' : ''}`);
  const h = (k) => (em[k] ? em[k].hash : undefined);
  return { css: h('boom-city.css'), js: h('boom-city.js'), onda: h('boom-onda.js'), map: h('boom-map.js'), ...(em['boom-desks.css'] ? { desksCss: h('boom-desks.css') } : {}), ...(em['boom-desks.js'] ? { desksJs: h('boom-desks.js') } : {}) };
}
// the gzipped bytes of a served file, which must exist (the build emits it)
const servedGz = (root, f) => { need(fs.existsSync(path.join(root, f)), f, 'is missing: the build emits it from assets/src/ — run: npm run build:cities'); return gzLen(fs.readFileSync(path.join(root, f))); };

// The first-party bytes of a page, gzipped: the page itself and the files
// it links that every visitor downloads. The budget is a build refusal.
// v1.6: the onda canvas script (assets/boom-onda.js) is counted in the
// total, and the CSS and the onda have caps of their own.
// Stage 0: the weights are those of the SERVED files in assets/ (emitted, no comments).
// v1.7: the map's script (assets/boom-map.js, loaded on view) is counted in the
// total and capped on its own (MAP_KB).
export function weightOf(html, root = ROOT) {
  const file = (f) => servedGz(root, f);
  const js = file('assets/boom-city.js'), css = file('assets/boom-city.css'), onda = file('assets/boom-onda.js'), map = file('assets/boom-map.js');
  const total = gzLen(html) + css + js + onda + map + file('js/boom-consent.js') + file('js/boom-track.js');
  return { totalKb: total / 1024, jsKb: js / 1024, cssKb: css / 1024, ondaKb: onda / 1024, mapKb: map / 1024 };
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
// v1.8 (the third shape, a desk that charges at signing): chargeAt, every
// fare's trigger, the order line, the BOOKED card's block (in place of
// `paid`) and the stale-page error — each refused on a desk that charges at
// the till (renderCity), as `paid` is refused on a signing desk.
const ALLOWED = {
  '': ['slug', 'city', 'country', 'currency', 'chargeAt', 'iata', 'geo', 'live', 'mode', 'config', 'updated', 'word', 'meta', 'service', 'hero', 'pricing', 'stub', 'how', 'checks', 'papers', 'faq', 'bref', 'footer', 'desk', 'door', 'form', 'checkout', 'checkoutCopy', 'till'],
  geo: ['lat', 'lon'],
  // v1.6: the items of every list are key-checked too (closing the gap where
  // a step, a check or a question could carry a key nobody prints — e.g. a
  // check "verdict", a step "when")
  'how.step': ['k', 'h', 'p', 'status'],
  'checks.item': ['id', 'title', 'at', 'text'],
  'faq.item': ['q', 'a'],
  'bref.row': ['dt', 'ddHtml', 'fees', 'contact', 'hours'],
  meta: ['title', 'description', 'ogTitle', 'ogDescription'],
  service: ['name', 'serviceType', 'description', 'audience'],
  hero: ['h1Before', 'lead', 'leadStrong', 'faresHead'],
  'hero.faresHead': ['b', 'span'],
  pricing: ['plans', 'sub'],
  plan: ['id', 'label', 'unit', 'name', 'price', 'condition', 'conditionLong', 'includes', 'offerDescription', 'when', 'trigger'],
  stub: ['notSure'],
  how: ['h2', 'h2g', 'steps'], checks: ['h2', 'h2g', 'items'], papers: ['summary', 'at', 'items', 'tail'], faq: ['h2', 'items'],
  bref: ['h2', 'rows'], footer: ['statement'], door: ['label'],
  desk: ['person', 'role', 'timeZone', 'tzLabel', 'zoneName', 'hours', 'days'],
  form: ['name', 'contact', 'consentLead', 'consentAlt', 'errors', 'sending', 'sentNext', 'sentWhenDefault'],
  'form.errors': ['name', 'contact', 'email', 'net'],
  checkoutCopy: ['noteLabel', 'notePlaceholder', 'btnSubNow', 'btnSubWait', 'altLead', 'altLink', 'startNow', 'withdrawal', 'fine', 'errors', 'paid', 'booked', 'order'],
  'checkoutCopy.errors': ['name', 'email', 'net', 'stale'],
  'checkoutCopy.paid': ['before', 'em', 'text', 'next', 'nextWait', 'wait', 'pending', 'unconfirmed', 'startsNow', 'startsWait'],
  'checkoutCopy.booked': ['before', 'em', 'text', 'next', 'nextWait', 'wait', 'pending', 'unconfirmed', 'startsNow', 'startsWait',
    'withdrawLink', 'paidText', 'dueText', 'payLabel', 'withdrawnText', 'closedText'],
  till: ['label', 'labelWait']
};
function allowOnly(obj, path, where) {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return;
  const ok = ALLOWED[path];
  for (const k of Object.keys(obj)) need(ok.includes(k), where, `${path ? path + '.' : ''}${k} is a key the page does not read: remove it (copy nobody sees is copy everybody believes is live)`);
}
// the per-item allow-lists and the array each walks
const ITEM_LISTS = { 'how.step': 'how.steps', 'checks.item': 'checks.items', 'faq.item': 'faq.items', 'bref.row': 'bref.rows' };

// v1.7 fourth round: the trusted-markup fields (keys ending in "Html", e.g. bref.rows[].ddHtml) carry only
// <b>, <strong>, <em>, <i>, <br> and <a href="…"> with double-quoted attributes: no comment, no style, no img, no
// input, no abbr, no title / aria-* / data-* attribute (a registration word cannot hide in markup a reader sees)
const HTML_FIELD_TAG_RE = /^<(?:\/?(?:b|strong|em|i)|br\s?\/?|a href="[^"<>]*"(?: target="_blank" rel="noopener")?|\/a)>$/;
export function htmlFieldGuard(obj, where, pth = '') {
  if (Array.isArray(obj)) { obj.forEach((x, i) => htmlFieldGuard(x, where, `${pth}[${i}]`)); return; }
  if (!obj || typeof obj !== 'object') return;
  for (const [k, v] of Object.entries(obj)) {
    const at = pth ? `${pth}.${k}` : k;
    if (/Html$/.test(k) && typeof v === 'string') {
      const bad = (v.match(/<[^>]*>?|<!--[\s\S]*?-->/g) || []).filter((t) => !HTML_FIELD_TAG_RE.test(t));
      const left = v.replace(/<[^>]*>/g, '');
      need(!bad.length && !/[<>]/.test(left), where, `${at}: trusted markup carries only <b>, <strong>, <em>, <i>, <br> and <a href="…"> (double quotes, no other attribute); found ${bad.length ? bad.map((t) => `"${t.slice(0, 60)}"`).join(', ') : 'a stray < or >'}`);
    } else htmlFieldGuard(v, where, at);
  }
}

// the company's identity strings: any "REA XX-…" is entity.rea, any "VAT /
// P.IVA <11 digits>" is entity.vat. Shared by the desks and the hub.
export function identityGuard(text, shared, where) {
  const e = shared.entity || {};
  for (const m of String(text).matchAll(/REA\s+([A-Z]{2}-\d+)/g)) need(m[1] === e.rea, where, `"REA ${m[1]}" is not the company's REA (${e.rea}, cities/_shared.json): the identity is said once, never typed`);
  for (const m of String(text).matchAll(/(?:VAT|P\.?\s?IVA)\s+(?:IT)?(\d{11})/g)) need(m[1] === e.vat, where, `"VAT ${m[1]}" is not the company's VAT number (${e.vat}, cities/_shared.json): the identity is said once, never typed`);
}

export function renderCity({ template, shared, city, assetVersion, frags, root = ROOT, cities = [city], weigh = true, europe = null, claims = null }) {
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
  // v1.8 — WHEN the desk charges is the server's word (CITY_MARKETS.<slug>.
  // chargeAt); the JSON repeats it, as a non-euro desk repeats its currency,
  // and the build refuses the two apart EITHER WAY: a copy edit cannot make a
  // page promise a timing the server does not keep, and the registry cannot
  // flip under a page that still prints a till's payment (spec v1.8 §3.2)
  const signing = chargeAtOf(city.slug) === 'signing';
  need(city.chargeAt === undefined ? !signing : city.chargeAt === (signing ? 'signing' : 'checkout'), where,
    `"chargeAt" must be the desk's own (${signing ? '"signing"' : 'absent or "checkout"'}), as api/_market.js charges it (CITY_MARKETS.${city.slug}.chargeAt)`);
  need(!signing || (sell && city.mode === 'search'), where, 'a desk that charges at signing takes the order on its page: mode "search" and checkout true');
  need(!signing || (Object.prototype.hasOwnProperty.call(ORDER_TERMS, city.slug) && str(ORDER_TERMS[city.slug].v)), where,
    `a desk that charges at signing needs its order terms (api/_cityterms.js ORDER_TERMS.${city.slug}): the page posts their version, the server refuses an older one`);
  // the spec's copies carry "SHIP-DATE" until the flip: a placeholder date is
  // a WebPage dateModified and a sitemap <lastmod> nobody wrote
  need(city.updated !== 'SHIP-DATE', where, '"updated" is still the spec\'s "SHIP-DATE" placeholder: write the ship date (YYYY-MM-DD, the sitemap <lastmod>)');

  // ── the shared file ──
  const site = shared.siteUrl;
  need(/^https:\/\/[^/]+$/.test(site || ''), 'cities/_shared.json', 'siteUrl must be https://host with no trailing slash');
  need(shared.contact && /^\d{8,15}$/.test(shared.contact.whatsapp || '') && /@/.test(shared.contact.email || '') && str(shared.contact.waText) && /\{city\}/.test(shared.contact.waText) && !/[€£]|\d/.test(shared.contact.waText),
    'cities/_shared.json', 'contact.whatsapp (digits only), contact.email and contact.waText (with {city}, no price) are required');
  need(shared.contact.waPlan === undefined, 'cities/_shared.json', 'contact.waPlan is a v1.4 leftover: no WhatsApp link carries a plan any more');
  for (const k of LEFTOVERS.shared) need(shared[k] === undefined, 'cities/_shared.json', `${k} is a v1.4 leftover (the month select and the menu left the page)`);
  need(shared.refund && typeof shared.refund.rule === 'string' && /refunded in full if we decline the search in the first call/.test(shared.refund.rule),
    'cities/_shared.json', 'refund.rule is the one sentence of the policy: "… refunded in full if we decline the search in the first call" (the founder, 15/10)');
  // v1.8: the one sentence of a desk that charges at signing — under the closed
  // €500, in the Fees row, in every Offer and in the till's fine print (§3.3)
  if (signing) need(shared.signing && typeof shared.signing.rule === 'string' && /^Nothing is charged before you sign a lease\b/.test(shared.signing.rule) && /\bnothing if you never do\.$/.test(shared.signing.rule),
    'cities/_shared.json', 'signing.rule is the one sentence of a desk that charges at signing: "Nothing is charged before you sign a lease, and nothing if you never do."');
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

  htmlFieldGuard(city, where);
  htmlFieldGuard(shared, 'cities/_shared.json');

  // ── the pass ──
  need(str(city.hero.h1Before) && str(city.hero.lead) && str(city.hero.leadStrong), where, 'hero needs h1Before, lead and leadStrong (the desk\'s must-state, in bold)');
  const leadWords = words(city.hero.lead + ' ' + city.hero.leadStrong);
  need(leadWords <= BUDGET.lead, where, `hero.lead + leadStrong is ${leadWords} words, over ${BUDGET.lead}`);
  if (waitlist) need(/^Opening with/.test(city.hero.lead), where, 'a waitlist desk\'s lead opens with "Opening with" (what exists today)');
  // the brief §4 must-states, verbatim, in the lead (the first thing read)
  // v1.8: a desk that charges at signing may carry its own ("Paid only by
  // you, and only when you sign."); a desk whose till takes the fee never
  // says it is paid at signing (that would be a timing Stripe does not keep)
  if (sell) need(/never paid by landlords|we do not act for the landlord/.test(city.hero.leadStrong) || (signing && /only when you sign/.test(city.hero.leadStrong)), where, 'a sell desk\'s leadStrong is its must-state (Amsterdam: "never paid by landlords"; Spain: "we do not act for the landlord")' + (signing ? '; a desk that charges at signing: "… only when you sign"' : ''));
  if (sell && !signing) need(!/\bonly when you sign\b|\b(?:at|on) signing\b/i.test([city.hero.lead, city.hero.leadStrong, city.hero.faresHead && city.hero.faresHead.span].join(' ')), where, 'a desk whose till takes the fee never says, on its pass, that it is paid at signing (the registry charges it at the checkout: CITY_MARKETS.chargeAt)');
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
    // v1.8: WHEN a fare is charged, said where the price is read: on a desk
    // that charges at signing every conditionLong says it ("… charged when you
    // sign a lease"); on a desk whose till takes the fee, never
    if (signing) need(/\bsign/i.test(p.conditionLong), where, `plan "${p.id}": on a desk that charges at signing, conditionLong says when ("VAT included, charged when you sign a lease…")`);
    else if (sell) need(!/\bsign/i.test(p.conditionLong), where, `plan "${p.id}": a desk whose till takes the fee never says its fare is charged at signing (conditionLong)`);
    // D4: each fare says WHICH signing earns it (the ✓ line of its ticket and
    // of the till); only a desk that charges at signing has one
    if (signing) need(str(p.trigger) && /^Nothing is charged\b/.test(p.trigger) && SIGN_RULE_RE.test(p.trigger) && !/[€£]\s?\d|refund/i.test(p.trigger), where, `plan "${p.id}": a fare charged at signing says which signing earns it — trigger "Nothing is charged … sign …", one sentence, no price, no refund`);
    else need(p.trigger === undefined, where, `plan "${p.id}": a trigger belongs to a desk that charges at signing (CITY_MARKETS.chargeAt)`);
  }
  const fsPlan = plans[0];
  // Full Search's own words: one viewing included, more priced, no date
  // (v1.8: not asked of a desk that charges at signing — Paris states its
  // extra viewings by data, Berlin may state none: WoVermRG §3(3))
  const avPrice = pr(plans[2].price);
  // Germany prices no extra viewing around a Full Search (WoVermRG §3(3), below): exempt
  const inDE = String(city.country || '').toUpperCase() === 'DE';
  need(fsPlan.includes.some((x) => x.includes(`(more: ${avPrice} each)`)) || waitlist || signing || inDE, where, `Full Search on a desk that sells says "(more: ${avPrice} each)": one viewing is included, the rest are priced at the Attended Viewing's own price`);
  need(fsPlan.includes.some((x) => /Until you sign, or you say stop/.test(x)) || waitlist, where, 'Full Search says how long it runs: "Until you sign, or you say stop"');
  // Berlin, a desk still opening: both condition strings say "sign" (the
  // draft's pin). A desk that SELLS cannot ("a sell desk's condition never
  // says sign", above): there the law is pinned by data, below.
  if (city.slug === 'berlin' && waitlist) need(/sign/i.test(fsPlan.condition) && /sign/i.test(fsPlan.conditionLong), where, 'berlin: Full Search is due only once a lease is signed (WoVermRG §2–§3) — both condition strings must say "sign"');
  // v1.8 required France and Germany to charge at signing (loi Hoguet art. 6:
  // nothing is taken before the operation is concluded; WoVermRG §2(4): no
  // advance). 06/11/2026: the founder decided that Paris and Berlin take the
  // card at the order like the six, after being told the exposure in writing
  // (France: art. 16 loi Hoguet; Germany: §8 fines and §5 refund claims) — the
  // decision and its risk are in CLAUDE.md. The guard is gone on purpose; the
  // copy rules of the two countries below stay (they say true things).
  const FR = String(city.country || '').toUpperCase() === 'FR', DE = String(city.country || '').toUpperCase() === 'DE';
  if (sell && FR) {
    // loi Hoguet art. 7 (spec D5): a search mandate runs for a limited time
    need(fsPlan.includes.some((x) => /\(six months at most\)/.test(x)), where, 'France: Full Search says how long the mandate runs, "(six months at most)" (loi Hoguet art. 7, spec D5)');
    if (signing) need(/six months at most/.test(String(city.checkoutCopy && city.checkoutCopy.order)), where, 'France: the order line before the button says the mandate runs "six months at most" (loi Hoguet art. 7, spec D5)');
  }
  if (sell && DE) {
    // WoVermRG: every fee only once a lease is signed (§2: the shape above,
    // every conditionLong says "sign"), nothing beside a Full Search (§3(3)),
    // the fee never sold as "no percentage" (§3(1), D2), Full Search only for
    // a home offered to the tenant alone (§2(1a), D3)
    need(!fsPlan.includes.some((x) => /\(more:/.test(x)), where, 'Germany: no extra fee around a Full Search (WoVermRG §3(3)): no "(more: …)" in its lines');
    need(!/No percentage/i.test(JSON.stringify(city)), where, 'Germany: never "No percentage" (WoVermRG §3(1) states the fee as a fraction or multiple of the rent; spec D2)');
    const fees = list(city, 'checks.items').find((k) => /Bestellerprinzip/.test(k.at));
    need(fees && /offered to you alone/.test(fees.text), where, 'Germany: the Bestellerprinzip check says a Full Search is paid only for a home "offered to you alone" (WoVermRG §2(1a), spec D3)');
  }

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
  // audit 06/11: the withdrawal row and the desk hours are DERIVED (withdrawalRowOf, desk.hours):
  // a hand-typed "Withdrawal" row would say it twice, and drift from the till
  need(!city.bref.rows.some((r) => /^withdrawal/i.test(String(r.dt || '').trim())), where, 'the "Withdrawal" row of the fact sheet is derived by the build after the fees row (withdrawalRowOf): no row of that name in the JSON');
  need(city.bref.rows.every((r) => r.hours === undefined || r.hours === true) && city.bref.rows.filter((r) => r.hours === true).length === 1, where, 'exactly one fact-sheet row carries "hours": true (the reply time, followed by the desk hours from desk.hours)');
  need(str(city.footer.statement), where, 'footer.statement is required (the tenant-side statement)');

  // ── the till ──
  if (sell) {
    const k = city.checkoutCopy;
    need(k && typeof k === 'object', where, 'checkout:true needs "checkoutCopy"');
    for (const f of ['noteLabel', 'notePlaceholder', 'btnSubNow', 'btnSubWait', 'altLead', 'altLink', 'fine']) need(str(k[f]), where, `checkoutCopy.${f} is required`);
    need(k.altLink.startsWith(city.door.label) && !/open a file/i.test(JSON.stringify(k)), where, `checkoutCopy.altLink must start with door.label ("${city.door.label}"): the way out of the till is the page's one door`);
    if (signing) {
      // v1.8 (D6): ONE label, "Order, pay on signing" — the order, the
      // obligation to pay and when (CRD art. 8(2), §312j(3) BGB, L221-14);
      // the tick changes the sub-line, never the obligation
      need(city.till && str(city.till.label) && !/[€£]|\d/.test(city.till.label) && city.till.labelWait === undefined, where,
        'on a desk that charges at signing the till has ONE label (till.label, no price): the tick changes the sub-line, never the obligation — till.labelWait is refused');
      need(/\border\b/i.test(city.till.label) && /\bpay\b/i.test(city.till.label) && /\bsign/i.test(city.till.label) && !/start/i.test(city.till.label), where,
        'the order button names the order, the obligation to pay and when: till.label says "order", "pay" and "sign" (CRD art. 8(2)), never "start"');
    } else {
      need(city.till && str(city.till.label) && !/[€£]|\d/.test(city.till.label) && str(city.till.labelWait) && !/[€£]|\d/.test(city.till.labelWait) && city.till.labelWait !== city.till.label && !/start/i.test(city.till.labelWait), where,
        'till needs label (every pay control) and labelWait (the last button before the tick: never "start" — the work waits for the 14 days)');
      // "pay" on every desk's labels; "order" and "sign" name a desk that
      // charges at signing (spec v1.8 §13.2)
      need(/\bpay\b/i.test(city.till.label) && /\bpay\b/i.test(city.till.labelWait) && !/\border\b|\bsign/i.test(city.till.label + ' ' + city.till.labelWait), where,
        'a desk whose till takes the fee says "pay" on both labels and never "order" or "sign" (those name a desk that charges at signing)');
    }
    need(/14 days/.test(k.btnSubWait) && !/today|same working day/i.test(k.btnSubNow), where, 'checkoutCopy.btnSubWait says the 14 days; btnSubNow never promises "today" or the same working day');
    if (signing) need(k.fine.includes(shared.signing.rule) && /\bNo card\b/.test(k.fine) && !/Stripe|refund/i.test(k.fine), where, 'on a desk that charges at signing, checkoutCopy.fine says "No card", states the signing rule (cities/_shared.json signing.rule) and names no Stripe and no refund');
    else need(/refunded in full if we decline the search in the first call/i.test(k.fine), where, 'checkoutCopy.fine must state the refund policy (BOOM policy, 15/10)');
    for (const f of ['name', 'email', 'net']) need(k.errors && str(k.errors[f]), where, `checkoutCopy.errors.${f} is required`);
    // the order terms changed under an open page: the server answers 409 terms_changed
    if (signing) need(str(k.errors.stale), where, 'checkoutCopy.errors.stale is required on a desk that charges at signing: the words of the 409 terms_changed ("reload to order with the current terms")');
    else need(k.errors.stale === undefined, where, 'checkoutCopy.errors.stale belongs to a desk that charges at signing (its order terms have a version)');
    // A distance sale to a consumer (Directive 2011/83/EU arts. 6, 7(3), 16(a))
    need(str(k.startNow) && /start/i.test(k.startNow) && /withdraw/i.test(k.startNow) && /fully performed/i.test(k.startNow), where,
      'checkoutCopy.startNow is the payer\'s own request to start inside the withdrawal period, acknowledging the right ends once the service is fully performed');
    need(str(k.withdrawal) && /14 days/.test(k.withdrawal) && /\{email\}/.test(k.withdrawal) && /\{form\}/.test(k.withdrawal), where,
      'checkoutCopy.withdrawal states the 14-day withdrawal right, how to exercise it ({email}) and links the model withdrawal form ({form}) before the payment');
    // v1.8 stage W: every selling desk links the online withdrawal function
    // ({online} → /withdrawal?desk=<City>#online, Dir. 2023/2673 = CRD art.
    // 11a) beside the email and the model form — the six as Paris and Berlin
    need(/\{online\}/.test(k.withdrawal), where,
      'checkoutCopy.withdrawal links the online function ({online}) on every selling desk: the withdrawal button of Dir. 2023/2673 (CRD art. 11a), beside the email and the model form');
    // v1.8: on a desk that charges at signing the 14 days run from the ORDER
    // and withdrawing costs nothing — no refund, no "work already done"
    if (signing) need(/14 days from your order/.test(k.withdrawal) && /costs nothing/.test(k.withdrawal) && !/refund|work already done|minus/i.test(k.withdrawal), where,
      'on a desk that charges at signing, checkoutCopy.withdrawal runs "14 days from your order", says withdrawing "costs nothing", and never speaks of a refund, a minus or the work already done');
    // the order line, before the button: how long the order runs (CRD art. 8(2))
    if (signing) need(str(k.order) && /\border\b/i.test(k.order) && !/[€£]\s?\d/.test(k.order), where, 'checkoutCopy.order is required on a desk that charges at signing: the line before the button that says how long the order runs (no price)');
    else need(k.order === undefined, where, 'checkoutCopy.order belongs to a desk that charges at signing (the order line before its button)');
    const three = (a) => Array.isArray(a) && a.length === 3 && a.every((x) => Array.isArray(x) && x.length === 2 && x.every(str));
    // PAID and BOOKED are exclusive (D9): a desk takes a payment at its till
    // (the PAID card) or an order (the BOOKED card), never both
    if (signing) {
      need(k.paid === undefined, where, 'a desk that charges at signing has no PAID card: checkoutCopy.paid is refused (BOOKED is never PAID — checkoutCopy.booked)');
      const b = k.booked;
      need(b && ['before', 'em', 'text', 'wait', 'pending', 'unconfirmed', 'startsNow', 'startsWait', 'withdrawLink', 'paidText', 'dueText', 'payLabel', 'withdrawnText', 'closedText'].every((f) => str(b[f])), where,
        'checkoutCopy.booked needs before, em, text, wait, pending, unconfirmed, startsNow, startsWait, withdrawLink, paidText, dueText, payLabel, withdrawnText and closedText');
      need(/\{date\}/.test(b.startsWait) && /14-day|14 days/.test(b.wait) && /\{email\}/.test(b.wait) && /not confirmed yet/i.test(b.unconfirmed) && !/[€£]|\d/.test(b.pending + b.unconfirmed), where,
        'booked.startsWait carries {date}, booked.wait says the 14 days and {email}, booked.unconfirmed says "not confirmed yet"; no figure in the pending lines');
      need(/^From \{date\}/.test(b.startsWait) && !/when your 14 days end|14 days end/i.test(b.startsWait), where,
        'booked.startsWait opens "From {date}" and never calls {date} the day the 14 days end: {date} is the first working day after them');
      need(three(b.next) && three(b.nextWait) && !b.nextWait.flat().some((y) => /same working day|today/i.test(y)), where, 'booked.next and booked.nextWait are three [label, line] pairs; nextWait never "same working day" or "today"');
      // BOOKED is never PAID: what the order shows says nothing was paid or refunded
      const card = [b.before, b.em, b.text, b.wait, b.pending, b.unconfirmed, b.startsNow, b.startsWait, ...b.next.flat(), ...b.nextWait.flat()].join(' ');
      need(!/\b(?:paid|payments?|refund\w*)\b/i.test(card), where, 'the BOOKED card never says paid, payment or refund: nothing has been paid (D9)');
      // the managed view's states (spec §5.4): the statutory label, verbatim,
      // and each state with the server's value it carries
      need(b.withdrawLink === WITHDRAW_LABEL, where, `booked.withdrawLink is the statutory label, verbatim: "${WITHDRAW_LABEL}" (Dir. 2023/2673 art. 11a)`);
      need(/\{amount\}/.test(b.dueText) && /VAT/.test(b.dueText) && /\bpay\b/i.test(b.payLabel) && !/[€£]|\d/.test(b.payLabel) && /\{date\}/.test(b.paidText) && /\{date\}/.test(b.withdrawnText) && /nothing was charged/i.test(b.withdrawnText) && /nothing was charged/i.test(b.closedText), where,
        'booked: dueText carries {amount} with VAT, payLabel says "pay" with no figure, paidText and withdrawnText carry {date}, withdrawnText and closedText say nothing was charged');
    } else {
      need(k.booked === undefined, where, 'checkoutCopy.booked belongs to a desk that charges at signing (the BOOKED card): this desk takes the fee at its till (checkoutCopy.paid)');
      const pd = k.paid;
      need(pd && ['before', 'em', 'text', 'wait', 'pending', 'unconfirmed', 'startsNow', 'startsWait'].every((f) => str(pd[f])), where, 'checkoutCopy.paid needs before, em, text, wait, pending, unconfirmed, startsNow and startsWait');
      need(/\{date\}/.test(pd.startsWait) && /14-day|14 days/.test(pd.wait) && /\{email\}/.test(pd.wait) && /not confirmed yet/i.test(pd.unconfirmed) && !/[€£]|\d/.test(pd.pending + pd.unconfirmed), where,
        'paid.startsWait carries {date}, paid.wait says the 14 days and {email}, paid.unconfirmed says "not confirmed yet"; no figure in the pending lines');
      // {date} is the webhook's workFromLabel: the first working day AFTER the
      // withdrawal period, never the day it ends (that would misstate the right)
      need(/^From \{date\}/.test(pd.startsWait) && !/when your 14 days end|14 days end/i.test(pd.startsWait), where,
        'paid.startsWait opens "From {date}" and never calls {date} the day the 14 days end: {date} is the first working day after them');
      need(three(pd.next) && three(pd.nextWait) && !pd.nextWait.flat().some((y) => /same working day|today/i.test(y)), where, 'paid.next and paid.nextWait are three [label, line] pairs; nextWait never "same working day" or "today"');
    }
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
      // the till's ✓ line: the refund rule rides on Full Search at a desk
      // whose till takes the fee; at a desk that charges at signing every
      // fare shows its own trigger (B20a)
      rule: sell && (signing || p.id === 'full-search'),
      ...(signing ? { trigger: p.trigger } : {}),
      // the plan an upgrade credit leads to: its till shows the personal-link hint (#tUp)
      ...(upgradesOf(city).some((u) => u.to === p.id) ? { up: true } : {})
    }])),
    TILL: sell ? (signing ? { label: city.till.label } : { label: city.till.label, labelWait: city.till.labelWait }) : null,
    PAID: sell && !signing ? { startsNow: city.checkoutCopy.paid.startsNow, startsWait: city.checkoutCopy.paid.startsWait, nextWait: city.checkoutCopy.paid.nextWait, unconfirmed: city.checkoutCopy.paid.unconfirmed } : null,
    // v1.8 — only a desk that charges at signing carries these keys (the six
    // stay byte-identical, B20b): the word itself, the order terms' version
    // the till posts (the server answers 409 terms_changed to an older one),
    // the online withdrawal page and the BOOKED card's strings (D9), with the
    // desk's email filled in, for the managed view
    ...(signing ? {
      CHARGE_AT: 'signing',
      ORDER_TERMS_V: ORDER_TERMS[city.slug].v,
      WITHDRAW_URL: WITHDRAWAL_PATH,
      BOOKED: Object.fromEntries(Object.entries(city.checkoutCopy.booked).map(([key, v]) => {
        const withEmail = (s) => (typeof s === 'string' ? s.split('{email}').join(contact.email) : Array.isArray(s) ? s.map(withEmail) : s);
        return [key, withEmail(v)];
      }))
    } : {}),
    // v1.6 §D: the onda canvas script, injected by boom-city.js at ≥940px after load
    ONDA: `/assets/boom-onda.js?v=${(assetVersion && assetVersion.onda) || '0'}`,
    // v1.7: the Horizon's script, injected when the map nears the screen
    MAP: `/assets/boom-map.js?v=${(assetVersion && assetVersion.map) || '0'}`
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
    jsonLdBreadcrumb: ldJson(jsonLdBreadcrumb(city, shared, pageUrl)),
    jsonLd: ldJson(jsonLd(city, shared, pageUrl, ogImage, cities)),
    ogLocale: ogLocaleOf(city),
    htmlLang: inLanguageOf(city),
    configJson: scriptJson(config, '  '),
    assetVersion,
    scrollBlock: frags.scrollBlock,
    solariEngine: frags.solariEngine,
    deskCalendar: frags.deskCalendar,
    ratingHtml: rome.profileUrl ? `<a class="lnk" href="${esc(rome.profileUrl)}" target="_blank" rel="noopener">${rating}</a>` : rating,
    // who operates the desk, under the pass: on the HOME-COUNTRY desk (Milan)
    // what it is — an Italian real estate agency, under the same Italian law
    // as in Rome; elsewhere the same agency, and WHICH registry (04/11/2026:
    // in Valencia "a registered agency" reads as the RAICV, a registry the
    // desks are not in — the line names Rome, where the company is registered)
    proofLead: isHomeDesk(city, shared)
      ? `Operated by ${shared.entity.legalName}, an Italian real estate agency, under the same Italian law as in Rome`
      : `Operated by ${shared.entity.legalName}, an Italian real estate agency registered in Rome`,
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
  // v1.7: the static map never carries the night (the terminator moves with the hour: only boom-map.js draws it)
  need((html.match(/<g class="hz-nite"><\/g>/g) || []).length === 1 && !/hz-term|<image\b/.test(html), where, 'the map is served with its night layer empty: the terminator moves with the hour, only assets/boom-map.js draws it');

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
  // LAU art. 20 (v1.7 review): on a Spanish desk that sells, "Optional, chosen in
  // writing" is read BEFORE the first price — the order is the legal claim
  if (ES && sell) {
    const hAt = fares.indexOf('id="faresH"'), pAt = fares.search(/data-plan-price=/);
    need(hAt > -1 && pAt > -1 && hAt < pAt && fares.includes(`<b id="faresH">${esc(fh.b)}</b>`), where, 'LAU art. 20: on a Spanish desk that sells, the fares head "Optional, chosen in writing" (#faresH) comes BEFORE the first price in #fares');
  }
  for (const p of plans) {
    need(fares.includes(`<span class="f-price" data-plan-price="${esc(p.id)}">${pr(p.price)}</span><span class="f-cond${condThree(p) ? ' f-c3' : ''}">${esc(p.condition).replace(' · incl. VAT', ' ·<br> incl. VAT')}</span>`), where, `plan "${p.id}": its price ${pr(p.price)} is not on its fare row with its condition`);
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
  // THE UPGRADE CREDIT (api/_upgrade.js, a policy since 12/11/2026): where the
  // desk takes the card at the order, the ticket of the plan that can be
  // upgraded says the ✓ line, the Fees row and that plan's Offer say the fact
  // with ITS desk's window and the door (the personal link), and the till of
  // the plan the credit leads to carries the hint — the server's own words,
  // so the page cannot state a rule the server does not keep. A desk that
  // charges at signing, or is still opening, takes nothing at the order: the
  // words are refused there.
  {
    const ups = upgradesOf(city);
    const tillHtml = sliceOf(html, '<dialog class="till"', '</dialog>');
    for (const u of ups) {
      const tk = sliceOf(sliceOf(fares, `id="fare-${u.from}"`, '</details>'), '<div class="tk">', '<div class="tk-stub">');
      need(tk.includes(`<p class="refund">${esc(upgradeLine(u.toLabel, u.days))}</p>`), where, `the ${u.fromLabel} ticket does not say the upgrade credit with this desk's window (api/_upgrade.js upgradeLine, upgradeDaysOf)`);
      need(sliceOf(html, '<dt>Fees</dt>', '</dd>').includes(esc(upgradeFact(u.fromLabel, u.toLabel, u.days))), where, 'the fees row does not say the upgrade credit with this desk\'s window and its door (api/_upgrade.js upgradeFact)');
      need(ldStrings(html).some((t) => t.includes(upgradeFact(u.fromLabel, u.toLabel, u.days))), where, `the ${u.fromLabel} Offer does not say the upgrade credit with this desk's window and its door (api/_upgrade.js upgradeFact)`);
      need(tillHtml.includes(`<p class="t-up" id="tUp" hidden>${esc(upgradeTillHint(u.fromLabel))}</p>`) && config.PLANS[u.to] && config.PLANS[u.to].up === true, where,
        `the ${u.toLabel} till does not point a ${u.fromLabel} holder to the personal link (api/_upgrade.js upgradeTillHint, config PLANS.${u.to}.up): this till charges the list price`);
    }
    need(plans.filter((p) => config.PLANS[p.id].up === true).every((p) => ups.some((u) => u.to === p.id)), where, 'a plan carries the upgrade hint flag without an upgrade path leading to it');
    if (!ups.length) need(!/credited in full/i.test(html) && !/id="tUp"/.test(html), where, 'this desk takes nothing at the order (it charges at signing, or is still opening): no upgrade credit exists here, and the page must not print one');
    // …and no OTHER sentence about the credit, on any desk: a rule typed by hand in a FAQ, a ticket or a meta
    // (another window, another door) is a rule the server does not keep. The word belongs to the server's
    // sentences alone ("credit history" and the like are other words).
    let rest = html;
    for (const u of ups) for (const t of [upgradeLine(u.toLabel, u.days), upgradeFact(u.fromLabel, u.toLabel, u.days)]) rest = rest.split(esc(t)).join(' ').split(t).join(' ');
    const stray = rest.match(/[^.<>"]{0,60}\bcredited\b[^.<>"]{0,60}/i);
    need(!stray, where, `the page says "credited" outside the server's own sentences (api/_upgrade.js): the upgrade credit is never typed by hand — "${stray ? stray[0].trim() : ''}"`);
  }
  // THE REFUND RULE BESIDE EVERY €500 (sell desks): the closed Full Search
  // row, its open ticket, the till, the fees row — every block that shows
  // the number carries the sentence. A €500 anywhere else is refused.
  // v1.8: a desk that charges at signing says ITS rule in the same places
  // (the signing rule: under the closed €500, in the till, in the fees row)
  // and every open ticket says its own fare's trigger; the six keep the
  // refund rule and their messages, word for word.
  if (sell) {
    const rule = esc(ruleOf(city, shared));
    const ruleWord = signing ? 'signing' : 'refund';
    const ruleRe = ruleReOf(city);
    const fsId = 'full-search';
    const fsRow = sliceOf(html, `<details class="fare" name="fare" id="fare-${fsId}"`, '<!-- /FARES -->');
    const ticket = sliceOf(fsRow, '<div class="tk">', '</details>');
    const outside = sliceOf(fsRow, '</details>', '<details');
    if (signing) {
      for (const p of plans) {
        const tk = sliceOf(fares, `id="fare-${p.id}"`, '</details>');
        need(sliceOf(tk, '<div class="tk">', '<div class="tk-stub">').includes(`<p class="refund">${esc(p.trigger)}</p>`), where, `the ${p.label} ticket does not say its trigger (the ✓ line: which signing earns that fee)`);
      }
    } else need(ticket.includes(`<p class="refund">${rule}</p>`), where, 'the refund rule is missing from the Full Search ticket, which shows €500');
    need(outside.includes(`<p class="refund fs">${rule}</p>`), where, `the ${ruleWord} rule is missing under the closed Full Search row, which shows €500`);
    need(sliceOf(html, '<dialog class="till"', '</dialog>').includes(rule), where, `the ${ruleWord} rule is missing from the till, which shows €500`);
    need(sliceOf(html, '<dt>Fees</dt>', '</dd>').includes(rule), where, `the ${ruleWord} rule is missing from the fees row, which shows €500`);
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
        need(ruleRe.test(attr), where, `a ${p500} in the head (a meta attribute) stands without the ${ruleWord} rule`);
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
      need(ruleRe.test(inside), where, `a ${p500} stands without the ${ruleWord} rule in its own block: "…${visibleText(flat.slice(Math.max(bodyAt, m.index - 120), m.index + 60)).trim()}…"`);
    }
    {
      const strs = (v) => (typeof v === 'string' ? [v] : v && typeof v === 'object' ? Object.values(v).flatMap(strs) : []);
      for (const t of [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].flatMap((x) => strs(JSON.parse(x[1])))) {
        if (t.includes(p500)) need(ruleRe.test(t), where, `a ${p500} in the JSON-LD stands without the ${ruleWord} rule: "${t.slice(0, 120)}…"`);
      }
    }
    // the till, in the order the law asks (CRD arts. 6(1)(h), 7(3), 8(2), 16(a))
    const till = sliceOf(html, '<dialog class="till"', '</dialog>');
    const at = (s) => till.indexOf(s);
    need(at('id="tTitle"') > -1 && at('id="tTitle"') < at('id="tStart"') && at('id="tStart"') < at('class="wd"') && at('class="wd"') < at('id="tGo"'), where, 'the till says the plan and its price, then the start-now request, then the withdrawal line, then the pay button — in that order');
    need(/<input type="checkbox" id="tStart">/.test(till) && !/id="tStart"[^>]*checked/.test(till), where, 'the start-now box is never pre-ticked');
    need(till.includes(`href="${WITHDRAWAL_PATH}?desk=${encodeURIComponent(city.city)}"`), where, 'the withdrawal line links the model withdrawal form with the desk');
    // every token of the withdrawal line is filled ({email}, {form}, {online})
    need(!/\{(?:email|form|online)\}/.test(till), where, 'the till\'s withdrawal line keeps an unfilled token ({email}, {form} or {online}): each is said once');
    // v1.8 stage W: every selling desk — the six as Paris and Berlin — links
    // the online withdrawal function with the desk inside the withdrawal
    // line, before the pay or order button (Dir. 2023/2673, CRD art. 11a)
    need(till.includes(`href="${WITHDRAWAL_PATH}?desk=${encodeURIComponent(city.city)}#online"`) && at('class="wd"') < at('#online"') && at('#online"') < at('id="tGo"'), where,
      'the withdrawal line links the online withdrawal function with the desk ({online}), before the pay or order button');
    // and the footer's Legal column carries it under its statutory label
    // (spec v1.8 §4.5): the model form stays one tap away, on that page
    need(sliceOf(html, '<nav aria-label="Legal">', '</nav>').includes(`<a href="${WITHDRAWAL_PATH}?desk=${encodeURIComponent(city.city)}#online">${WITHDRAW_LABEL}</a>`), where,
      `the footer of a selling desk links the online withdrawal function under its statutory label: "${WITHDRAW_LABEL}" → ${WITHDRAWAL_PATH}?desk=${encodeURIComponent(city.city)}#online (Dir. 2023/2673)`);
    if (signing) {
      // ONE label (D6): the button reads till.label whatever the tick
      need(till.includes(`<b id="tGoL">${esc(city.till.label)}</b>`) && till.includes(`data-label-now="${esc(city.till.label)}" data-label-wait="${esc(city.till.label)}"`), where, 'on a desk that charges at signing the order button reads till.label, ticked or not: the tick changes the sub-line, never the obligation');
      // after the plan: its trigger (the ✓ line, Full Search's as served) and
      // how long the order runs, before the start-now request
      need(till.includes(`<p class="refund" id="tRule" hidden>${esc(fsPlan.trigger)}</p>`) && till.includes(`<p class="t-order" id="tOrder">${esc(city.checkoutCopy.order)}</p>`)
        && at('id="tTitle"') < at('id="tRule"') && at('id="tRule"') < at('id="tOrder"') && at('id="tOrder"') < at('id="tStart"'), where,
        'on a desk that charges at signing the till says the plan, its trigger, then how long the order runs (checkoutCopy.order), before the start-now request (CRD art. 8(2))');
      need(/\bdata-err-stale="[^"]+"/.test(till), where, 'on a desk that charges at signing the till carries the words of a stale page (data-err-stale: 409 terms_changed)');
    } else need(till.includes(`<b id="tGoL">${esc(city.till.labelWait)}</b>`) && till.includes(`data-label-now="${esc(city.till.label)}"`), where, 'the pay button reads labelWait until the box is ticked');
    if (ES) need(till.includes(`<p class="t-opt">${esc(city.pricing.sub)}</p>`) && at('class="t-opt"') < at('id="tGo"'), where, 'on a Spanish desk the till repeats "Optional, chosen in writing" before the pay button');
  }
  // v1.8 (B19) — a desk that charges at signing never promises to refund a
  // sum it never took, nor to charge for "the work already done" (nothing is
  // due before the lease: loi Hoguet art. 6, WoVermRG §2) — anywhere: text,
  // attributes, JSON-LD, the config the page reads. It sells today (InStock,
  // never PreOrder) and shows BOOKED, never PAID (D9). The six never print
  // the signing rule, nor the BOOKED card.
  if (signing) {
    need(!/refunded in full|work already done|minus the work/i.test(html), where, 'a desk that charges at signing never says "refunded in full", "work already done" or "minus the work": nothing is taken before the lease');
    need(!/schema\.org\/PreOrder/.test(html) && /schema\.org\/InStock/.test(html), where, 'a desk that charges at signing takes the order today: its Offers are InStock, never PreOrder');
    need((html.match(/id="cBooked"/g) || []).length === 1 && !/id="cPaid"/.test(html), where, 'a desk that charges at signing shows the BOOKED card, once, and never the PAID card (D9)');
    const bookedCard = visibleText(sliceOf(html, '<div id="cBooked"', '<!-- /THE DOOR -->'));
    need(!/\b(?:paid|payments?)\b/i.test(bookedCard) && /\bBOOKED\b/.test(bookedCard), where, 'the BOOKED card says BOOKED and never "paid" or "payment": nothing has been paid (D9)');
    need(html.includes('"CHARGE_AT": "signing"') && html.includes(`"ORDER_TERMS_V": ${JSON.stringify(ORDER_TERMS[city.slug].v)}`), where, 'the page config declares CHARGE_AT "signing" and the order terms version the server checks (api/_cityterms.js)');
  } else {
    need(!/id="cBooked"|"CHARGE_AT"|"ORDER_TERMS_V"|"BOOKED"/.test(html), where, 'the BOOKED card and the order config belong to a desk that charges at signing');
    if (shared.signing && str(shared.signing.rule)) need(!html.includes(esc(shared.signing.rule)) && !html.includes(shared.signing.rule), where, 'the signing rule belongs to a desk that charges at signing: this desk takes the fee at its till');
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
    need(weight.mapKb <= MAP_KB, where, `assets/boom-map.js is ${weight.mapKb.toFixed(1)} KB gzipped, over the ${MAP_KB} KB of the map on view`);
  }
  // the registration a desk may state (v1.7 review, third round), checked LAST on the finished page: every sentence
  // about registration or licences is reviewed in cities/_claims.json (default deny); a desk that sells names no register it does not hold
  claimGuard(html, { claims: claims || loadClaims(root), sell }, where);
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
// the hub's caps, set once with the hub; never raised to fit
export const HUB_WEIGHT_KB = { total: 78, page: 28, css: 6, js: 6 };
// the map's drawn width where its pins are TARGETS (44px, centred on their
// dots), at which the build measures the distance between two pins: from
// 600px with a mouse — 566 at 600 (the column, the viewport minus the two 16px
// gutters, minus the box's two 1px borders), 559 at 940 beside its rail (the
// spec's figure: Chromium draws 582 there without a classic scrollbar; the
// narrower width is the stricter check). v1.8 option (b), spec D12: under
// 600px, or without hover, the pins are links but not targets — the map box
// takes the tap and resolves the nearest desk within 30px
// (assets/src/boom-desks.js); with eight live desks two pins stand 24–30px
// apart on a phone, which no 44px rule can hold
export const HUB_MAP_PX = { 600: 566, 940: 559 };
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
  fares: ['eb', 'h2', 'h2g', 'spain', 'signing', 'plans', 'strip', 'gates'],
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
const HUB_OPTIONAL = new Set(['homeCity', 'esDesks', 'gbpDesks', 'signDesks']);
// the literals hub copy may type with a digit in them; every other number is a token
const HUB_DIGIT_OK = ['LAU art. 20', '14 days', '14-day', '3+2'];
const STATUTE_RE = /\bart\.\s?\d+|§\s?\d+|\bLAU\b|\bLlei\b|\bL\.\s?\d+\/\d{4}|\bAct \d{4}\b/g;
const HUB_BANNED = [
  [/\bworldwide\b|\bglobal(?:ly)?\b|pan-European|all of Europe|\bEU desks?\b/i, 'a scope word ("worldwide", "global", "pan-European", "all of Europe", "EU desk"): the desks are in European cities'],
  [/\b(?:office|branch|team|based)\s+in\s+(?!Rome)\w+/i, 'a presence claim outside Rome (office, branch, team or based in …): every desk answers from Rome'],
  [/\b(?:licensed|registered)\s+in\s+(?!Rome)\w+/i, 'a licence or registration outside Rome: the company is registered in Rome'],
  [/(?<!Rome )Chamber of Commerce/, 'a Chamber of Commerce other than Rome\'s'],
  [/AICAT|RAICV|Registro de Agentes|carte professionnelle|§34c|licensed agent/i, 'a licence the desks do not hold'],
  [/\b10\s*%|one year's rent/, 'Rome\'s 10% commission: the desks charge flat fees'],
  [/\bguarantee|legal advice\b/i, 'a guarantee or legal advice'],
  [/law firm/i, 'a law firm (only "not a law firm" is said)'],
  [/founding|spots? left|places? left|\blimited\b|closing in|\d+\s*min(?:utes)? left/i, 'scarcity'],
  [/\d+\s*(?:km|miles)\b/, 'a distance']
];

// v1.7 review (04/11/2026, third round): registration and licence claims go through a REVIEWED
// ALLOWLIST, default deny. The founder took Valencia live with a till on one condition: no page
// claims a local registration or licence (the Valencian RAICV is an open legal question; Barcelona's
// AICAT is the same). Two rounds of regexes chased each other — a participle + preposition rule
// refused true copy about the lease, the rule anchored on the company as subject let a subject-free
// footer ("Registered with the Generalitat Valenciana.") through — so the approach changed: every
// sentence of a desk page or of /desks that uses the vocabulary of registration, licences,
// accreditation, regulation or membership (CLAIM_VOCAB_RE) must be, word for word after
// normalisation, an entry of cities/_claims.json, each with its kind and a note saying why it is not
// a claim that BOOM holds a registration, licence or membership outside Rome. A new sentence is
// refused until a person reads it and adds it. The file is also the list a lawyer reads.
// The sentences come from the visible text (block boundaries, then . ! ? ; · splits), from EACH meta
// content and EACH JSON string separately (never concatenated into one sentence; since the seventh round a
// title and its description, and a JSON-LD node's name and its description, are also read as a join), from
// attribute values and from the string literals of inline scripts — reviewSentences(), the same code the tests use.
export const CLAIMS_FILE = 'cities/_claims.json';
// THE VOCABULARY (fourth round, 04/11/2026). Matched on text that is already decoded (entities), NFKC-normalised
// and stripped of format characters (soft hyphen, zero-width, word joiner, BOM, U+2028/9): see cleanText. Letters are
// Unicode letters (\p{L}), so accented stems and compounds work: every stem takes the prefixes un-, non-, de-, pre-
// ("Unregistered", "unregulated"); regist/licen/lizenz/erlaubnis also match inside a compound (Handelsregister,
// Maklererlaubnis). Then the public bodies and the registers by name, the local-language forms, the number shapes
// ("agent no. CV-1234", "Reg. no.", "Lic. no.", "n.º 1234") and the statute (§34c GewO in every spelling).
const LET = String.raw`[\p{L}\p{N}]`;
const CLAIM_STEMS = [
  String.raw`(?:${LET}*)regist${LET}*`, String.raw`(?:${LET}*)licen[cçs]${LET}*`, String.raw`(?:${LET}*)lizenz${LET}*`, String.raw`(?:${LET}*)erlaubnis${LET}*`,
  String.raw`llic[eè]nci${LET}*`, String.raw`accredit${LET}*`, String.raw`acredit${LET}*`, String.raw`authori[sz](?:ed|ation|ations|es|ing)`, String.raw`autori[zt]${LET}*`, String.raw`autoritz${LET}*`,
  'certified', 'certification', String.raw`certificad${LET}*`, String.raw`recogni[sz]ed`, String.raw`reconocid${LET}*`, 'regulated', String.raw`regulator${LET}*`, String.raw`regulad${LET}*`,
  String.raw`approv${LET}*`, 'listed', 'members?', 'membership', String.raw`affiliat${LET}*`, 'permits?', String.raw`supervis${LET}*`, 'chartered',
  String.raw`enrol${LET}*`, String.raw`inscri${LET}*`, String.raw`colegiad${LET}*`, String.raw`col·?legia[dt]${LET}*`, String.raw`habilit${LET}*`, String.raw`iscritt${LET}*`, String.raw`abilitat${LET}*`, 'ruolo',
  'ingeschreven', String.raw`erkend${LET}*`, String.raw`eingetragen${LET}*`, String.raw`zugelassen${LET}*`, String.raw`agr[ée]é${LET}*`, 'miembros?', 'membres?', String.raw`mitglied${LET}*`, 'lid van',
  'redress', 'ombudsman', 'propertymark',
  // fifth round: the synonyms of approval and the local words for a licence, a certificate, a sworn or affiliated agent
  // (permitted, entitled, endorsed, vetted, homologated; vergunning, gecertificeerd, aangesloten, beëdigd, erkenning,
  // toelating; Zulassung, Genehmigung, zertifiziert; certifiée, affiliée, adhérent; afiliada, asociada, associada,
  // permiso, permís; certificata, associata, patentino, convenzionata). Not "allowed" (too common), and "associated",
  // "associate", "agreement", "certificate" do not match (only the Italian/Spanish endings). "qualified" only as
  // "qualified as/under/by".
  'permitted', 'entitled', String.raw`endors${LET}*`, 'vetted', String.raw`homolog${LET}*`, String.raw`omologat${LET}*`, 'trustmark', 'complaints? schemes?', String.raw`qualified\s+(?:as|under|by)`,
  String.raw`vergunning${LET}*`, String.raw`(?:${LET}*)gecertific${LET}*`, 'aangesloten', String.raw`be[eë]digd${LET}*`, String.raw`erkenning${LET}*`, String.raw`toelating${LET}*`,
  String.raw`zulassung${LET}*`, String.raw`genehmigung${LET}*`, String.raw`zertifiz${LET}*`, String.raw`certifi[ée]${LET}*`, String.raw`affili[ée]${LET}*`, String.raw`adh[ée]rent${LET}*`,
  String.raw`afiliad${LET}*`, 'asociad[ao]s?', 'associad[ao]s?', 'permisos?', 'perm[íi]s', 'certificat[ao]', 'associat[ao]', 'patentin[oi]', String.raw`convenzionat${LET}*`,
  // and the nouns of registration the stems above miss: iscrizione, Eintragung, inschrijving, immatriculation, albo
  String.raw`iscrizion${LET}*`, String.raw`eintragung${LET}*`, String.raw`inschrijving${LET}*`, String.raw`immatricul${LET}*`, 'albo',
  // the registers' initials that are no English word, in any case ("Socio Fimaa Milano")
  'fimaa', 'fiaip', 'aicat', 'raicv', 'fnaim',
  // the authorities and the registers, by name
  'generalitat', 'comunitat valenciana', 'comunidad de madrid', 'ayuntamiento', 'ajuntament', 'junta', 'consell', 'gemeente', 'municipality',
  'chamber of commerce', 'camera di commercio', String.raw`gewerbeamt${LET}*`, 'kamer van koophandel', String.raw`pr[ée]fecture`, String.raw`incas[òo]l`,
  'client money protection', 'vastgoedpro', 'agente de la propiedad(?: inmobiliaria)?', 'carte professionnelle', 'carte t'
];
const CLAIM_WORDS_RE = new RegExp(String.raw`(?<!${LET})(?:un|non-?|de|pre)?(?:${CLAIM_STEMS.join('|')})(?!${LET})`, 'giu');
// the registers' initials: upper case, on the text and on a copy where "R.A.I.C.V." / "K.v.K." / "T P O" are closed up
const CLAIM_ABBR_RE = /(?<![\p{L}\p{N}])(?:RAICV|AICAT|TPO|PRS|CMP|ARLA|NAEA|RICS|NVM|VBO|API|FIAIP|FIMAA|CCIAA|CCI|INCASÒL|INCASOL|IHK|FNAIM|IVD)(?!\p{Ll})|(?<!\p{L})[Kk][Vv][Kk](?!\p{L})/gu;
// the number shapes (fifth round): a keyword (agent, agency, reg., regd., lic., licence, registration, ref., no., nr., n.,
// núm., n.º) as a word, an optional "no." / "nr." / "n.º" / "núm." / "ref." / "ID" / "code" / "number" / "número" / "#", then a code
// of up to three letters and three or more digits, joined, hyphenated or spaced ("Agent no. CV-1234", "Reg. 123456",
// "Agent ref. CV-1234", "Agent ID CV-1234", "Agency number CV 1234", "Iscrizione n. 1234"); the Spanish and Italian order
// ("Número de agente 1234", "numero di iscrizione 1234"); §34c in every spelling. The keyword is a whole word: "Nov 2026"
// is not "no 2026"; "n." needs its dot.
// Sixth round: the keywords are case-insensitive, the CODE's letters are UPPER CASE only — with the i flag [A-Z]{0,3} took
// "in", "for", "fee" ("Find your agent in 2026", "Hire an agent for 300 euros", "The agency fee 300 €" read as number
// shapes). JS has no inline (?i:…) before Node 23, so the keyword fragments are spelled caseless ("agent" →
// "[aA][gG][eE][nN][tT]", "[úu]" → "[úÚuU]"); lower-case letters are a code only joined or hyphenated to the digits
// ("cv-1234"), never across a space. A run of digits is never a code when an amount or a measure follows it
// (%, €, £, $, euro, pound, EUR, GBP, per cent, months, weeks, days, years, hours, minutes, km, m², mq, sqm, metres …:
// "An agency 100% on your side"), nor a year right after in / since / from / until ("AGENT IN 2026"); a copula may
// stand between the keyword and the code ("Our agent number is 1234", "Our agent no. is CV-1234": with the i flag the
// first was caught by accident, through "is" taken as the code's letters). Eighth round: a grouped code ("Agent no. 1.234") and a
// number with its year ("Agent no. 45/2026"), the keyword "agente" and the Spanish and Italian number words before it ("Nº de
// agente", "codice agente") — NUM_GROUPED, NUM_SLASH, NUM_ABBR and NUM_ES below.
const caseless = (src) => {
  let out = '', inClass = false;
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (c === '\\') { const m = /^\\(?:[pPu]\{[^}]*\}|.)/su.exec(src.slice(i)); out += m[0]; i += m[0].length - 1; continue; }
    const lo = c.toLowerCase(), up = c.toUpperCase(), both = lo !== up && lo.length === 1 && up.length === 1 ? lo + up : '';
    if (inClass) { if (c === ']') inClass = false; out += both || c; continue; }
    if (c === '[') { inClass = true; out += c; continue; }
    out += both ? `[${both}]` : c;
  }
  return out;
};
const NUM_UNIT = String.raw`(?:[%€£$]|${caseless(String.raw`(?:euros?|pounds?|eur|gbp|per\s*cent|percent|months?|weeks?|days?|years?|hours?|minutes?|mins?|km|kms|m2|m²|mq|sqm|sq\s*m|sq\s*ft|metres?|meters?|m)`)}(?![\p{L}\p{N}]))`;
// seventh round: the house separators a number shape bridges between its keyword, its number word and its code — the colon,
// the dashes (—, –, -), the middle dot and the bullet, the slash, the bar, an opening parenthesis, bracket or brace, straight
// and curly quotes and guillemets ("Agent no. — CV-1234", "Agent number (CV-1234)", "Agent no. · CV-1234", "Agency number
// “4471”"); before, only a space or a colon stood between them
const NUM_SEP = String.raw`[\s:\u2010-\u2015\-·•/|(\[{"'\u2018-\u201F«»‹›]`;
// the code. A YEAR is 1800–2099: a year after in/since/from/until is never a code ("AGENT IN 2026"), nor a run of digits that
// an amount or a measure follows (NUM_UNIT)
const NUM_YEAR = String.raw`(?:1[89]|20)\d{2}`;
const NUM_HEAD = String.raw`${NUM_SEP}*(?!${caseless('(?:in|since|from|until)')}\s+${NUM_YEAR}(?!\d))`, NUM_TAIL = String.raw`(?![\s-]*${NUM_UNIT})`;
// up to three letters (upper case; lower case only joined or hyphenated to the digits) and three digits or more
const NUM_PLAIN = String.raw`(?:[A-Z]{0,3}[\s-]?|[a-z]{1,3}-?)\d{3,}(?!\d)`;
// eighth round: a number and its year ("45/2026", "CV-12/2026") — never a date ("22/10/2026": no digit or slash before it), nor
// two years ("2025/2026")
const NUM_SLASH = String.raw`(?:[A-Z]{1,3}[\s-]?|[a-z]{1,3}-?)?(?<![\p{N}/])(?!${NUM_YEAR}\/)\d{1,4}\/${NUM_YEAR}(?![\d/])`;
// eighth round: a GROUPED code ("1.234", "1,234", "12 345", "12.345.678", "1,234,567", "CV-12.345"): one separator, groups of
// three, and nothing after it that continues the number ("1.234,56", the phone "331 325 1961")
const NUM_GROUPS = String.raw`\d{1,3}(?:(?:\.\d{3})+|(?:,\d{3})+|(?:[ \u00a0\u202f]\d{3})+)(?![.,\s]?\d)`;
const NUM_GROUPED = String.raw`(?:[A-Z]{1,3}[\s-]?|[a-z]{1,3}-?)?(?<![\p{N}/])${NUM_GROUPS}`;
// the code after a bare keyword: a grouped code only with its letters and a hyphen ("Agent CV-12.345"), so "An agency (2,500
// homes)" stays copy; after a number word, a number abbreviation or # (NUM_CODE_N) every grouped code ("Agent no. 1.234")
const NUM_CODE = String.raw`${NUM_HEAD}(?:${NUM_PLAIN}|${NUM_SLASH}|(?:[A-Z]{1,3}|[a-z]{1,3})-${NUM_GROUPS})${NUM_TAIL}`;
const NUM_CODE_N = String.raw`${NUM_HEAD}(?:${NUM_PLAIN}|${NUM_SLASH}|${NUM_GROUPED})${NUM_TAIL}`;
// the keywords — eighth round: the Spanish and Italian "agente" too ("Agente: CV-1234")
const NUM_KW = caseless(String.raw`(?:agent|agente|agency|reg|regd|lic|licen[cs]e|registration|ref|n\.?[ºo°]|no|nr|n[úu]m)`);
const NUM_WORD = caseless(String.raw`(?:no|nr|n\.?[ºo°]|n[úu]m|ref)`), NUM_NOUN = caseless(String.raw`(?:n[úu]mero|number|id|code)`);
const NUM_COPULA = String.raw`(?:${caseless('(?:is|es|è|ist|est)')}(?!\p{L})\s*)?`;
const NUM_LEAD = String.raw`(?<!\p{L})(?:${NUM_KW}(?!\p{L})\.?|${caseless('n')}\.)${NUM_SEP}*`;
const NUM_MID = String.raw`(?:${NUM_WORD}(?!\p{L})\.?\s*|(?:${NUM_NOUN}(?!\p{L})|#)\s*)`;
// eighth round: a keyword that is itself a number abbreviation (nº, n.º, n°, no., nr., núm., n. — the dot required on the
// letters, so the English "no" never is one), before a grouped code ("Nº 1.234", "Agente n. 1.234")
const NUM_ABBR = String.raw`(?<!\p{L})(?:${caseless(String.raw`n\.?[º°]`)}\.?|${caseless('(?:no|nr|n[úu]m|n)')}\.)(?!\p{L})`;
// the Spanish and Italian order: a number word before the agent, the register, the registration or the licence — eighth round:
// with the abbreviated and the other words of the number ("Nº de agente", "N.º de agente", "Núm. de agente", "Nro. de agente",
// "N. agente", "número agente", "código de agente", "codice agente", "ID de agente"; "número de agente" as before)
const NUM_ES = String.raw`(?<!\p{L})${caseless(String.raw`(?:n[úu]mero|n\.?[º°]|no\.|n[úu]m\.?|nro\.?|n\.|c[óo]digo|codice|id)\s*(?:(?:de|di|del|della)\s+)?(?:agente|registro|inscripci[óo]n|iscrizione|licencia|licenza|llic[eè]ncia)`)}(?!\p{L})`;
const CLAIM_NUM_RE = new RegExp([
  String.raw`${NUM_LEAD}${NUM_MID}${NUM_COPULA}${NUM_CODE_N}`, String.raw`${NUM_LEAD}${NUM_COPULA}${NUM_CODE}`, String.raw`${NUM_ABBR}${NUM_COPULA}${NUM_CODE_N}`,
  String.raw`${NUM_ES}${NUM_SEP}*${NUM_COPULA}${NUM_CODE_N}`,
  String.raw`§\s*34\s*[cC]`, String.raw`(?<!\p{L})${caseless('paragraph')}\s*34\s*[cC]`, String.raw`(?<![\p{L}\p{N}])34\s*[cC]\s*${caseless('gewo')}`
].join('|'), 'gu');
// sixth round: a NUMBER KEY — the keyword of a number shape with its number word ("agent no.", "agency number", "registration
// ID", "agente nº", "número de agente", "Nº de agente") or a label that is only a number word ("No.", "Number", "ID", "Ref.",
// "Code") — and a CODE of the value (upper-case letters and three digits or more, or four digits or more, and since the eighth
// round a grouped code or a number and its year, "1.234", "B-1.234", "45/2026"; never a year, a date, a price, a measure or a
// phone number): the two halves of a number shape a label and its value carry apart ("What is your agent number in
// Valencia?" — "CV-1234.")
const NUM_KEY_RE = new RegExp([
  String.raw`(?<!\p{L})${caseless(String.raw`(?:agent|agente|agency|reg|regd|lic|licen[cs]e|registration|ref)`)}(?:['’][sS])?(?!\p{L})\.?\s*(?:${NUM_WORD}|${NUM_NOUN})(?!\p{L})`,
  NUM_ES,
  String.raw`^\s*(?:${caseless(String.raw`(?:no|nr|n\.?[ºo°]|n[úu]m|n|ref|n[úu]mero|number|nummer|id|code)`)}\.?|#)\s*:?\s*$`
].join('|'), 'u');
export const VALUE_NUM_RE = new RegExp(String.raw`(?<![\p{L}\p{N}€£$])(?:[A-Z]{1,3}[\s-]?\d{3,}(?!\d)|(?!${NUM_YEAR}(?!\d))\d{4,}(?!\d)|(?<![+/]|\p{N}[.,\s])(?:${NUM_SLASH}|${NUM_GROUPED}))${NUM_TAIL}`, 'u');
// (a question that only ends on the agent is no number key: "Is BOOM Milan a real estate agency?" is answered by the company's
// line with REA RM-1710623)
export const numKeySplit = (label, value) => NUM_KEY_RE.test(label) && VALUE_NUM_RE.test(value);
// seventh round: a number key and a code in ONE block or string, in either order and whatever stands between them ("Our agent
// number in Valencia — CV-1234.", "Our agency number (CV-1234) is on every letter.", "CV-1234 is our agent number."): on the
// page the code reads as that number. Read on every text block, meta, JSON-LD string, attribute and script string as a whole,
// so neither the sentence splitter (the spaced ·) nor a word between the key and the code hides it (reviewSentences: ncut)
export const numKeyCode = (t) => { const c = cleanText(t); return numKeySplit(c, c); };
// "R.A.I.C.V." → "RAICV", "K.v.K." → "KvK", "T P O" → "TPO" (single letters closed up; only for matching)
export const closeUp = (t) => String(t).replace(/(?<!\p{L})\p{L}(?:\.\p{L}(?!\p{L})){1,}\.?/gu, (m) => m.replace(/[.\s]/g, '')).replace(/(?<!\p{L})\p{Lu}(?:\s\p{Lu}(?!\p{L})){2,}/gu, (m) => m.replace(/\s/g, ''));
// every vocabulary hit of one text (on the text and on its closed-up copy)
export function claimHits(t) {
  const s = cleanText(t), out = [];
  for (const x of new Set([s, closeUp(s)])) for (const re of [CLAIM_WORDS_RE, CLAIM_ABBR_RE, CLAIM_NUM_RE]) for (const m of x.matchAll(re)) out.push(m[0].toLowerCase());
  return out;
}
export const hasClaimVocab = (t) => claimHits(t).length > 0;
// kept for the callers that read a regex: .test() is hasClaimVocab
export const CLAIM_VOCAB_RE = { test: hasClaimVocab, toString: () => 'hasClaimVocab' };
export const CLAIM_KINDS = ['company-rome', 'trade-mark', 'lease', 'tenant', 'deposit', 'listing', 'law', 'partner', 'heading', 'context', 'follower'];
// the registers and licences no desk that sells holds: never on a selling page, allowlisted or not
// (tested on the text and on its closed-up copy, so "R.A.I.C.V." and "K.v.K. 12345678" are the names)
const SELL_REGISTRY_WORDS_RE = /Registro de Agentes|Registre d['’]Agents|carte professionnelle|\bcarte T\b|§\s*34\s*c|\bParagraph\s*34\s*c|\b34\s*c\s*GewO|Property Ombudsman|Property Redress|redress scheme|Propertymark|client money protection|Agente de la Propiedad|colegiad|\bkvk|Kamer van Koophandel/i;
const SELL_REGISTRY_ABBR_RE = /(?<![\p{L}\p{N}])(?:RAICV|AICAT|ARLA|NAEA|TPO|CMP|RICS|NVM|VBO|PRS|FIAIP|FIMAA|FNAIM|IVD|IHK)(?!\p{Ll})|(?<![\p{L}\p{N}])API\s+n|(?<!\p{L})[Kk][Vv][Kk](?!\p{L})/u;
// the initials that are no English word, in any case as a word ("Socio Fimaa Milano")
const SELL_REGISTRY_CI_RE = /(?<![\p{L}\p{N}])(?:fimaa|fiaip|aicat|raicv|fnaim)(?![\p{L}\p{N}])/iu;
export const SELL_REGISTRY_RE = { test: (t) => !!sellHit(t), toString: () => 'sellHit' };
export function sellHit(t) {
  const s = cleanText(t);
  for (const x of [s, closeUp(s)]) { const m = x.match(SELL_REGISTRY_WORDS_RE) || x.match(SELL_REGISTRY_ABBR_RE) || x.match(SELL_REGISTRY_CI_RE); if (m) return m[0]; }
  return null;
}
// in the allowlist itself: the registers no entry may name; the drafts' carte professionnelle and §34c
// only in a statement of the law or of the partner's licence (kinds law, partner)
const LINT_NEVER_RE = /\bRAICV\b|Registro de Agentes|\bAICAT\b|Registre d['’]Agents|Property Ombudsman|Property Redress|redress scheme|Propertymark|\bARLA\b|\bNAEA\b|\bkvk|Kamer van Koophandel|ombudsman|\bTPO\b|\bCMP\b|client money protection|\bRICS\b|\bNVM\b|\bVBO\b|Vastgoedpro|\bFIAIP\b|\bFIMAA\b|Agente de la Propiedad|\bAPI\b|colegiad|col·?legia[dt]|\bcarte T\b|\bPRS\b|\bFNAIM\b|\bIVD\b|\bIHK\b/i;
const lintNever = (t) => { const s = cleanText(t); for (const x of [s, closeUp(s)]) { const m = x.match(LINT_NEVER_RE); if (m) return m[0]; } return null; };
const LINT_DRAFT_RE = /carte professionnelle|§\s*34\s*c/i;
// the round-2 company-subject rule, now the allowlist's lint: the company (we, BOOM …, Egidi …, the/our
// desk, agency, company, team, agents) + a verb + a licence/registration predicate, or + hold/have … a licence
const LINT_SUBJECT = String.raw`\b(?:we're|we've|we|BOOM(?:'s)?(?:\s+[\w'.®-]+){0,3}?|Egidi(?:\s+Immobiliare)?(?:\s+S\.?r\.?l\.?)?|(?<!\b(?:whether|if|that|check|ask|sure)\s)(?:the|our)(?:\s+\w+)?\s+(?:desk|agency|company|team|staff|agents?))`;
const LINT_VERB = String.raw`(?:is|are|was|were|been|has been|have been|is now|are now|became|becomes|remains|stays|is fully|are fully)`;
const LINT_GAP = String.raw`(?:\s+(?!(?:the|that|it|it's|its|your|you|their|they|this|lease|leases|contract|deposit|homes?|flats?)\b)[\w'-]+){0,5}`;
const LINT_PART = String.raw`(?:licensed|registered|accredited|authori[sz]ed|certified|regulated|approved|listed|chartered|supervised|affiliated)`;
const LINT_CLAIM_RE = new RegExp(String.raw`${LINT_SUBJECT}(?:\s+${LINT_VERB}|(?<=\bwe're))${LINT_GAP}[\s-]+(?:${LINT_PART}|a member of|members of)\b`
  + String.raw`|${LINT_SUBJECT}\s+(?:hold|holds|have|has|got|obtained|were granted|was granted|operate under|operates under)${LINT_GAP}\s+(?:licen[cs]es?|permits?|registration|membership|carte professionnelle)\b`, 'i');
// "our licensed team", "BOOM's registered agents": the adjective on something of ours
const LINT_OURS_RE = new RegExp(String.raw`\b(?:our|BOOM's)\s+(?:[\w-]+\s+)?(?:\w+-)?${LINT_PART}\s+(?:[\w-]+\s+)?(?:desk|agency|agencies|company|team|staff|agents?|brokers?)\b`, 'i');
const LINT_NEG_RE = /\b(?:not|never|no)\b|n't\b/i;
const LAW_VERB_RE = /\b(?:is|are|was|were|be|been|must|needs?|requires?|pays?|ask|check|may|can|cannot|beware|post|posts|list|lists|lodges?|goes|go|has|have|charge|charges|works?|sets?)\b/i;
const LINT_FIRST_RE = /\b(?:we|we're|we've|us|our|ours|BOOM|Egidi)\b/i;
// a "regist…" of the company lands on Rome: only "in", "with", "the", "at", "of" (or "office:") between, and
// nothing after Rome that names another place or adds one ("as well as", "and in", "also")
const ROME_SEAT_RE = /^\s*(?:office:\s+)?(?:(?:in|with|the|at|of)\s+){0,3}(?:Rome|Roma|REA RM-1710623|Viale Liegi)\b|^\s*under\s+REA RM-1710623\b/i;
// the desk places other than Rome and Italy (the place rule, and what follows Rome in a company line)
export const PLACE_RE = /(?<!\p{L})(?:Amsterdam|Netherlands|Dutch|Holland|Barcelona|Catalonia|Catalunya|Catalan|Madrid|Valencia|València|Valencian|Comunitat|Spain|Spanish|London|England|UK|U\.K|British|Britain|Wales|Welsh|Scotland|Scottish|Milan|Milano|Lombardy|Lombardia|Paris|France|French|Berlin|Germany|German)(?!\p{L})/u;
const ROME_AFTER_RE = /\b(?:as well as|and in|also|plus)\b/i;
const CONTEXT_ADD_RE = /^(?:and|also|plus|too|as well)\b|\b(?:also|too|as well|since|offices?|branch(?:es)?|based|seat|headquarter\w*)\b/i;
// fifth round: a reviewed short label is a key, and what stands next to it reads as its value. A value is NEUTRAL when it
// has no vocabulary, no desk place, no run of three digits or code ("CV-1234", "B 5521"), no first person (we, our, us,
// BOOM, Egidi) and none of the words that turn a label into a claim (yes, since, number, file, list, listing, record,
// directory, roster in the desk languages, and the states and marks of a checklist: active, valid, done, granted, held,
// current, confirmed, in place, ok, ✓):
// "Registration — Yes, since 2026", "Generalitat — On its list of agents", "INCASÒL — our number is on file", "Registration ✓"
export const VALUE_CODE_RE = /(?<![\p{L}\p{N}])[A-Z]{1,4}[\s-]?\d{2,}|\d{3,}/u;
export const VALUE_WORDS_RE = /(?<!\p{L})(?:yes|sí|si|oui|ja|since|desde|dal|seit|depuis|numbers?|números?|numer[oi]|nummers?|files?|lists?|listas?|liste|listings?|records?|director(?:y|ies)|rosters?|active|valid|done|granted|held|current|confirmed|in place|ok)(?!\p{L})|[✓✔☑✅]/iu;
export const neutralValue = (t) => !hasClaimVocab(t) && !PLACE_RE.test(t) && !VALUE_CODE_RE.test(t) && !LINT_FIRST_RE.test(t) && !VALUE_WORDS_RE.test(t);
// sixth round: the label right before a key that asks WHO or WHAT STATUS ("Who", "Status", "Operator", "Run by",
// "Company", "Agency", "Agent", "Desk" …): the key reads as its answer ("Who — A licensed partner", "Status — Registration")
export const LABEL_WHO_RE = /(?<!\p{L})(?:who|whom|whose|status|statut|estado|stato|operators?|operated|run by|managed by|held by|owned by|company|firm|agency|agents?|brokers?|desks?)(?!\p{L})/iu;
// a reviewed follower (kind follower) may speak for us ("We confirm it before you sign") but never says that we hold,
// have or are on something
const LINT_HOLD_RE = /\b(?:holds?|has|have|had|got|obtained|owns?|granted|issued|carr(?:y|ies))\b|\b(?:is|are|am|we're)\s+(?:on|in|with|under|part\s+of)\b/i;
// the participle with no subject is the tenant's own only when its object is a tenant place
const TENANT_PLACE_RE = /^(?:Registered|Enrolled)\s+(?:at|with|on|in)\s+(?:the\s+)?(?:town hall|municipality|gemeente|padrón|Anagrafe|university)\b/i;
// the claim SHAPES the round-2 regexes knew, now a lint on the kinds that describe the lease, the tenant, the
// deposit, a listing, a heading or the law: a subject-free participle ("Registered with the Generalitat", "BOOM,
// licensed in Spain"), the agency adjective ("a licensed agency"), an agency + participle that does not land on Rome,
// a licence to operate, a membership of a register, a relative clause ("BOOM, which is licensed in Spain") and the
// nominal registration ("Registration with the Generalitat Valenciana")
const LINT_SHAPES = [
  ['a participle with no subject', new RegExp(String.raw`(?:^|[,—–:(]\s*)(?:fully\s+)?${LINT_PART}(?:\s+and\s+\w+)?\s+(?:in|with|by|under|as|at|on)\b`, 'i')],
  ['an agency + participle that does not land on Rome', new RegExp(String.raw`\b(?:agency|agencies|agents?|brokers?|intermediar(?:y|ies)|desk|company)\s+${LINT_PART}\s+(?:in|with|by|under|as|at)\b(?!\s+(?:the\s+)?Rome\b)`, 'i')],
  ['a licence to operate', /\b(?:licensed to|authori[sz]ed to|registered as|accredited as|certified as|approved as)\b(?:\W+\w+){0,4}?\W+(?:agents?|agency|brokers?|operate|broker|intermediar(?:y|ies))\b/i],
  ['a membership of a register', /\bmember of (?:the )?[\w ]{0,30}regist(?:er|ry)\b/i],
  ['the agency adjective', /\b(?!un|non)(?:[\w]+-)?(?:licensed|registered|accredited|authori[sz]ed|certified|regulated|approved|chartered|listed)\s+(?:(?!(?:with|by|in|at|on|to|through|via|as|an?|the|for|under)\b)[\w-]+\s+)?(?:real estate\s+)?(?:agency|agencies|agents?|brokers?|intermediar(?:y|ies))\b/i, 'noLaw'],
  ['a relative clause', new RegExp(String.raw`\b(?:which|who|that)\s+(?:is|are|was|has been)\s+(?:\w+\s+){0,2}${LINT_PART}\b`, 'i'), 'noLaw'],
  ['a nominal registration', /\bregistration\s+(?:with|in|at)\s+(?!(?:the\s+)?(?:town hall|municipality|gemeente|Agenzia delle Entrate|Anagrafe|padrón|BRP|(?:Dutch\s+)?register of persons|(?:your\s+|this\s+|that\s+)?(?:new\s+)?address|university)\b)/i, 'noLaw']
];
const SHAPE_KINDS = ['lease', 'tenant', 'deposit', 'listing', 'heading', 'law'];

const ENT = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', middot: '·', rsquo: '’', lsquo: '‘', ldquo: '“', rdquo: '”', mdash: '—', ndash: '–', hellip: '…', euro: '€', pound: '£', copy: '©', reg: '®', sect: '§', rarr: '→', larr: '←', times: '×', thinsp: ' ', ensp: ' ', emsp: ' ', shy: '\u00AD', zwsp: '\u200B', zwnj: '\u200C', zwj: '\u200D', ZeroWidthSpace: '\u200B', NoBreak: '\u2060', ordm: 'º', ordf: 'ª', deg: '°', aacute: 'á', eacute: 'é', iacute: 'í', oacute: 'ó', uacute: 'ú', ntilde: 'ñ', egrave: 'è', agrave: 'à', ograve: 'ò', ccedil: 'ç', uuml: 'ü', ouml: 'ö', auml: 'ä', szlig: 'ß' };
const ENT_LC = Object.fromEntries(Object.entries(ENT).map(([k, v]) => [k.toLowerCase(), v]));
const unescHtml = (s) => String(s).replace(/&(#x[0-9a-f]+|#\d+|[a-z][a-z0-9]*);/gi, (m, e) => {
  if (e[0] === '#') { const n = /^#x/i.test(e) ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10); return n > 0 && n < 0x110000 ? String.fromCodePoint(n) : m; }
  return ENT[e] ?? ENT_LC[e.toLowerCase()] ?? m;
});
// decoded, NFKC (fullwidth letters, ligatures), no format characters (U+00AD, U+200B–U+200F, U+2060, U+FEFF, bidi
// marks …) and no line/paragraph separators: what a reader sees, letter for letter. Eighth round: the ordinal º of "nº" /
// "N.º" stays, and the sign № reads "Nº" (NFKC makes them "o" and "No", the English word): a number abbreviation keeps its mark
export const cleanText = (s) => unescHtml(s).replace(/º/g, '\uE000').replace(/№/g, 'N\uE000').normalize('NFKC').replace(/\uE000/g, 'º').replace(/[\p{Cf}\u2028\u2029]/gu, '');
// the abbreviations whose final dot is part of the name ("Egidi Immobiliare S.r.l.")
const ABBR_END_RE = /(?:\bS\.r\.l|\bS\.p\.A|\bS\.L|\bS\.A|\bB\.V|\bN\.V|\bLtd|\bInc|\bCo)$/;
// one sentence as the allowlist stores it: whitespace collapsed, no leading ", " or dash, no trailing . ; · ,
// (a final "." that closes S.r.l., S.p.A., S.L., B.V., Ltd. stays)
export const normSentence = (s) => {
  const t = cleanText(s).replace(/\s+/g, ' ').replace(/\s+([.,;:!?)])/g, '$1').replace(/\(\s+/g, '(').trim().replace(/^(?:[,;·—–:]\s*)+/, '');
  const u = t.replace(/(?:\s*[.;·,])+$/, '').trim();
  return ABBR_END_RE.test(u) && t.slice(u.length).startsWith('.') ? `${u}.` : u;
};
// sentences: decoded and cleaned FIRST (so "&#101;" or "&shy;" is not split at its ";"), then . ! ? ; and a spaced ·.
// Never after the abbreviation of a number (fifth round): "Agent no. CV-1234", "Reg. 123456", "Lic. No. 4471", "n. 12",
// "Agent ref. CV-1234" stay one sentence — no., nr., n., núm., num., reg., regd., lic., ref., n.º, every letter in both cases
// (the upper-case "N." too since the sixth round: "Agent N. 1234"), the o of n.º lower case only — so the number shapes of
// the vocabulary see them whole. No i flag: "S.r.l. is" is not a split, and "as an agent. What" still is.
const NUM_ABBR_DOT = String.raw`(?<!\p{L})(?:[Nn][Oo]|[Nn][Rr]|[Nn]|[Nn][ÚúUu][Mm]|[Rr][Ee][Gg][Dd]?|[Ll][Ii][Cc]|[Rr][Ee][Ff]|[Nn]\.?[ºo°])\.`;
const SPLIT_RE = new RegExp(String.raw`(?<=[.!?])(?<!${NUM_ABBR_DOT})\s+(?=[A-Z0-9"“‘'(«¿¡])|[;\n]|\s+·\s*|\s*·\s+`, 'u');
const splitSentences = (t) => cleanText(t).split(SPLIT_RE).map(normSentence).filter(Boolean);
// the belt: a hit the sentences lost (a number shape or a name cut by the splitter). Hits are counted on the plain text
// and on its closed-up copy APART: the closed-up copy of a whole string differs from its sentences' when one holds "S.r.l."
const hitCount = (x) => [CLAIM_WORDS_RE, CLAIM_ABBR_RE, CLAIM_NUM_RE].reduce((n, re) => n + [...x.matchAll(re)].length, 0);
const lostHits = (t, parts) => {
  if (parts.length < 2) return false;
  const w = cleanText(t).replace(/\s+/g, ' '), plain = hitCount(w), closed = hitCount(closeUp(w));
  return (plain > 0 || closed > 0) && (plain > parts.reduce((n, p) => n + hitCount(p), 0) || closed > parts.reduce((n, p) => n + hitCount(closeUp(p)), 0));
};
// sixth round, the belt ACROSS blocks: a label and its value are two text blocks, and a number shape, a registration word or a
// register's initials split between them reads as one claim on the page ({dt "Agent no.", dd "CV-1234"}). A join is refused
// when its text has more vocabulary hits than its parts (on the text and on the closed-up copy, apart), or when a part
// before the last carries a NUMBER KEY and the last carries a code (numKeySplit: "What is your agent number in Valencia?" —
// "CV-1234."), or — seventh round — the other way round (a code before, the number key last: "CV-1234" — "Our agent number in
// Valencia."). The joins are (reviewSentences): every text block of four words or fewer with the next text block (a dt, a
// th, a check's legal label or title, a paper, a line ended by a <br> or a newline), and since the seventh round a block of
// ANY length that carries a number key ("Our agent number in Valencia", a how step's heading), or a code when the next block
// carries one; two lines of one block split by a <br> or a newline, whatever their length; a <summary> (a FAQ question, a
// check's legal label and title, without the lane number) with the first text block after it inside its <details> (the
// answer, the check's text) — since the seventh round with EVERY line of that block, a newline or a <br> inside the answer
// included; since the seventh round two consecutive blocks of lines (the lines a <br> or a newline joins) when one carries a
// number key and the other a code, whatever line each stands on; and the strings a reader takes together: a page's title and
// its description (the <title> and the meta description, og:title and og:description, twitter:title and twitter:description)
// and a JSON-LD node's name, serviceType or headline with its description (a Question with its answer). Since the eighth round
// the build's own indexes between two blocks (a span.tn code, a bare lane, question or step number) are skipped, so the blocks on
// either side are consecutive, and inside a <table> a row head that carries a number key or a code is joined with EVERY cell of
// its row. A refused join is rewritten, never listed: no allowlist entry clears it.
export function joinCut(parts) {
  const all = parts.join(' '), plain = hitCount(all), closed = hitCount(closeUp(all));
  if ((plain || closed) && (plain > parts.reduce((n, p) => n + hitCount(p), 0) || closed > parts.reduce((n, p) => n + hitCount(closeUp(p)), 0))) return 'hits';
  const value = parts[parts.length - 1], labels = parts.slice(0, -1);
  // seventh round: in either order — the code in a label and the number key in the value ("CV-1234" — "Our agent number in Valencia.")
  if ([...labels, labels.join(' ')].some((l) => numKeySplit(l, value) || numKeySplit(value, l))) return 'number';
  return null;
}
// block boundaries, plus the start of an instrument field (data-instr) or of a row's description (.dp); the END of
// an instrument field and the span.tn / span.tt labels are boundaries too (markInstr)
const BLOCK_RE = /<\/?(?:address|article|aside|blockquote|br|button|caption|cite|dd|details|dialog|div|dl|dt|fieldset|figcaption|figure|footer|form|h[1-6]|header|hr|label|legend|li|main|nav|noscript|ol|option|optgroup|p|section|select|summary|svg|table|tbody|td|text|textarea|tfoot|th|thead|title|tr|ul)\b[^>]*>|<[a-z][\w-]*\b[^>]*(?:\sdata-instr\b|\sclass="(?:dp|at|rc-at|ln|n|s|t|rc-t|tn|tt)")[^>]*>/gi;
// the inline tags a word can be split by: removed with NO space in the squashed copy
const INLINE_TAG_RE = /<\/?(?:span|b|i|em|strong|a|abbr|small|sup|sub|wbr|u|s|mark|q|time|data|bdi|bdo|ins|del|kbd|code|var|dfn)\b[^>]*>/gi;
// the END of an element carrying data-instr (or class tn/tt) is a boundary: a newline after its matching close tag
function markInstr(html) {
  const open = /<([a-z][\w-]*)\b[^>]*(?:\sdata-instr\b|\sclass="(?:tn|tt)")[^>]*>/gi;
  const ins = [];
  for (const m of html.matchAll(open)) {
    const tag = m[1].toLowerCase(), re = new RegExp(`<(/?)${tag}\\b[^>]*>`, 'gi');
    re.lastIndex = m.index + m[0].length;
    let depth = 1, x;
    while (depth && (x = re.exec(html))) { if (x[1]) depth--; else if (!/\/>$/.test(x[0])) depth++; if (!depth) ins.push(x.index + x[0].length); }
  }
  let out = '', i = 0;
  for (const p of [...new Set(ins)].sort((a, b) => a - b)) { out += html.slice(i, p) + '\n'; i = p; }
  return out + html.slice(i);
}
const jsonStrings = (v) => (typeof v === 'string' ? [v] : v && typeof v === 'object' ? Object.values(v).flatMap(jsonStrings) : []);
// seventh round: the JSON-LD strings a reader takes together (a node's name, serviceType or headline with its description; a
// Question's name with its acceptedAnswer's text)
const jsonPairs = (v) => {
  if (Array.isArray(v)) return v.flatMap(jsonPairs);
  if (!v || typeof v !== 'object') return [];
  const own = [];
  if (typeof v.description === 'string') for (const k of ['name', 'serviceType', 'headline']) if (typeof v[k] === 'string') own.push([v[k], v.description]);
  if (typeof v.name === 'string' && v.acceptedAnswer && typeof v.acceptedAnswer.text === 'string') own.push([v.name, v.acceptedAnswer.text]);
  return [...own, ...Object.values(v).flatMap(jsonPairs)];
};
// the attributes that never carry text a reader reads: everything else that holds a letter is reviewed
// (either quote style or none). meta content is read as "meta" on its own.
export const ATTR_SKIP = new Set(['href', 'src', 'srcset', 'class', 'id', 'style', 'd', 'viewbox', 'points', 'transform', 'rel', 'type', 'name', 'for', 'lang', 'hreflang',
  'width', 'height', 'fill', 'stroke', 'role', 'tabindex', 'target', 'method', 'action', 'autocomplete', 'inputmode', 'enctype', 'sizes', 'media', 'crossorigin', 'integrity',
  'loading', 'decoding', 'data-v', 'content', 'property', 'charset', 'http-equiv', 'as', 'fetchpriority', 'pattern', 'accept', 'form', 'list', 'dir', 'translate', 'spellcheck',
  'aria-hidden', 'aria-controls', 'aria-labelledby', 'aria-describedby', 'aria-live', 'aria-current', 'aria-expanded', 'aria-haspopup', 'aria-modal', 'aria-atomic', 'aria-busy', 'aria-invalid', 'aria-pressed', 'aria-checked', 'aria-disabled', 'aria-required', 'aria-owns', 'aria-orientation',
  'stroke-width', 'stroke-linecap', 'stroke-linejoin', 'stroke-dasharray', 'stroke-dashoffset', 'stroke-opacity', 'stroke-miterlimit', 'fill-rule', 'fill-opacity', 'clip-rule', 'clip-path', 'opacity',
  'cx', 'cy', 'r', 'rx', 'ry', 'x', 'y', 'x1', 'x2', 'y1', 'y2', 'dx', 'dy', 'offset', 'stop-color', 'stop-opacity', 'gradientunits', 'gradienttransform', 'preserveaspectratio', 'vector-effect', 'pathlength',
  'text-anchor', 'dominant-baseline', 'font-size', 'font-family', 'font-weight', 'letter-spacing', 'mask', 'filter', 'marker-end', 'marker-start', 'shape-rendering', 'paint-order', 'focusable', 'xlink:href', 'version', 'datetime', 'min', 'max', 'step', 'maxlength', 'minlength', 'nonce']);
const ATTR_RE = /\s([^\s"'=<>\/`]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;
export function reviewSentences(html, { joins: seenJoins } = {}) {
  const out = [], late = [];
  let block = 0;
  const add = (t, where, b = block++, flags = {}) => {
    const dest = /^(?:ld|json|script)$/.test(where) ? late : out, parts = splitSentences(t);
    for (const s of parts) dest.push({ text: s, where, block: b, ...flags });
    // the belt: the whole string has a hit its sentences lost → the whole string is refused (claimGuard: "cut")
    if (lostHits(t, parts)) dest.push({ text: normSentence(t), where, block: b, cut: true });
    // seventh round: a number key and a code in the same string, whatever stands between them (claimGuard: "ncut")
    if (numKeyCode(t)) dest.push({ text: normSentence(t), where, block: b, ncut: true });
  };
  // comments become a marker: a space in the spaced copy, nothing in the squashed copy
  const src = String(html).replace(/<!--[\s\S]*?-->/g, '\u0001');
  // seventh round: the strings a reader takes together — a page's title and its description (a search snippet: <title> and
  // meta description, og:title and og:description, twitter:title and twitter:description), a JSON-LD node's name, serviceType
  // or headline and its description, a Question and its answer — are read as a join too ("… agent no." — "CV-1234. …")
  const pairs = [];
  for (const m of src.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)) {
    if (/\ssrc=/i.test(m[1])) continue;
    if (/type=["']?application\/(?:ld\+)?json/i.test(m[1])) {
      let data; try { data = JSON.parse(m[2]); } catch { add(m[2], 'json'); continue; }
      const where = /ld\+json/i.test(m[1]) ? 'ld' : 'json';
      for (const v of jsonStrings(data)) add(v, where);
      for (const pr of jsonPairs(data)) pairs.push({ how: where, parts: pr });
    } else for (const s of m[2].matchAll(/"((?:[^"\\\n]|\\.)*)"|'((?:[^'\\\n]|\\.)*)'|`((?:[^`\\]|\\.)*)`/g)) add(s[1] ?? s[2] ?? s[3], 'script');
  }
  // <style> content strings ("content: '…'") are text a reader sees
  for (const m of src.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/gi)) for (const c of m[1].matchAll(/\bcontent\s*:\s*(?:"((?:[^"\\]|\\.)*)"|'((?:[^'\\]|\\.)*)')/g)) add(c[1] ?? c[2], 'style');
  const noScript = src.replace(/<script\b[\s\S]*?<\/script>/gi, ' ').replace(/<style\b[\s\S]*?<\/style>/gi, ' ');
  for (const m of noScript.matchAll(/<title>([\s\S]*?)<\/title>/gi)) add(m[1], 'title');
  const metaOf = new Map();
  for (const m of noScript.matchAll(/<meta\b[^>]*>/gi)) {
    let key = '', content;
    for (const a of m[0].matchAll(ATTR_RE)) {
      const name = a[1].toLowerCase(), v = a[2] ?? a[3] ?? a[4] ?? '';
      if (name === 'content') { content = v; add(v, 'meta'); } else if (name === 'name' || name === 'property') key = v.toLowerCase();
    }
    if (key && content !== undefined && !metaOf.has(key)) metaOf.set(key, content);
  }
  const headTitle = (/<head\b[\s\S]*?<title>([\s\S]*?)<\/title>/i.exec(noScript) || [])[1];
  for (const [a, b] of [[headTitle, metaOf.get('description')], [metaOf.get('og:title'), metaOf.get('og:description')], [metaOf.get('twitter:title'), metaOf.get('twitter:description')]]) {
    if (a !== undefined && b !== undefined) pairs.push({ how: 'meta', parts: [a, b] });
  }
  for (const m of noScript.matchAll(/<[a-z][\w:-]*\b[^>]*>/gi)) {
    for (const a of m[0].slice(m[0].search(/\s|>/)).matchAll(ATTR_RE)) {
      const name = a[1].toLowerCase(), v = a[2] ?? a[3] ?? a[4];
      if (v === undefined || ATTR_SKIP.has(name) || name.startsWith('xmlns') || !/\p{L}/u.test(cleanText(v))) continue;
      add(v, 'attr');
    }
  }
  const body = markInstr(noScript.replace(/<head\b[\s\S]*?<\/head>/i, ' '));
  // the lines are the text between block boundaries (as body.replace(BLOCK_RE, '\n').split('\n')), each with what opened it:
  // inside a <table> a line is a cell (only a <th> is a label there: a cell is the value of its row head, the hub's rules
  // table), and a span.tn is a code the build generates ("MIL 08", a paper's number), never a value of the copy
  const tables = [...body.matchAll(/<table\b[\s\S]*?<\/table>/gi)].map((m) => [m.index, m.index + m[0].length]);
  const cuts = [...body.matchAll(new RegExp(`${BLOCK_RE.source}|\\n`, 'gi')), { index: body.length, 0: '' }];
  let from = 0, opener = '';
  // the non-empty text lines, each with the cuts that separate it from the line before (the belt across blocks)
  const lines = [];
  let seps = [];
  for (const c of cuts) {
    const line = body.slice(from, c.index), at = from, tag = opener;
    from = c.index + c[0].length; opener = c[0];
    const flags = { ...(tables.some(([s, e]) => at > s && at < e) && { cell: true }), ...(/^<th\b/i.test(tag) && { th: true }), ...(/\sclass="tn"/i.test(tag) && { code: true }), ...(/^<br\b/i.test(tag) && { br: true }) };
    const spaced = line.replace(/\u0001/g, ' ').replace(/<[^>]+>/g, ' ');
    const b = block++;
    add(spaced, 'text', b, flags);
    // the squashed copy: inline tags and comments removed with no space ("Regis<span>tered</span>")
    const squashed = line.replace(/\u0001/g, '').replace(INLINE_TAG_RE, '').replace(/<[^>]+>/g, ' ');
    if (squashed !== spaced && claimHits(squashed).length > claimHits(spaced).length) for (const s of splitSentences(squashed)) if (hasClaimVocab(s)) out.push({ text: s, where: 'text', block: b, split: true });
    // seventh round: a number key and a code the inline tags kept apart ("Agent n<b>o.</b> in Valencia: CV-1234")
    if (squashed !== spaced && numKeyCode(squashed) && !numKeyCode(spaced)) out.push({ text: normSentence(cleanText(squashed)), where: 'text', block: b, split: true });
    const t = cleanText(spaced).replace(/\s+/g, ' ').trim();
    if (t) { lines.push({ t, b, at, seps, code: !!flags.code, i: lines.length }); seps = []; }
    seps.push(c[0]);
  }
  // the belt across blocks (sixth round): a label and its value, two lines of one block, a summary and its first block; since
  // the seventh round a label of any length with a number key, the reversed order, every line of the summary's block, the blocks
  // of lines, and the title/description and JSON-LD pairs
  const joins = [];
  const sameBlock = (l) => l.seps.every((x) => /^(?:<br\b[^>]*>|\n)$/i.test(x));
  // eighth round: the build's own indexes are no lines of the copy — a span.tn ("VLC 08", a paper's number) and a bare lane,
  // question or step number ("03") — and the two lines on either side of them are consecutive (a paper "Our agent number" and the
  // next paper "CV-1234"; a check's text ending on the key and the next check's legal label; an answer and the next question);
  // two lines stay one block when every cut between them, across the indexes, is a <br> or a newline
  const index = (l) => l.code || /^\d{1,2}$/.test(l.t);
  const seq = lines.filter((l) => !index(l));
  const joined = (a, n) => lines.slice(a.i + 1, n.i + 1).every(sameBlock);
  for (let k = 0; k + 1 < seq.length; k++) {
    const a = seq[k], n = seq[k + 1], line = joined(a, n);
    // seventh round: a block of ANY length is a label when it carries a number key ("Our agent number in Valencia" — "CV-1234"),
    // or a code when the next block carries a number key ("CV-1234 …" — "Our agent number in Valencia.")
    const key = NUM_KEY_RE.test(a.t) || (VALUE_NUM_RE.test(a.t) && NUM_KEY_RE.test(n.t));
    if (line || a.t.split(' ').length <= 4 || key) joins.push({ how: line ? 'line' : 'label', parts: [a.t, n.t], block: a.b });
  }
  for (const m of body.matchAll(/<summary\b[^>]*>[\s\S]*?<\/summary>/gi)) {
    // the head without the lane or question number ("05", "01": the build's own, aria-hidden)
    const e = m.index + m[0].length, head = lines.filter((l) => l.at > m.index && l.at < e && !/^\d{1,2}$/.test(l.t)), k0 = lines.findIndex((l) => l.at >= e);
    if (!head.length || k0 < 0 || /<\/details>/i.test(body.slice(e, lines[k0].at))) continue;
    // seventh round: the head with EVERY line of the first block after it, not only its first line (a newline or a <br> inside
    // the answer: "Do you have an agent number in Valencia?" — "Yes.⏎CV-1234.")
    let k1 = k0;
    while (k1 + 1 < lines.length && sameBlock(lines[k1 + 1])) k1++;
    for (let k = k0; k <= k1; k++) joins.push({ how: 'summary', parts: [...head.map((l) => l.t), ...lines.slice(k0, k + 1).map((l) => l.t)], block: head[0].b });
  }
  // seventh round: the lines a <br> or a newline joins make one block, and a number key in one block with a code in the next, in
  // either order, is a label and its value whatever line each stands on ({dt "Our agent number", dd "In Valencia:<br>CV-1234."});
  // two single-line blocks are already joined above (a label of four words or fewer, or one with a number key or a code)
  const groups = [];
  for (const l of seq) { const G = groups[groups.length - 1]; if (G && joined(G[G.length - 1], l)) G.push(l); else groups.push([l]); }
  // and a block of lines is one block: a number key and a code on any two of its lines ("Our agent number<br>in Valencia<br>CV-1234.")
  for (const G of groups) {
    if (G.length < 2 || G.some((l) => numKeyCode(l.t))) continue;
    const gt = G.map((l) => l.t).join(' ');
    if (numKeyCode(gt)) out.push({ text: normSentence(gt), where: 'text', block: G[0].b, ncut: true });
  }
  for (let g = 0; g + 1 < groups.length; g++) {
    if (groups[g].length < 2 && groups[g + 1].length < 2) continue;
    const gt = groups[g].map((l) => l.t).join(' '), ht = groups[g + 1].map((l) => l.t).join(' ');
    if (numKeySplit(gt, ht) || numKeySplit(ht, gt)) joins.push({ how: 'block', parts: [gt, ht], block: groups[g][0].b });
  }
  // eighth round: inside a <table> a row head (a <th scope="row">, or a <th> in a row of cells) that carries a number key or a
  // code is the label of EVERY cell of its row, not only of the first: the hub's rules table "Agent number" | "—" | "—" | "M-4471"
  for (const [s, e] of tables) {
    for (const r of body.slice(s, e).matchAll(/<tr\b[^>]*>[\s\S]*?<\/tr>/gi)) {
      const at = s + r.index;
      const cells = [...r[0].matchAll(/<(t[hd])\b([^>]*)>[\s\S]*?<\/\1>/gi)].map((c) => ({ th: /^th$/i.test(c[1]), attrs: c[2], from: at + c.index, to: at + c.index + c[0].length }));
      const inCell = (c) => seq.filter((l) => l.at >= c.from && l.at < c.to), hasTd = cells.some((c) => !c.th);
      for (const h of cells) {
        if (!h.th || /\bscope\s*=\s*["']?col/i.test(h.attrs) || !(/\bscope\s*=\s*["']?row/i.test(h.attrs) || hasTd)) continue;
        const hl = inCell(h), ht = hl.map((l) => l.t).join(' ');
        if (!ht || !(NUM_KEY_RE.test(ht) || VALUE_NUM_RE.test(ht))) continue;
        for (const c of cells) { const ct = c === h ? '' : inCell(c).map((l) => l.t).join(' '); if (ct) joins.push({ how: 'row', parts: [ht, ct], block: hl[0].b }); }
      }
    }
  }
  for (const j of joins) {
    j.cut = joinCut(j.parts);
    if (seenJoins) seenJoins.push(j);
    if (j.cut) out.push({ text: normSentence(j.parts.join(' ')), where: 'text', block: j.block, xcut: j.cut });
  }
  for (const j of pairs) {
    j.parts = j.parts.map((x) => cleanText(x).replace(/\s+/g, ' ').trim());
    j.cut = joinCut(j.parts);
    if (seenJoins) seenJoins.push(j);
    if (j.cut) late.push({ text: normSentence(j.parts.join(' ')), where: j.how, block: block++, xcut: j.cut });
  }
  return [...out.sort((a, b) => (a.where === 'text' ? 0 : 1) - (b.where === 'text' ? 0 : 1)), ...late];
}
const claimWhere = 'cities/_claims.json';
// what the company's, the partner's and the trade mark's lines may carry besides "regist…": removed, then nothing
// of the vocabulary may remain
const LINE_ALLOWED_RE = /(?<!\p{L})\p{L}*regist\p{L}*|\b(?:locally\s+)?licensed partners?\b(?:\s*\([^)]*\))?|\bRome Chamber of Commerce\b|\btrade ?mark\b/giu;
// the lint: a reviewed file cannot carry a claim
export function lintClaims(claims, where = claimWhere) {
  need(claims && typeof claims === 'object' && typeof claims.about === 'string' && claims.about.length > 80 && Array.isArray(claims.allowed), where, 'must be { "about": "<what this file is>", "allowed": [ { "text", "kind", "note" } ] }');
  const texts = claims.allowed.map((e) => e && e.text);
  for (const e of claims.allowed) {
    need(e && typeof e === 'object' && Object.keys(e).every((k) => ['text', 'kind', 'note'].includes(k)), where, `an entry has keys other than text, kind, note: ${JSON.stringify(e)}`);
    const t = e.text, at = `${where} "${String(t).slice(0, 90)}"`;
    need(typeof t === 'string' && t === normSentence(t) && t.length > 0, at, 'the text must be one sentence, normalised (single spaces, no trailing . ; · , no leading ", ")');
    // kind context: a sentence with NO vocabulary that stands next to the company's Rome line and names a desk place
    // (the place rule): reviewed so that the Rome registration is never continued elsewhere
    if (e.kind === 'context') {
      need(!hasClaimVocab(t), at, `kind context carries a registration, licence or authority word ("${claimHits(t)[0]}"): review it under its own kind`);
      need(PLACE_RE.test(t), at, 'kind context names a desk place: it is only for a sentence next to the company\'s Rome line (the place rule)');
      need(!CONTEXT_ADD_RE.test(t), at, `kind context: "${(t.match(CONTEXT_ADD_RE) || [])[0]}" adds to the Rome line (and, plus at the start; also, too, as well, since, office, branch, based, seat, headquarters anywhere): it cannot be reviewed`);
    } else if (e.kind === 'follower') {
      // kind follower: a plain sentence that stands next to a reviewed label (the label rule), reviewed so the label is
      // never continued by a claim; it may speak for us, nothing else of a value
      need(!hasClaimVocab(t), at, `kind follower carries a registration, licence or authority word ("${claimHits(t)[0]}"): review it under its own kind`);
      need(!PLACE_RE.test(t), at, `kind follower names a desk place ("${(t.match(PLACE_RE) || [])[0]}"): next to a label a place reads as where the label applies`);
      need(!VALUE_CODE_RE.test(t), at, `kind follower carries a number of three digits or a code ("${(t.match(VALUE_CODE_RE) || [])[0]}"): next to a label it reads as a registration number`);
      need(!VALUE_WORDS_RE.test(t), at, `kind follower says "${(t.match(VALUE_WORDS_RE) || [])[0]}": next to a label it reads as a yes, a date, a number, a file or a list`);
      need(!LINT_HOLD_RE.test(t), at, `kind follower: "${(t.match(LINT_HOLD_RE) || [])[0]}" — a follower never says that we hold, have or are on something`);
    } else need(hasClaimVocab(t), at, 'carries no registration or licence word: an entry only for the sentences the build reviews (remove it)');
    need(CLAIM_KINDS.includes(e.kind), at, `kind must be one of ${CLAIM_KINDS.join(', ')}`);
    need(typeof e.note === 'string' && e.note.trim().length >= 12, at, 'a note says why the sentence is not a claim that BOOM holds a registration, licence or membership outside Rome');
    const never = lintNever(t);
    need(!never, at, `names a register or a scheme no desk holds (${never}): it cannot be reviewed into the file`);
    need(!LINT_DRAFT_RE.test(t) || e.kind === 'law' || e.kind === 'partner', at, 'names the carte professionnelle or §34c outside a statement of the law or of the partner\'s licence (kinds law, partner)');
    const subj = LINT_CLAIM_RE.exec(t) || LINT_OURS_RE.exec(t);
    if (['lease', 'tenant', 'deposit', 'listing', 'heading'].includes(e.kind)) need(!subj, at, `kind ${e.kind}, but the company is the subject of a licence or registration ("${subj && subj[0]}"): that is a claim about us`);
    for (const [name, re, noLaw] of LINT_SHAPES) {
      if (!SHAPE_KINDS.includes(e.kind) || (noLaw && e.kind === 'law')) continue;
      const m = re.exec(t);
      need(!m || (e.kind === 'law' && (LINT_NEG_RE.test(t) || /\byou(?:r)?\b/i.test(t))) || (e.kind !== 'law' && name === LINT_SHAPES[0][0] && TENANT_PLACE_RE.test(t)), at, `kind ${e.kind}, but it has the shape of a claim (${name}: "${m && m[0]}")${e.kind === 'law' ? ' with no negation and no "you"' : ''}: if it is about us, it cannot ship`);
    }
    if (['listing', 'deposit'].includes(e.kind)) need(!LINT_FIRST_RE.test(t), at, `kind ${e.kind}, in the first person ("${(t.match(LINT_FIRST_RE) || [])[0]}"): a listing or a deposit line is about the home or the landlord, never about us`);
    if (e.kind === 'law') {
      // the agency adjective in a statement of the law is advice ("Only pay … to a registered letting agent"); with no
      // verb it is a label ("a licensed agency in Valencia"), and a label with a licence word is a claim
      const adj = LINT_SHAPES.find(([n]) => n === 'the agency adjective')[1].exec(t);
      need(!adj || LAW_VERB_RE.test(t), at, `kind law, the agency adjective ("${adj && adj[0]}") with no verb: a label, not a statement of the law`);
      need(!subj || LINT_NEG_RE.test(t), at, `kind law, with the company as subject ("${subj && subj[0]}") and no negation: a statement of the law about us says what we are NOT`);
      need(!LINT_FIRST_RE.test(t) || LINT_NEG_RE.test(t), at, `kind law, in the first person ("${(t.match(LINT_FIRST_RE) || [])[0]}") with no negation: a statement of the law names nobody of ours, or says what we are NOT`);
    }
    if (e.kind === 'company-rome' || e.kind === 'partner') {
      need(e.kind !== 'company-rome' || /\bRome\b|REA RM-1710623|Viale Liegi/.test(t), at, 'kind company-rome names Rome, REA RM-1710623 or Viale Liegi');
      for (const m of t.matchAll(/\bregist\w*/gi)) {
        const rest = t.slice(m.index + m[0].length), seat = rest.match(ROME_SEAT_RE);
        need(/\bRome-$/i.test(t.slice(Math.max(0, m.index - 6), m.index)) || !!seat, at, `kind ${e.kind}: "${m[0]}" does not land on Rome, REA RM-1710623 or Viale Liegi (only "in", "with", "the", "at", "of" between)`);
        const after = seat ? rest.slice(seat[0].length) : '';
        need(!PLACE_RE.test(after) && !ROME_AFTER_RE.test(after), at, `kind ${e.kind}: after Rome it names another place or adds one ("${(after.match(PLACE_RE) || after.match(ROME_AFTER_RE) || [])[0]}")`);
      }
      for (const m of t.matchAll(/\b(?:un)?licen[cs]\w*/gi)) need(e.kind === 'partner' && /^(?:\s+\w+){0,1}?\s+partners?\b/i.test(t.slice(m.index + m[0].length)), at, `kind ${e.kind}: "${m[0]}" — the company's line names its Rome registration only, a licence only as "a licensed partner"`);
      const left = t.replace(LINE_ALLOWED_RE, ' ');
      need(!hasClaimVocab(left), at, `kind ${e.kind} carries another licence, register or membership word ("${claimHits(left)[0]}")`);
      need(!subj || (e.kind === 'partner' && !LINT_CLAIM_RE.exec(t.replace(/\blicensed partners?\b/gi, 'partner'))) || e.kind === 'company-rome', at, `kind ${e.kind}: the company is the subject of a licence ("${subj && subj[0]}")`);
    }
    if (e.kind === 'partner') {
      need(/\blicensed partners?\b/i.test(t), at, 'kind partner names "a licensed partner"');
      // the partner holds the licence: carte professionnelle / §34c only in the parentheses right after "licensed partner",
      // and nobody "holds", "has" or "obtained" anything (the subject is the partner, the desk opens WITH it, or the law)
      need(!LINT_DRAFT_RE.test(t.replace(/\blicensed partners?\s*\([^)]*\)/gi, ' ')), at, 'kind partner: the carte professionnelle or §34c stands only in the parentheses right after "licensed partner"');
      need(!/\b(?:holds?|has|have|had|got|obtained|granted|owns?)\b/i.test(t), at, `kind partner: "${(t.match(/\b(?:holds?|has|have|had|got|obtained|granted|owns?)\b/i) || [])[0]}" — a partner line says the desk opens WITH a licensed partner, never who holds what`);
    }
    if (e.kind === 'trade-mark') {
      need(/\btrade ?mark\b/i.test(t), at, 'kind trade-mark names the trade mark');
      for (const m of t.matchAll(/\bregist\w*/gi)) need(/^(?:\s+\S+){0,6}?\s+trade ?mark\b/i.test(t.slice(m.index + m[0].length)), at, `kind trade-mark: "${m[0]}" does not land on the trade mark`);
      const left = t.replace(LINE_ALLOWED_RE, ' ');
      need(!hasClaimVocab(left), at, `kind trade-mark carries a licence, register or membership word ("${claimHits(left)[0]}")`);
    }
  }
  const sorted = [...texts].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  need(texts.every((t, i) => t === sorted[i]), where, 'the entries are sorted by text (code-unit order)');
  need(new Set(texts).size === texts.length, where, `a sentence is listed twice: "${texts.find((t, i) => texts.indexOf(t) !== i)}"`);
  return claims;
}
export function loadClaims(root = ROOT) {
  const f = path.join(root, CLAIMS_FILE);
  need(fs.existsSync(f), CLAIMS_FILE, 'is missing: every sentence about registration or licences is reviewed there (default deny)');
  let c; try { c = JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { throw new BuildError(`${CLAIMS_FILE}: ${e.message}`); }
  return lintClaims(c);
}
// the problems of one page: the unreviewed sentences, a word split by inline tags, a partner line on a desk that
// sells, a register a selling desk does not hold (checked on every sentence, allowlisted or not), and the context
// rules: next to the company's Rome line no other desk place unless reviewed (place), and a reviewed heading is
// followed by a reviewed sentence or by one with no desk place and no authority (heading)
export function claimProblems(html, { claims, sell = false } = {}) {
  const kind = new Map(claims.allowed.map((e) => [e.text, e.kind]));
  const out = [], seen = new Set();
  const all = reviewSentences(html);
  for (const s of all) {
    const key = `${s.where}|${s.text}|${s.split ? 1 : 0}|${s.cut ? 1 : 0}|${s.xcut ? 1 : 0}|${s.ncut ? 1 : 0}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const ban = sell ? sellHit(s.text) : null;
    if (ban) { out.push({ ...s, why: 'banned', hit: ban }); continue; }
    if (s.split) { out.push({ ...s, why: 'split' }); continue; }
    if (s.cut) { out.push({ ...s, why: 'cut' }); continue; }
    if (s.xcut) { out.push({ ...s, why: 'xcut' }); continue; }
    if (s.ncut) { out.push({ ...s, why: 'ncut' }); continue; }
    if (!hasClaimVocab(s.text)) continue;
    if (!kind.has(s.text)) out.push({ ...s, why: 'unreviewed' });
    else if (sell && kind.get(s.text) === 'partner') out.push({ ...s, why: 'partner' });
  }
  // the context rules
  const byBlock = new Map();
  for (const s of all) if (!s.split && !s.cut && !s.xcut && !s.ncut) byBlock.set(s.block, [...(byBlock.get(s.block) || []), s]);
  const blocks = [...byBlock.keys()].sort((a, b) => a - b);
  for (const b of blocks) {
    const list = byBlock.get(b);
    if (list.some((s) => ['company-rome', 'trade-mark'].includes(kind.get(s.text)))) {
      for (const s of list) if (!kind.has(s.text) && PLACE_RE.test(s.text)) out.push({ ...s, why: 'place', hit: s.text.match(PLACE_RE)[0] });
    }
  }
  // the label rule (fifth round): a reviewed sentence of four words at most ('Registration', 'Generalitat', 'INCASÒL',
  // '§34c GewO', of whatever kind) is a KEY, and what stands next to it reads as its value; each value must be reviewed or
  // neutral (neutralValue). In a block of short sentences (a dt, a check's legal label or title, a paper, a table's row
  // head, 'fianza · INCASÒL') the values are the block's other sentences, the blocks after it (labels of two words or
  // fewer are read through, a line after a <br> is the same value, the build's codes are skipped) and, outside a table,
  // the block right before it when that is a label too (a check's legal label stands before its title). Inside prose
  // ("… Registration. Yes, since 2026."), or in a meta, JSON-LD or attribute string, the values are the sentences after the
  // key, to the first of more than two words (a key that ends a text block reads on into the next blocks). Inside a table
  // only a <th> holds keys: a cell is the value of its row head.
  const words = (t) => t.split(' ').length;
  const short = (l) => l.every((s) => words(s.text) <= 4);
  const text = blocks.filter((b) => byBlock.get(b)[0].where === 'text').map((b) => byBlock.get(b));
  const after = (i, value) => {
    for (const [j, nx] of text.slice(i + 1).entries()) {
      if (nx[0].code) continue;
      value(nx);
      const next = text[i + 2 + j];
      if (nx.some((s) => words(s.text) > 2) && !(next && next[0].br)) break;
    }
  };
  for (const b of blocks) {
    const list = byBlock.get(b), isText = list[0].where === 'text', i = isText ? text.indexOf(list) : -1;
    if (list[0].code || (list[0].cell && !list[0].th)) continue;
    const keys = list.flatMap((s, k) => (kind.has(s.text) && words(s.text) <= 4 ? [k] : []));
    if (!keys.length) continue;
    const hit = keys.map((k) => list[k].text).join(' · '), own = keys.length === 1 ? list[keys[0]] : null;
    // sixth round: a reviewed value is a follower or a sentence of more than four words; a reviewed sentence of four words
    // or fewer is a key itself, and next to another key it composes a claim neither was reviewed for ('Registration' —
    // 'Generalitat'): only the key itself is accepted in its own block, and two keys in one block are each refused
    const value = (l) => {
      for (const s of l) {
        if (s === own) continue;
        if (kind.has(s.text) ? kind.get(s.text) === 'follower' || words(s.text) > 4 : neutralValue(s.text)) continue;
        out.push({ ...s, why: kind.has(s.text) ? 'pair' : 'label', hit });
      }
    };
    if (short(list)) {
      value(list);
      if (!isText) continue;
      const prev = text[i - 1];
      if (prev && !list[0].cell && !prev[0].code && short(prev)) {
        value(prev);
        // a label that asks who, or what status, makes the key its answer ('Who' — 'A licensed partner')
        for (const s of prev) if (LABEL_WHO_RE.test(s.text) && !kind.has(s.text)) out.push({ ...s, why: 'pair', hit });
      }
      after(i, value);
    } else for (const k of keys) {
      // in prose: the sentences after the key, to the first of more than two words; a key that ends its block reads on
      for (let m = k + 1; m < list.length; m++) { value([list[m]]); if (words(list[m].text) > 2) break; }
      if (k === list.length - 1 && isText) after(i, value);
    }
  }
  return out;
}
export function claimGuard(html, { claims, sell = false }, where) {
  const bad = claimProblems(html, { claims, sell });
  // one line per sentence, with every place it stands (text, meta, ld, attr, script, style)
  const group = (list) => [...list.reduce((m, p) => m.set(p.text, [...(m.get(p.text) || []), p.where]), new Map())].map(([text, w]) => ({ text, where: [...new Set(w)].join(', '), hit: (list.find((p) => p.text === text) || {}).hit }));
  const say = (p) => `"${p.text}" (${p.where})`;
  const of = (why) => group(bad.filter((p) => p.why === why));
  const ban = of('banned'), part = of('partner'), split = of('split'), ncut = of('ncut'), cut = of('cut'), place = of('place'), label = of('label'), pair = of('pair'), xcut = of('xcut'), unrev = of('unreviewed');
  need(!ban.length, where, `a desk that sells names a register or a licence it does not hold (${ban.map((p) => p.hit).join(', ')}): ${ban.map(say).join(' | ')} — it cannot ship`);
  need(!part.length, where, `"a licensed partner" is the wording of a desk that is not open (kind partner): a desk that sells cannot say it: ${part.map(say).join(' | ')}`);
  need(!split.length, where, `a registration or licence word is split by inline tags or comments (it reads as one word on the page): ${split.map(say).join(' | ')} — write the word whole, and review the sentence`);
  need(!cut.length, where, `a registration or licence word, a register's initials or a number shape is split by the sentence splitter (on the page it reads as one claim): ${cut.map(say).join(' | ')} — write it as one sentence, and review it`);
  need(!place.length, where, `next to the company's Rome line, a sentence names another desk place (${place.map((p) => p.hit).join(', ')}) and is not reviewed: ${place.map(say).join(' | ')} — the Rome registration cannot be continued elsewhere; if it is not about the company, add it to ${CLAIMS_FILE}`);
  need(!label.length, where, `next to the reviewed label (${[...new Set(label.map((p) => `"${p.hit}"`))].join(', ')}), a sentence is not reviewed and reads as its value (it names a desk place, an authority, a number or a code, speaks for us, or says yes, since, number, file, list, active, valid, done, ✓…): ${label.map(say).join(' | ')} — if it does not complete a claim that BOOM or the company holds a registration, licence or membership outside Rome, add it to ${CLAIMS_FILE} with its kind (follower for a plain sentence) and a note; if it does, it cannot ship`);
  need(!pair.length, where, `next to the reviewed label (${[...new Set(pair.map((p) => `"${p.hit}"`))].join(', ')}), another reviewed label of four words or fewer, or a label that asks who or what status, reads as its value — two labels make a claim neither was reviewed for: ${pair.map(say).join(' | ')} — a true value next to a reviewed label is a sentence of more than four words or a kind follower; if the two say that BOOM or the company holds a registration, licence or membership outside Rome, it cannot ship`);
  need(!xcut.length, where, `a registration or licence word, a register's initials or a number shape is split between a label and its value (on the page they read as one claim): ${xcut.map(say).join(' | ')} — if it does not say that BOOM or the company holds a registration, licence or membership outside Rome, rewrite the label or the value so they no longer read as one; if it does, it cannot ship`);
  need(!unrev.length, where, `${unrev.length} sentence(s) about registration or licences not reviewed in ${CLAIMS_FILE}: ${unrev.map(say).join(' | ')} — if it does not say that BOOM or the company holds a registration, licence or membership outside Rome, add it to ${CLAIMS_FILE} with its kind and a note; if it does, it cannot ship`);
  // seventh round, last: what no rule above caught — a number key and a code in one block or string (a word, a sentence, a line or a separator between them)
  need(!ncut.length, where, `a number key (agent no., agency number, registration ID, número de agente …) and a code (upper-case letters and three digits or more, or four digits or more) stand in one block or string (on the page the code reads as that number): ${ncut.map(say).join(' | ')} — if it does not say that BOOM or the company holds a registration, licence or membership outside Rome, rewrite the string so the code no longer reads as that number; if it does, it cannot ship`);
}

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
// optional {homeCity} {esDesks} {gbpDesks} {signDesks}. Returns null when the string uses
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

export function renderHub({ template, shared, hub, cities, assetVersion, frags, root = ROOT, weigh = true, europe = null, claims = null }) {
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
  htmlFieldGuard(hub, where);
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
    homeCity: home ? home.city : '', esDesks: listJoin(es.map((c) => c.city)), gbpDesks: listJoin(gbp.map((c) => c.city)),
    // v1.8 (H1, H9): the live desks that charge at signing (CITY_MARKETS.<slug>.chargeAt), named where the timing differs
    signDesks: listJoin(live.filter(isSigning).map((c) => c.city))
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

  // ── the map's geometry (v1.7, the Horizon): the same camera, arcs and labels as every desk page ──
  const HZ = horizon(shared.rome.geo, cities, europe);
  const hubXY = HZ.hub;
  const arcs = live.map((c) => ({ key: c.iata, slug: c.slug, to: HZ.cam.xy(c.geo), d: HZ.arcs.get(c.iata).d }));
  const offs = drafts.filter((c) => c.iata && c.geo).map((c) => ({ key: c.iata, to: HZ.cam.xy(c.geo) }));
  {
    const bad = hzViolations(arcs, [...arcs.map((a) => ({ key: a.key, xy: a.to, r: ARC_DOT_R })), ...offs.map((o) => ({ key: o.key, xy: o.to, r: ARC_DOT_R }))]);
    need(!bad.length, where, `the hub map draws an arc over a desk: ${bad.join('; ')}`);
  }
  // a pin is a 44px target where it is one — from 600px with a mouse (HUB_MAP_PX: the
  // map drawn 566px wide at 600, 559 at 940) — and no two live desks' pins may overlap
  // there; under 600px the map box is the one target (v1.8 option (b), spec D12)
  for (const [w, px] of Object.entries(HUB_MAP_PX)) {
    const unit = px / HZ.view[2];
    for (const x of arcs) for (const y of arcs) if (x.key < y.key) {
      const d = Math.hypot(x.to[0] - y.to[0], x.to[1] - y.to[1]) * unit;
      need(d >= 44, where, `the map's pins for ${x.key} and ${y.key} are ${d.toFixed(1)}px apart at ${w}px, where a pin is its own target: they overlap (44px targets)`);
    }
  }

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
      '          <td class="db-city" role="cell"><a class="db-go" href="/">Rome</a></td>',
      '          <td class="db-st c-w" role="cell" data-instr>HUB</td><td class="db-t c-w" role="cell"></td><td class="db-now c-w" role="cell"></td><td class="db-fare c-w" role="cell"></td>',
      '          <td class="db-gate" role="cell" aria-hidden="true"><span class="db-pill">Go to BOOM Rome <i>→</i></span></td>',
      '        </tr>'
    ].join('\n')
  ];
  const boardHtml = [
    '      <div class="dboard-w quadro"><i class="tacca"></i>',
    '        <p class="db-h" aria-hidden="true"><b>BOOM · DESKS</b><span class="pill-st js" id="hubPill" data-nosnippet hidden><i class="dot"></i><span>Desks open</span></span></p>',
    '        <table class="dboard" id="dboard" role="table" aria-label="BOOM desks" data-instr>',
    '          <thead data-instr><tr role="row"><th scope="col" role="columnheader">Code</th><th scope="col" role="columnheader">Desk</th><th scope="col" class="c-w" role="columnheader">Status</th><th scope="col" class="c-w" role="columnheader">Desk time</th><th scope="col" class="c-w" role="columnheader">Now</th><th scope="col" class="c-w" role="columnheader">Fares</th><th scope="col" role="columnheader"><span class="sr">Desk page</span></th></tr></thead>',
    '          <tbody>',
    ...boardRows,
    '          </tbody>',
    '        </table>',
    '      </div>'
  ].join('\n');

  // ── the map (v1.7, the Horizon) ──
  const kOf = (a) => a.key.toLowerCase();
  const svg = hzSvg(HZ, { page: 'hub', live: live.map((c) => c.iata), cal: hzCal(live) });
  // a pin (≥ 44px, a real link) on each live desk's dot; its card says the desk's clock, window and fare
  const pins = live.map((c) => {
    const [x, y] = HZ.cam.xy(c.geo);
    const [vx, vy, vw, vh] = HZ.view, px = Math.round((x - vx) / vw * 1000) / 10, py = Math.round((y - vy) / vh * 1000) / 10;
    return `<a class="pin${px > 60 ? ' pc-l' : ''}" id="pin-${c.iata.toLowerCase()}" href="/${esc(c.slug)}" style="--x:${px.toFixed(1)}%;--y:${py.toFixed(1)}%" aria-label="Tenant-side rental agent in ${esc(c.city)}">`
      + '<i class="pin-dot" aria-hidden="true"></i>'
      + `<span class="pc" aria-hidden="true"><span class="pc-h"><b>${esc(c.iata)}</b> ${esc(c.city)} · Live<span class="pc-t" data-nosnippet data-clk="${esc(c.slug)}"></span></span><span class="pc-w" data-nosnippet data-dw="${esc(c.slug)}">${esc(deskHoursText(c.desk))}</span><span class="pc-f">from ${fromOf(c)}${optOf(c)}</span><span class="pc-go">Go to the ${esc(c.city)} desk →</span></span></a>`;
  });
  // one rule per live desk: its pin (hovered, focused, or tapped once on a phone: .sel) lights its arc;
  // the plane that flies it is assets/boom-map.js's
  const mapCss = '<style>' + arcs.map((a) => `.hmap:has(#pin-${kOf(a)}:is(:hover,:focus-visible,.sel)) #arc-${kOf(a)}{stroke:var(--gold);stroke-width:2;opacity:1}`).join('') + '</style>';
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
    `          <figcaption class="m-legend" aria-hidden="true">${HZ_KEY}</figcaption></figure>`,
    '        <div class="m-rail">',
    romeCard,
    homeCard,
    '        </div>',
    '      </div>'
  ].filter(Boolean).join('\n');

  // ── the fares ──
  const fr = hub.fares;
  const spain = fr.spain ? Topt(fr.spain, 'fares.spain note') : null;
  // v1.8 (H1): the fares are the same at every desk, the TIMING is not — the desks that charge at signing are named
  // before the first price. With no live desk charging at signing (since 06/11/2026) the note has nothing to say:
  // silently absent, never a warning (a warning is for an item that should be there)
  const signNote = fr.signing && tok.signDesks ? Topt(fr.signing, 'fares.signing note') : null;
  const gbpDesk = gbp.length ? `at the ${listJoin(gbp.map((c) => c.city))} desk${gbp.length > 1 ? 's' : ''}` : '';
  // the upgrade credit (api/_upgrade.js): the hub says it under the plan it
  // starts from only while EVERY live desk offers it — one desk charging at
  // signing and the sentence would be false there, so the hub stays silent
  const hubUps = live.every((c) => upgradesOf(c).length > 0) ? upgradesOf(live[0]) : [];
  // …with the window most desks give, and the desks whose credit has no
  // deadline (upgradeDaysOf: Berlin) named in brackets: the window is not theirs
  const hubUpLine = (up) => {
    const of = (c) => upgradesOf(c).find((u) => u.from === up.from);
    const days = (live.map(of).find((u) => u && u.days) || {}).days || null;
    const open = days ? live.filter((c) => !of(c).days).map((c) => c.city) : [];
    return upgradeHubLine(up.toLabel, days, listJoin(open));
  };
  const tickets = plans.map((p) => {
    const hp = fr.plans[p.id];
    const up = hubUps.find((u) => u.from === p.id);
    authored.push(hp.who, ...hp.lines);
    return [
      `        <li class="hft" id="hf-${esc(p.id)}">`,
      `          <p class="hft-band" data-instr>${esc(p.label)}</p>`,
      `          <p class="hft-who">${esc(hp.who)}</p>`,
      `          <p class="hft-price"><b>${money(p.price, 'EUR')}</b><span>${esc(p.condition)}</span></p>`,
      gbpDesk ? `          <p class="hft-gbp">${money(p.price, 'GBP')} ${esc(gbpDesk)}</p>` : '',
      `          <ul class="hft-inc">${hp.lines.map((l) => `<li>${esc(l)}</li>`).join('')}</ul>`,
      p.id === 'full-search' ? `          <p class="refund">${esc(shared.refund.rule)}</p>` : up ? `          <p class="refund">${esc(hubUpLine(up))}</p>` : '',
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
  // v1.8 stage W: the strip's 14-day item links the online withdrawal
  // function (Dir. 2023/2673, CRD art. 11a) — at every desk, from the day of
  // the order; the model form stays on that page and in the fact sheet
  need(strip.some((li) => li.includes(`<a class="lnk" href="${WITHDRAWAL_PATH}#online">`)), where,
    `fares.strip links the online withdrawal function (an item with href "${WITHDRAWAL_PATH}#online"): the way to withdraw at every desk, from the day of the order`);
  const gates = T(fr.gates);
  authored.push(T(fr.eb), T(fr.h2), T(fr.h2g), gates);
  if (spain) authored.push(spain);
  if (signNote) authored.push(signNote);
  const faresHtml = [
    `      <p class="eb" data-instr>${esc(T(fr.eb))}</p>`,
    `      <h2 id="faresH2">${esc(T(fr.h2))} <span class="g">${esc(T(fr.h2g))}</span></h2>`,
    spain ? `      <p class="hnote es">${esc(spain)}</p>` : '',
    signNote ? `      <p class="hnote sign">${esc(signNote)}</p>` : '',
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
      // v1.8 (H6): the country alone — the home desk's "same law as BOOM Rome" tag is cut (the board keeps
      // "ITALIAN LAW · AS ROME", the founder's decision of 03/11, D13)
      return `${esc(COUNTRY_NAME[cc])}`;
    }
    const ks = c.checks.items.filter((k) => row.ids.includes(k.id));
    // v1.8 (H6): no place name beside a reviewed label ("Not one of the <City> checks" read as a claim to review)
    if (!ks.length) return '<span class="rc none" aria-hidden="true">—</span><span class="sr">Not checked at this desk</span>';
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
  authored.push(T(ru.eb), T(ru.h2), T(ru.h2g), T(ru.note), T(ru.caption), ...(ru.heldNote ? [T(ru.heldNote)] : []), ...rows.map((r) => T(r.head)));
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
    anyHeld && ru.heldNote ? `      <p class="r-held">${esc(T(ru.heldNote))}</p>` : '',
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
    withdrawal: () => `14 days from your order. Work starts inside them only if you ask: the “Start now” tick at checkout, or later in writing. <a class="lnk" href="${WITHDRAWAL_PATH}#online">Withdraw online</a> or with the <a class="lnk" href="${WITHDRAWAL_PATH}">model form</a>.`,
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
    `        <div class="f-co"><h3>Company</h3><p><a href="/buy-property-europe">Buy property</a></p><p><a href="/moving-budget">Moving budget</a></p><p>${esc(e.legalName)}</p><p>${esc(e.address)}</p><p>Registered office: ${esc(e.registeredOffice)}</p><p>P.IVA ${esc(e.vat)} · REA ${esc(e.rea)}</p></div>`,
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
    ...(assetVersion && assetVersion.onda ? { ONDA: `/assets/boom-onda.js?v=${assetVersion.onda}` } : {}),
    // v1.7: the Horizon's script, injected when the map nears the screen
    ...(assetVersion && assetVersion.map ? { MAP: `/assets/boom-map.js?v=${assetVersion.map}` } : {})
  };
  const rome = shared.rome;
  const rating = `${esc(rome.rating)} on Google in Rome, ${esc(rome.reviews)} reviews`;
  // the H1 reads the board word once, in words ("Europe")
  const wordTitle = hub.hero.word.charAt(0) + hub.hero.word.slice(1).toLowerCase();
  const data = {
    meta, pageUrl, ogImage, assetVersion,
    robotsMeta: '<meta name="robots" content="index, follow, max-image-preview:large, max-snippet:-1">',
    jsonLdBreadcrumb: ldJson(breadcrumb),
    jsonLd: ldJson(graph),
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
  // v1.7: the static map never carries the night (the terminator moves with the hour: only boom-map.js draws it)
  need((html.match(/<g class="hz-nite"><\/g>/g) || []).length === 1 && !/hz-term|<image\b/.test(html), where, 'the map is served with its night layer empty: the terminator moves with the hour, only assets/boom-map.js draws it');

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
    {
      // v1.8 (H1): the desks that charge at signing are named before the first price, exactly those, and only when there is one
      const sd = live.filter(isSigning);
      const fa = sliceOf(html, '<section class="sec" id="fares"', '</section>');
      const note = fa.indexOf('class="hnote sign"'), first = fa.search(/[€£]\d/);
      need(sd.length ? note > -1 && note < first && listJoin(sd.map((c) => c.city)) === tok.signDesks && (signNote || '').includes(tok.signDesks) : note < 0, where,
        'the signing note names exactly the live desks that charge at signing, before the first price in #fares (and exists only with one)');
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
    // the upgrade credit is the server's sentence here too (api/_upgrade.js): the hub's own line under the plan
    // it starts from, and each desk's fact inside its Offer — never a window or a door typed by hand
    let rest = html;
    for (const t of [...hubUps.map((u) => hubUpLine(u)), ...live.flatMap((c) => upgradesOf(c).map((u) => upgradeFact(u.fromLabel, u.toLabel, u.days)))]) rest = rest.split(esc(t)).join(' ').split(t).join(' ');
    const stray = rest.match(/[^.<>"]{0,60}\bcredited\b[^.<>"]{0,60}/i);
    need(!stray, where, `the hub says "credited" outside the server's own sentences (api/_upgrade.js): "${stray ? stray[0].trim() : ''}"`);
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
    const file = (f) => servedGz(root, f);
    const page = gzLen(html), css = file('assets/boom-desks.css'), js = file('assets/boom-desks.js'), map = file('assets/boom-map.js');
    // v1.7: the map's script (on view) is in the total and capped on its own
    const total = page + css + js + map + file('assets/boom-city.css') + file('assets/boom-onda.js') + file('js/boom-consent.js') + file('js/boom-track.js');
    weight = { totalKb: total / 1024, pageKb: page / 1024, cssKb: css / 1024, jsKb: js / 1024, mapKb: map / 1024 };
    need(weight.mapKb <= MAP_KB, where, `assets/boom-map.js is ${weight.mapKb.toFixed(1)} KB gzipped, over the ${MAP_KB} KB of the map on view`);
    need(weight.totalKb <= HUB_WEIGHT_KB.total, where, `first-party weight ${weight.totalKb.toFixed(1)} KB gzipped, over ${HUB_WEIGHT_KB.total}`);
    need(weight.pageKb <= HUB_WEIGHT_KB.page, where, `desks.html is ${weight.pageKb.toFixed(1)} KB gzipped, over ${HUB_WEIGHT_KB.page}`);
    need(weight.cssKb <= HUB_WEIGHT_KB.css, where, `assets/boom-desks.css is ${weight.cssKb.toFixed(1)} KB gzipped, over ${HUB_WEIGHT_KB.css}`);
    need(weight.jsKb <= HUB_WEIGHT_KB.js, where, `assets/boom-desks.js is ${weight.jsKb.toFixed(1)} KB gzipped, over ${HUB_WEIGHT_KB.js}`);
  }
  // every sentence about registration or licences, the full sheet's included, is reviewed (cities/_claims.json), last
  claimGuard(html, { claims: claims || loadClaims(root) }, where);
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
  // Stage 0: the ?v= versions are the hashes of the EMITTED assets (sources in assets/src/)
  const assetVersion = assetVersionOf(root, { hub: true });
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
  // Stage 0: the ?v= versions are the hashes of the EMITTED assets (sources in
  // assets/src/); the onda is weighed in every page and versioned in its URL;
  // the hub's own files (BOOM Desks) are hashed when they exist — the desk
  // pages do not read them
  const assetVersion = assetVersionOf(root);
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
  // the coast under every network map (optional: design/pages-deco/genera-europa.mjs → cities/_europe.json, degrees)
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
  emitAssets({ root, check });   // Stage 0: the served assets first — the pages hash and weigh them
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
    for (const a of emitAssets({ check })) {
      if (check && a.stale) { stale++; console.error(`✗ ${a.file} is stale — it is not ${a.src} without its comments; run: npm run build:cities`); continue; }
      console.log(`${check ? '✓ up to date' : a.written ? '✓ emitted  ' : '✓ unchanged'}  ${a.file}  ·  ${a.gzKb.toFixed(1)} KB gz served (${a.sourceGzKb.toFixed(1)} KB with its comments in ${a.src})`);
    }
    for (const p of writeAll({ check })) {
      if (check && p.stale) { stale++; console.error(`✗ ${p.file} is stale — run: npm run build:cities`); continue; }
      if (p.mode === 'hub') console.log(`${check ? '✓ up to date' : '✓ built'}  ${p.file}  ·  HUB  ·  ${p.words} words at load (prose ${p.prose} · instr ${p.instr}; ${Object.entries(p.sections).map(([k, v]) => `${k} ${v}`).join(' · ')})  ·  ${p.weight.totalKb.toFixed(1)} KB gz (page ${p.weight.pageKb.toFixed(1)} · css ${p.weight.cssKb.toFixed(1)} · js ${p.weight.jsKb.toFixed(1)} · map on view ${p.weight.mapKb.toFixed(1)})`);
      else console.log(`${check ? '✓ up to date' : '✓ built'}  ${p.file}  ·  ${p.live ? 'LIVE' : 'draft (noindex)'}  ·  mode ${p.mode}  ·  ${p.words} words at load (prose ${p.prose} · instr ${p.instr})  ·  ${p.weight ? p.weight.totalKb.toFixed(1) + ' KB gz (js ' + p.weight.jsKb.toFixed(1) + ' · css ' + p.weight.cssKb.toFixed(1) + ' · onda ' + p.weight.ondaKb.toFixed(1) + ' · map on view ' + p.weight.mapKb.toFixed(1) + ')' : ''}`);
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
