---
name: city-desk
description: Launch or change a BOOM city desk (tenant-side search page with card checkout, like /london, /milan, /madrid). Use when the user asks to open a new city, take a desk live, change a desk's prices, currency, holidays or copy.
---

# Launching a BOOM city desk

A desk is DATA plus a registry entry: `cities/<slug>.json` → `build-cities.mjs` → `/<slug>.html`, and `api/_market.js` `CITY_MARKETS.<slug>` for the server (lead door, Stripe, webhook, Telegram card). Read CLAUDE.md «BOOM Cities» (v1.5 «il biglietto») first. The build refuses anything false or off-budget: let it tell you what is missing.

## 1 · Decide (write the decisions down before coding)
- slug (English: `london`, `milan`), label = JSON `city` exactly, Italian label for operator strings (`labelIt`)
- currency (EUR default; non-EUR needs `currency` in CITY_MARKETS **and** the JSON), prices (the grid is 500 / 199 / 149 in the desk's currency)
- mode `search` (sells, checkout) or `waitlist` (no till, no Stripe)
- desk hours and zone: `desk.timeZone` (IANA; `Europe/Milan` does not exist → `Europe/Rome` + `desk.zoneName`), the holidays key
- legal checklist to hand the founder (see «Known open items»)

## 2 · Server registry — `api/_market.js`
- `CITY_MARKETS.<slug>`: `label, labelIt, flag, country (ISO lower), holidays, currency, hoursEn, url, mode, checkout, plans: CITY_PLANS` (ONE shared plans object; `eur` = the amount in the desk's currency)
- phones: `DIAL` + a `nationalOf` branch for the country (keep the trunk 0 where E.164 keeps it, e.g. Italy; refuse shapes of other countries)
- `cityFromText` aliases come from `label` + `labelIt` automatically

## 3 · Calendar — `js/desk-calendar.js`
- add a key with `fixed`, `easter` (always an array), and the rules the country needs (`mondays`, `weekdays` for substitute days); Italy is always unioned (the desk answers from Rome)
- the file is inlined in every city page: keep it small, no `/*` inside strings
- pin every date for three years in `tests/cities/calendar.mjs`

## 4 · The page — `cities/<slug>.json`
- copy the key structure of a non-Spanish selling desk (`amsterdam.json`), add `currency` if not EUR
- facts only from sources; no statistics, no market rents, no amounts other than the three plan prices (deposits in weeks/months of rent); banned phrases live in `tests/verita` and `build-cities.mjs` (CLOCK_RE, off-market, 500+, exclamation marks, a second rating)
- 3–6 checks (the local law that protects the tenant), exactly 8 papers, 3–6 FAQ including the free call and the refund rule
- budgets: ≤ 460 visible words at load, lead+leadStrong ≤ 30, fares ≤ 70, each ticket ≤ 60; meta title ≤ 62, description 110–165

## 5 · Generate and wire
- `python3 design/pages-deco/genera-og-cities.py <slug>` (needs `BOOM_PLAYWRIGHT`, Pillow) → `og-<slug>.png` ≤ 120 KB
- `npm run build:cities` (every page changes: sister links and `areaServed` are derived)
- hand-maintained surfaces: `sitemap.xml` (lastmod = JSON `updated`), `llms.txt` (link the URL), `terms.html` §12 (+ Last Updated and its sitemap lastmod), `privacy.html` city line (+ dates), `withdrawal.html` option + prose, the «Company & Markets» footers (index, apartments, try, your-money, how-it-works, apartment-detail, `design/pages-deco/pt.html`, `patch-lotto2.py`), `vercel.json` aliases

## 6 · Tests (all must be green before the PR)
- `node tests/cities/run.mjs` (SLUGS alphabetical, live set, sister links, currency checks and refusal mutations), `checkout.mjs` (Stripe currency, webhook summary, withdrawal window), `calendar.mjs`, `BOOM_PLAYWRIGHT=… node tests/cities/ui.mjs` (loops, CLOCKS, a paid run for a non-EUR desk)
- then `npm test -- seo verita llmstxt crawl tenantfee consent cielo scroll testata`

## Known open items to hand the founder (never block validation on them, never hide them)
- non-EU desk (London): UK VAT registration as a non-established business, a redress scheme for letting agency work (England), the Tenant Fees Act exclusion for tenant-instructed home-finders, the UK cancellation form
- Italian desk outside Rome (Milan): a local unit if someone works on the ground; fee timing under L. 39/1989
- Spanish desks: LAU art. 20, AICAT for Catalonia
