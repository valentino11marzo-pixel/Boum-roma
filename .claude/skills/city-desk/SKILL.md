---
name: city-desk
description: Launch or change a BOOM city desk (tenant-side search page with card checkout, like /london, /milan, /madrid). Use when the user asks to open a new city, take a desk live, change a desk's prices, currency, holidays or copy.
---

# Launching a BOOM city desk

A desk is DATA plus a registry entry: `cities/<slug>.json` → `build-cities.mjs` → `/<slug>.html`, and `api/_market.js` `CITY_MARKETS.<slug>` for the server (lead door, Stripe, webhook, Telegram card). Read CLAUDE.md «BOOM Cities» (v1.6 «il desk aviazione completo») and «BOOM Desks» (the hub, `/desks`) first. The build refuses anything false or off-budget: let it tell you what is missing.

A new desk is never one page: the hub `/desks` and every other desk's Network map are built from the same JSONs, so they change with it (see §5b).

## 1 · Decide (write the decisions down before coding)
- slug (English: `london`, `milan`), label = JSON `city` exactly, Italian label for operator strings (`labelIt`)
- currency (EUR default; non-EUR needs `currency` in CITY_MARKETS **and** the JSON), prices (the grid is 500 / 199 / 149 in the desk's currency)
- mode `search` (sells, checkout) or `waitlist` (no till, no Stripe)
- desk hours and zone: `desk.timeZone` (IANA; `Europe/Milan` does not exist → `Europe/Rome` + `desk.zoneName`), the holidays key
- the map: `iata` (3 capital letters, the airport-style code the boards and the map print) and `geo` `{lat, lon}`, the city's real coordinates. `validGeo` keeps a desk inside the network map's margins (about lon −10.8…20.8, lat 39.4…54.1): a city outside (Lisbon, Stockholm, Athens) needs the crop changed first — `mapXY`, the hub `HUB_VIEWBOX`, and `cities/_europe.json` regenerated (`python3 design/pages-deco/genera-europa.py`)
- the desk's country (`country`, ISO upper) and whether it is the home country (Italy = same Italian rules as Rome, still a desk: derived, never a key)
- legal checklist to hand the founder (see «Known open items»)

## 2 · Server registry — `api/_market.js`
- `CITY_MARKETS.<slug>`: `label, labelIt, flag, country (ISO lower), holidays, currency, hoursEn, url, mode, checkout, plans: CITY_PLANS` (ONE shared plans object; `eur` = the amount in the desk's currency)
- phones: `DIAL` + a `nationalOf` branch for the country (keep the trunk 0 where E.164 keeps it, e.g. Italy; refuse shapes of other countries)
- `cityFromText` aliases come from `label` + `labelIt` automatically

## 3 · Calendar — `js/desk-calendar.js`
- add a key with `fixed`, `easter` (always an array), and the rules the country needs (`mondays`, `weekdays` for substitute days; `dated` = YYYY-MM-DD for a holiday decreed for ONE year only, e.g. Valencia's 24/6/2026); Italy is always unioned (the desk answers from Rome)
- a regional desk names its OWN key (`es-bcn`, `es-vlc`, `it-mi`, `gb-eng`) in `CITY_MARKETS.<slug>.holidays`: the country default (`es`) is Madrid's calendar and passes the "calendar exists" test silently — a wrong key is a wrong withdrawal date, not a failing build
- the file is inlined in every city page: keep it small, no `/*` inside strings
- pin every date for three years in `tests/cities/calendar.mjs`

## 4 · The page — `cities/<slug>.json`
- copy the key structure of a selling desk: a Spanish desk copies `cities/madrid.json` (the build enforces the ES rules on `country: "ES"`: "Optional, chosen in writing" before any price, the must-state verbatim, "Who pays the agent · LAU art. 20" as the first check), any other desk `amsterdam.json`; add `currency` if not EUR
- facts only from sources; no statistics, no market rents, no amounts other than the three plan prices (deposits in weeks/months of rent); banned phrases live in `tests/verita` and `build-cities.mjs` (CLOCK_RE, off-market, 500+, exclamation marks, a second rating)
- 3–6 checks (the local law that protects the tenant; each `{id, title, at, text}`, `at` is the short legal label the hub table prints verbatim), exactly 8 papers, 3–6 FAQ including the free call and the refund rule
- the Departures steps carry a `status` each (`how.steps[i].status`: capitals, ≤ 12 characters, STATUS_RE; no SEAT/BOARDING/ON TIME/GATE/NOW words). Selling desks: `FREE`, `1 WORK DAY`, `IN PERSON`; waitlist desks: `FREE`, `WITH PARTNER`, `AT OPENING`
- v1.6 budgets (raised once by the founder on 03/11, never raised to fit): ≤ 640 visible words at load (prose ≤ 520, instruments ≤ 120 — the text inside `[data-instr]`), a text node ≤ 24 words, first phone screen ≤ 150, lead+leadStrong ≤ 30, fares ≤ 70, each ticket ≤ 60, per section departures 100 · pre-flight 60 · baggage 70 · gate 40 · network 40; weight ≤ 82 KB gz (JS 14, CSS 15, onda 4). Meta title ≤ 62, description 110–165

## 5 · Generate and wire
- `python3 design/pages-deco/genera-og-cities.py <slug>` (needs `BOOM_PLAYWRIGHT`, Pillow) → `og-<slug>.png` ≤ 120 KB
- `npm run build:cities` (every page changes: sister links and `areaServed` are derived)
- hand-maintained surfaces: `sitemap.xml` (lastmod = JSON `updated`), `llms.txt` (link the URL), `terms.html` §12 (+ Last Updated and its sitemap lastmod), `privacy.html` city line (+ dates), `withdrawal.html` option + prose, the «Company & Markets» footers (index, apartments, try, your-money, how-it-works, apartment-detail, `design/pages-deco/pt.html`, `patch-lotto2.py`), `vercel.json` aliases

## 5b · The hub and the network follow (nothing to hand-write, a few things to check)
- `/desks` (`desks.html`, generated with the desks by the same `npm run build:cities`) reads every city JSON: a LIVE desk with `checkout: true` gets its board row (code, hours, clock, OPEN/CLOSED from `js/desk-calendar.js`), its arc and pin on the map, its gate chip, its column in «Renting rules, city by city» and its `Service` in the hub's JSON-LD (identical to its own page's); a draft gets a «NOT OPEN» row and a hollow dot — never a link, a price, an hour or an arc. Counts and lists are tokens (`{cities}`, `{n}`): no hub copy to edit
- the hub REFUSES until: the desk's fares equal the other live desks' (label, price, condition, unit); `desk.person` is the same; every check `id` sits in one `rules.rows[].ids` of `cities/_hub.json` (add a new theme id to the right row); its «What we don't do» fact-sheet row says it does not list homes, represent/act for landlords, or promise a date; a fact a lawyer has not confirmed goes in `rules.hold` (`"<slug>:<id>": "<reason>"`, the hub shows the title only); the country has a name in `COUNTRY_NAME` (or its cell reads «—» with a warning)
- the hub's `dateModified` is the newest `updated` of the hub and the live desks: the `/desks` `<lastmod>` in `sitemap.xml` must equal it (the build refuses otherwise)
- every desk page's Network redraws (arcs from Rome, hollow dots for desks not open, the coast under them) and the arcs' bows are chosen over ALL desks: `arcViolations` refuses an arc drawn over a dot — if it fires, the new desk's position needs another bow, not a hidden dot. `no bow takes the arc ROM → XXX` can name an EXISTING desk (Valencia's north bow pushed Madrid onto London's line): try `BOW_FIRST[<IATA>]` for the NEW desk before touching the others
- the hub is NOT free: a live desk adds a board row (~10 words), a rules column (~14), a gate (2), a footer link (2), a brief word (1) — about 31 words. Measure against `HUB_BUDGET` before writing copy (the lead counts with `{n}`, so it does not grow per desk); a cap is never raised to fit
- `python3 design/pages-deco/genera-og-cities.py --hub` when the live set changes (`og-desks.png` prints the live codes)
- weights: the hub ≤ 78 KB gz (page 28, the coast is 3 KB of it); a desk page with the coast ≤ 82 — at the cap, the coast on the desk Network is the first cut

## 6 · Tests (all must be green before the PR)
- `node tests/cities/run.mjs` (SLUGS alphabetical, live set, sister links, currency checks and refusal mutations; THE HUB section: board rows, arcs = each desk's gold arc, pins, Services = each desk's, rules table), `checkout.mjs` (Stripe currency, webhook summary, withdrawal window), `calendar.mjs`, `BOOM_PLAYWRIGHT=… node tests/cities/ui.mjs` (loops, CLOCKS, a paid run for a non-EUR desk; `CITIES_UI_ONLY=hub` runs the hub alone — its clock cases name the desks by code, so a new live desk is a new row to add there)
- the pins a new live desk moves: run.mjs (SLUGS, the desk count 7→8 and the live count 5→6, SEAL, the Network list and its word counts, the board rows and clock spans, the Spain note, "Open in", the llms heading, the privacy regex, the desk-count mutation), ui.mjs (the desk loops, LIVE, the clock wants, rows/pins/gates/columns of the hub), calendar.mjs (the key string, the inline-copy loop), checkout.mjs (`cityOffer`, a paid order through the webhook, `withdrawalWindow` on the new key)
- then `npm test -- seo verita llmstxt crawl tenantfee consent cielo scroll testata`

## 7 · Radar and PFS
- register the city in `js/radar-markets.js` OFF (`enabled: false`, like Amsterdam and Valencia) unless the radar is really wired (street mask, zones, idealista scope, alias, heartbeat); `marketFromText` reads enabled markets only
- add the city to pfs-command's client market menu (`#cm-market`): an off-radar city keeps its own value, never `roma` by default

## Known open items to hand the founder (never block validation on them, never hide them)
- non-EU desk (London): UK VAT registration as a non-established business, a redress scheme for letting agency work (England), the Tenant Fees Act exclusion for tenant-instructed home-finders, the UK cancellation form
- Italian desk outside Rome (Milan): a local unit if someone works on the ground; fee timing under L. 39/1989
- Spanish desks: LAU art. 20 (the RDL 29/2026 convalidation vote underpins "Optional, chosen in writing"), AICAT for Catalonia, RAICV (Decreto 98/2022) for the Comunitat Valenciana — the pages claim no registration of any kind
