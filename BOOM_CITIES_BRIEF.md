# BOOM Cities — Engineering & Product Brief for Claude Code

Status: v1.3 · 16 Oct 2026 (v1.2: 15 Oct · v1.1: 14 Oct · v1: 13 Oct) · Owner: Valentino Egidi · Reference implementation: `amsterdam.html` (in repo root)

**v1.3 — the redesign of 16 Oct 2026 (the founder's second ask of 15 Oct: "an even higher quality and experience… understand who we are talking with… immersive, maximum modernity… direct, no waste… then we go live"). The research is `STUDIO_CITIES_ESPERIENZA.md`; §11 of that study is the spec, decided by a panel of four concepts and four judges. Where this block and v1.2 disagree, this block wins; the founder signs it by approving the preview:**
- **The Check-in is the hero, with the door** (v1.2 said "inside section 02"): the first screen is a question, not a form. Seven blocks plus the footer; the anchors and the 01 to 04 numbering are unchanged. Steps run **stage → where → when**, so the ticket resolves on the first tap for "haven't started" and "found one", on the second for "shortlist", and is a rule the JSON declares, never a guess; the third tap adds the note, the refusal line (zero plus soon) and the eight papers.
- **The ticket is the boarding pass**: one live card with the plan, the price on its board, the condition, the why, the refund rule on Full Search, the papers meter, the doors and the share row. Under the answered step at 390; blank from load in the sticky right column at 1440, above the door.
- **Five facts before any tap**, as a run-in list under the Check-in: Paid by (the §4 must-state verbatim) · From abroad · If we find nothing (the refund rule verbatim on sell desks; the waitlist and Berlin wordings) · Who answers (the named person, the desk hours in CET, derived from a `desk` block; a live clock line with JS) · The company (derived from `_shared.json`: legal name, P.IVA, 4.9 on Google in Rome, 47 reviews, linked when the founder supplies the review URL). "500+ housed" leaves the city pages.
- **One label**: "Open my file" in nav, door, pass, plates and the phone's strip; the till's label is "Pay and start · €N"; the strip carries no price. The free file is the primary door on sell desks, the till the second step beside the refund rule; the refund rule stands in the same block as every visible €500 (door, Full Search plate, pass, sheet, fees row) and the build refuses otherwise.
- **Boards only where a fact changes under the visitor's hand**: the city word settles once at load and is never re-spun; the pass price flips once per plan; OPEN and PAID. **Plate prices are text.** The rail, the family strip in the chrome (the suite becomes a derived footer column and the mobile menu), the route line, the timeline, the truth band (its flags fold into the six checks), the bottom band, the orbs' drift, the grain, the mouse glow, the scroll progress, the pointer tilt, the parallax and the floating pass are removed. The static technical layer stays. Same-document view transitions between steps, scroll-driven entrances behind `@supports`, everything off under `prefers-reduced-motion`, the page whole without JS (the Check-in hidden, the derived FAQ and the fact sheet in the DOM).
- **Each plan carries its own condition** (`condition` and `conditionLong`, read by chip, plate, pass, fees row and Offer): Berlin's Full Search "due only once you sign a lease" on every reader; the other waitlist plans "charged only when the desk opens". The v1.1 places and the till rules are unchanged.
- **The move-in field is a native month select** (value `YYYY-MM`, "Not sure yet" first); the lead API prints the month label. The paid dedupe key lives in `sessionStorage`; `localStorage` is touched only by the consent script, which no longer lands over the first question. The URL is the memory: `#checkin=stage.where.when.docs[.via]`, rewritten on every answer; partial links land as "1 of 3 answered"; papers travel only on the visitor's own Copy link.
- **Budget pinned by the build**: first-party ≤ 90 KB gzipped, city JS ≤ 30 KB gzipped, zero web fonts, no weight below 300 on the phone, no meaning in `--t4`, targets ≥ 44 px, the pass export off the main thread. The word ceilings of 14/10 stay; the slices move with the architecture (hero = H1 + lead; the facts on their own ceiling).
- **Still open before any `live: true`**, unchanged: VAT place of supply, the partners of Barcelona, Paris and Berlin, Berlin's fee list under the WoVermRG, the counsel items of the study's §3.4, the Google review URL and the desk hours as the founder really keeps them.

**v1.2 — the founder's ask of 15 Oct 2026 ("augment the design, UX, UI animation, motion, 3D animation… create a product that is really viral and lets the client understand our offer in a clear, easy way… under the right section, with the right GEO"), which supersedes §0 and §3 where they say "no 3D" and settles §6:**
- **The Check-in** is the viral piece, and it is §6 **module B built** (the Dossier Readiness Check, never built in v1/v1.1), framed as a boarding pass: three taps (where you are · when you move · where you are now) → the plan the page's RULES give (in the city JSON: `checkin.rules`, first match wins, every stage × where must resolve or the build refuses) on a ticket with the price on its own Solari board, the plan's ✓ lines and two notes; the eight documents the CITY's landlord asks for (werkgeversverklaring in Amsterdam, NIE in Barcelona/Madrid, Visale in Paris, SCHUFA in Berlin) → "n of 8 in hand", the missing ones by name, what BOOM would fix first; a boarding pass (name and origin optional) to save as a 1080×1920 PNG or share; the answers in the link (`#checkin=stage.when.where.docs`) so a forward lands the next person on the same ticket; WhatsApp and Copy link. It writes INTO the door (the plan's chip, the move-in, two hidden fields the server prints on the operator's summary) and never past it: the file and the till stay the two doors. It sits inside section 02 before the plates — the block count stays eight (STUDIO_EXECUTIVE_CONVERSIONE), it is not a ninth block.
- **One copy, three readers.** The same rules derive the FAQ answer "Which service is mine?" (visible and in the FAQPage; a hand-written answer on that item is refused by the build) and each Offer's `audience` in the schema. The FAQ cannot name a plan the Check-in would not.
- **Modules A and C stay unbuilt, on purpose.** A (budget reality check) needs sourced rent data per zone that BOOM does not hold for these cities and §5 forbids fabricating; C (legality teaser) needs legal math the per-city blocks of §4 do not carry and a lawyer has not confirmed. Building them from guesses would be the fabricated content this brief bans. They open when the data and the legal confirmations exist.
- **Depth, in CSS only — the founder's "3D" delivered without WebGL, a library or scroll-jacking** (§0/§3 "no 3D" relaxed to this, and only this): the file card and the pass tilt toward a fine pointer (nothing on a touch screen, a thumb has no hover), the technical background drifts against it, the plates and the checks enter with a scroll-driven animation (`animation-timeline: view()`, behind `@supports`), the ticket flips in, the pass floats, a lamina sweep, a rail of five dots on wide screens whose lit dot follows the section on screen. **Everything is off under `prefers-reduced-motion`**, the page reads whole without JS (the Check-in and the rail are hidden there — they are behaviour), and the word budget of 14/10 still holds with the Check-in on its own ceiling.
- **Voice unchanged**: no statistics, no exclamation marks; on a waitlist desk the ticket says "at opening", the file line "charged only when the desk opens", Berlin's Full Search "due only once you sign". The deposit, the cohort and the spots counter of v1 remain gone.

**v1.1 — the founder's decision of 14 Oct 2026 (evening), which supersedes §4, §5.7, §7, §8 and §10 where they say "no prices on waitlist pages":**
- **Every desk shows the same list prices** — Full Search €500 · Application Pack €199 · Attended Viewing €149, VAT included — waitlist desks included (Barcelona, Paris, Berlin). On a waitlist desk they are **list prices, shown and not charged**: the page says so under the service chips, on each plate's price line ("at opening"), in the fees row of the fact sheet and in the schema (Offers with `availability: PreOrder` and the sentence "charged only when the desk opens"). Berlin's Full Search is due only once a lease is signed (WoVermRG §2–§3: fee on a concluded lease, cap two net cold months + VAT, no advances).
- **Shown is not charged.** A waitlist desk never carries a till: no Stripe word, no checkout sheet, `CHECKOUT: false` in the page config; the build refuses `checkout: true` on a waitlist city and the server refuses the POST (`api/_market.js` `cityOffer` → `checkout_closed`). Nobody pays a desk that cannot legally run the search yet.
- **A search desk may sell** behind an explicit `checkout: true` (today Amsterdam and Madrid), through the Rome Services 2.0 rail: the plates' buttons, the phone's pay bar and the offer after the lead open one sheet → `POST /api/service-checkout { city, kind }` → Stripe Checkout at the price in `CITY_PLANS` (the server's grid, never the browser's) → the SERVICE webhook writes a PAID lead with `market = <city>` (the Commerciale stands down, the Telegram card says "payment received") → Stripe lands the client back on the city page (`?paid=<plan>`), which shows the paid state. The free door (the file) stays the primary door; the till is the second step for the client who has decided. Full Search is refunded in full if BOOM declines the search in the first call — BOOM policy, confirmed by the founder on 15 Oct ("keep the refund promise, it's our policy"); the build refuses a desk with an open till whose sheet does not state it.
- The reason: a standalone landing page per city that can convert and measure real interest, not only intent — "let us really confirm the interest and that the product works". Still open before any `live: true`: VAT place of supply (commercialista), the partners of Barcelona/Paris/Berlin, Berlin's fee list under the WoVermRG.

This file is the contract for the "city pages" build. Read it fully before touching code.
Rules of engagement: no autonomous scope changes, no fabricated content, no stock photos of people,
no legal claims beyond the per-city blocks below. If something here is wrong, say so and stop — don't route around it.

---

## 0. Brutal context (read this, then build)

- Four pages: **Amsterdam, Barcelona, Madrid, Paris.** Budget: ~€100 ads per city. That buys ~50–70 clicks and 3–10 leads per city. It is NOT a conversion test; it is a headline/CTR smoke test. Design the pages so that organic + referral traffic is the real channel (SEO/GEO), and ads are a sanity check.
- The pages are **English-first, tenant-side only**. BOOM never lists properties or takes landlord money in these cities. This is a legal condition in NL, not a slogan.
- **Payment is allowed on only two of the four pages** until legal checks pass:
  - Amsterdam → full flow (form → €99 Stripe deposit).
  - Madrid → full flow, pending check §4.
  - Barcelona → **waitlist only** (Catalonia requires agent registration; rent-cap zone rules).
  - Paris → **waitlist only** (loi Hoguet: carte professionnelle required; tenant fees regulated). Paris page is content + demand capture + "launching with a licensed partner".
- "Ultra high tech" is only worth building where it increases conversion or AI citability. Three interactive modules are specified (§6). Nothing else. No 3D, no WebGL, no scroll-jacking.
- Open decision, not yours to make: domain. Build everything with a single `SITE_URL` constant and relative asset paths so moving from boomrome.com to a city-neutral domain is a config change.

---

## 1. Goal / non-goals

**Goal.** Four production city pages that (a) convert warm traffic into founding-cohort reservations or waitlist signups, (b) are the best-structured, most citable English pages on "renting as an international" in each city, (c) share one codebase so a fifth city is a JSON file + copy.

**Non-goals.** No framework migration (keep static HTML on Vercel). No CMS. No user accounts. No listing search. No chatbot in v1 (Homie integration is v2, see §11).

---

## 2. Architecture

```
/cities/
  _template.html          ← extracted from amsterdam.html, with {{tokens}}
  amsterdam.json
  barcelona.json
  madrid.json
  paris.json
/assets/
  boom-city.css           ← shared styles (brand system below)
  boom-city.js            ← shared behaviour (forms, counters, modules, pixel)
  og/                     ← one OG image per city (1200×630, brand-rendered, no stock photos)
/build-cities.mjs         ← Node script: template + json → /amsterdam.html, /barcelona.html, /madrid.html, /paris.html
/amsterdam.html … /paris.html   ← generated; committed (Vercel serves static)
/llms.txt
/robots.txt
/sitemap.xml
```

- `build-cities.mjs`: zero dependencies. Replace `{{key}}` tokens, render arrays (steps, plans, faq, checks) with tiny helper functions. Fail the build if any `{{token}}` remains unresolved or any `[PLACEHOLDER]` string survives in a city marked `"live": true`.
- Add `"scripts": { "build:cities": "node build-cities.mjs" }` to package.json (create one if absent). Vercel build command can stay as-is; run the script before commit.
- One shared `BOOM` config object per page, injected from JSON: `STRIPE_DEPOSIT_URL, WEB3FORMS_KEY, WHATSAPP, SPOTS_TOTAL, SPOTS_LEFT, META_PIXEL_ID, MODE ("deposit" | "waitlist"), CITY, SITE_URL`.

---

## 3. Brand system (non-negotiable)

- Background `#08080A`, surfaces `#0E0E11` / `#141418`, ink `#F4F2EC`, muted `#A7A49C`, gold `#D4AF37` (portal legacy `#C9A96E` only if matching existing components).
- Type: `"Helvetica Neue", Helvetica, Inter, Arial, sans-serif`; weight 300 body, 400–500 UI, no bold headlines. Inter 300/400/500/600 from Google Fonts as fallback.
- Logo: concentric gold spiral SVG (reuse the one in `amsterdam.html` or the official asset if present in repo).
- Apple-level minimalism: generous whitespace, hairline gold dividers, no gradients heavier than the hero glow, no icons unless from a single consistent set, no emojis.
- Motion: reveal-on-scroll only (opacity/translate, 600ms). Respect `prefers-reduced-motion`.
- Mobile first. Every section must read on a 380px viewport without horizontal scroll. Sticky bottom CTA on mobile only.

---

## 4. Per-city legal & product blocks (verify each with local counsel before `live: true`)

Knowledge below is as of Oct 2026 and may be outdated. Treat every line as "verify", not "fact". Do not expand these claims in copy.

| City | Tenant-side agent legal? | Licence / registry | Page mode | Must-state on page |
|---|---|---|---|---|
| Amsterdam | Yes — *aanhuurmakelaar*. Dual-fee prohibited. | None required | `deposit` | "We work exclusively for you; never paid by landlords." Deposit cap 2 months. BRP registration can't be refused. WWS points regulation for mid-rent. Indefinite contract default since 2024. |
| Madrid | Likely yes as a service contract with the tenant; landlord must bear their own agency costs (Ley 12/2023). | No regional registry known for Madrid (verify) | `deposit` (pending verification) | "You hire us; we do not act for the landlord." No regional rent cap in Madrid (Comunidad de Madrid did not declare tensioned zones — verify). Deposit (fianza) 1 month legal + max 2 months additional guarantee. |
| Barcelona | Grey. Same national law as Madrid + Catalonia tensioned-zone rent cap (índice de referencia) + mandatory agent registration (AICAT) for intermediation. | AICAT registration or licensed local partner | `waitlist` | "Launching with a registered local partner." Rent-cap check offered as a service in copy, no pricing. |
| Paris | Only with carte professionnelle (loi Hoguet). Tenant-charged fees capped (loi ALUR, €/m²). *Chasseur immobilier* is a regulated activity. | Carte pro (transactions) or licensed partner | `waitlist` | "Launching with a licensed partner." Paris rent control (*encadrement des loyers*) check offered in copy. No prices displayed. |

Pricing (deposit-mode cities only), from Amsterdam decision 13 Oct: **Full Search €500** (one attended viewing included, extra viewings €149), **Application Pack €199**, **Attended Viewing €149**. Shown incl. VAT. Open item for the commercialista: VAT place of supply for property-related services (NL 21% / ES 21% vs IT 22%).

**15-day rule:** NOT yet ported. Await exact Rome wording from Valentino. Do not invent it. If it is "result within 15 days or refund", it does not ship in Amsterdam/Madrid without a rewrite.

---

## 5. Page structure (identical order on all four; sections toggle by mode)

1. Nav — logo, BOOM, city chip, CTA (deposit or waitlist).
2. Hero — city-specific H1 (see copy rules), lead, two CTAs, spots counter (deposit mode) or "waitlist open" (waitlist mode).
3. The problem — three stats, city-specific. Each stat needs a `source` field in JSON (URL + date). Stats without a source don't ship.
4. Not an agency. Your agent. — city legal block from §4 + the standing "we work only for you" statement.
5. **Module A — Budget Reality Check** (§6).
6. How it works — five steps, city-adapted (dossier format name, platforms: Pararius/Funda · Idealista/Fotocasa · SeLoger/PAP/Leboncoin).
7. Services & pricing — deposit mode: three plans. Waitlist mode: the three services described, no prices, one "Join the waitlist" CTA.
8. Before you sign — six city-specific checks (deposit cap, registration/empadronamiento/justificatif de domicile, rent-cap/points, service costs/charges, contract type, income/guarantor rules — Visale in France, aval bancario in Spain).
9. **Module B — Dossier Readiness Check** (§6).
10. Your BOOM person — operator card. If no operator yet: honest "Opening [month]" state, founder card from Rome instead. Never a stock face.
11. Track record — Rome numbers (500+ housed, 98% success, since 2020) + two real testimonials. Placeholders block the build when `live: true`.
12. FAQ — six, city-specific, mirrored in FAQPage schema.
13. Reserve / Waitlist — form → Web3Forms → (deposit mode) Stripe button reveal; (waitlist mode) confirmation + WhatsApp.
14. Footer — legal entity, trademark line, tenant-side statement, links.

---

## 6. The three "high-tech" modules (and why each exists)

All three are vanilla JS, no build step, data from the city JSON. They must work with JS disabled (degrade to static text).

**A. Budget Reality Check** — slider (€800–€4,000) → shows which neighbourhoods are realistic at that budget, typical rent band, and the gross-income threshold landlords expect (NL 3–4×, ES ~3×, FR ~3×). Data: 8–12 neighbourhoods per city with `rent_low / rent_high / note / source / as_of`. Purpose: honesty that converts (people who can't afford the city leave before wasting the operator's time; those who can feel understood). Emits a hidden form field `budget_check_result`.

**B. Dossier Readiness Check** — 8 yes/no questions (ID, proof of income ≥ threshold, employer letter, last 3 payslips, previous landlord reference, guarantor, bank statements, motivation letter) → score + "what's missing" list in the city's format + CTA "we fix this in 24 hours". Purpose: demonstrates the Application Pack value before purchase; captures the lead with its weaknesses (prefills `situation` field). This is the single most useful page element for GEO: it answers "what documents do I need to rent in Amsterdam/Madrid/Paris" in structured form.

**C. Legality Check teaser** — static-but-interactive card per city: Amsterdam points-system indicator, Barcelona índice de referencia, Paris encadrement, Madrid "no cap, but these three clauses are void". One input (rent asked, m²) → "worth checking" / "looks within range" with a disclaimer and a CTA. Purpose: credibility + a ranked-for query. Keep the maths simple and the disclaimer loud; this is a teaser, not legal advice.

Do not add: live listing counters (no API, would be fake), AI chat (v2), maps with pins (no real inventory), countdown timers.

---

## 7. Forms & payments

- Web3Forms POST, honeypot, hidden fields: `city, service, mode, utm, budget_check_result, dossier_score`.
- Deposit mode: on success reveal Stripe Payment Link (€99, "refundable founding deposit", one link per city for attribution).
- Waitlist mode: on success show confirmation + WhatsApp deep link + "we'll message you when [city] opens".
- Spots counter: manual value in JSON for v1. (v2: Vercel Edge Config `spots_left_<city>`.)
- Events: `Lead` on form success, `InitiateCheckout` on Stripe click, `ViewContent` on module interaction. Meta Pixel optional per city; add Plausible (`data-domain` from SITE_URL) as the primary, privacy-light analytics — no cookie banner needed.

---

## 8. SEO / GEO requirements (this is the real channel)

- Per city: unique `<title>`, meta description, canonical, OG image, `hreflang` not needed (EN only in v1).
- JSON-LD per page: `Organization` (shared), `Service` with `Offer`s (deposit mode) or without prices (waitlist), `FAQPage`, `BreadcrumbList`. Validate with the schema validator; build fails on invalid JSON.
- `robots.txt`: allow `GPTBot, ClaudeBot, Claude-Web, PerplexityBot, Google-Extended, Bingbot`. Check Vercel isn't serving a blocking header.
- `llms.txt` at root: one paragraph per city page, services, prices, legal entity, trademark, founder, the tenant-side statement. Plain, factual, no marketing adjectives.
- `sitemap.xml` with the four pages + guides as they ship.
- Internal links: each city page links to its six guide slugs (§9) even before guides exist → ship guides within 30 days or remove links (no 404s in a live page).
- Performance budget: Lighthouse mobile ≥ 95 performance, 100 accessibility, 100 SEO. No layout shift from fonts (use `font-display: swap` + size-adjusted fallback). Total page weight < 400 KB without the OG image.
- Entity consistency: the Organization block (legal name, address, VAT, founder, trademark) must be byte-identical across the four pages and `llms.txt`.

---

## 9. Content plan (copy is written by Valentino/Claude chat, not improvised in Claude Code)

Six guides per city, titles fixed so links can ship now:

- Amsterdam: `/guides/amsterdam-deposit-cap`, `/guides/amsterdam-brp-registration`, `/guides/amsterdam-points-system-rent-check`, `/guides/amsterdam-income-rules-new-job-freelance`, `/guides/amsterdam-indefinite-vs-fixed-contract`, `/guides/aanhuurmakelaar-cost-amsterdam`
- Madrid: `fianza-and-guarantees`, `empadronamiento`, `contract-types-lau`, `income-and-aval`, `what-landlord-pays-ley-vivienda`, `tenant-agent-cost-madrid`
- Barcelona: `rent-cap-indice-referencia`, `empadronamiento`, `contract-types-lau`, `income-and-aval`, `aicat-what-it-means-for-you`, `tenant-agent-barcelona`
- Paris: `encadrement-des-loyers-check`, `dossier-locatif-visale-garant`, `honoraires-what-tenants-legally-pay`, `bail-types-meuble-vs-vide`, `justificatif-de-domicile`, `chasseur-immobilier-cost-paris`

Copy rules: short sentences, no exclamation marks, no "unlock/seamless/hassle-free", no promises of dates, no success guarantees. Every number has a source.

---

## 10. Acceptance criteria (definition of done, per page)

- [ ] Builds from JSON with zero unresolved tokens; `live: true` pages contain no `[PLACEHOLDER]`.
- [ ] Mode-correct (v1.1): every page shows the list prices; a waitlist page says they are charged only when the desk opens (chips, plates, fact sheet, schema `PreOrder`) and carries no Stripe word, no checkout sheet, `CHECKOUT: false`; a search page sells only behind `checkout: true`.
- [ ] Legal block matches §4 verbatim; nothing added.
- [ ] Modules A/B/C work on iOS Safari and Android Chrome; degrade gracefully without JS.
- [ ] Forms tested end-to-end (Web3Forms receipt + Stripe test link) on mobile.
- [ ] Lighthouse mobile: ≥95 / 100 / 100 / 100.
- [ ] Schema validates; `llms.txt`, `robots.txt`, `sitemap.xml` present.
- [ ] No stock photos of people; images are BOOM-owned or licensed, credited in a comment.
- [ ] Operator card is real or in the honest "opening" state.
- [ ] Reviewed on an actual phone by Valentino before `live: true`.

---

## 11. v2 (not now)

- Homie/VERA chat widget scoped to the city page content (answers only from the guides + legal block; hands off to WhatsApp).
- Spots counter from Edge Config; Stripe webhook decrements it.
- Operator portal view: assigned cases per city (ties into portal.html case file).
- City-neutral domain migration (one config change if §2 is respected).

---

## 12. Starter prompt for Claude Code (paste this)

```
Read BOOM_CITIES_BRIEF.md fully, then amsterdam.html. Do not change scope.

Phase 1 (this session): extract amsterdam.html into /cities/_template.html + /assets/boom-city.css + /assets/boom-city.js, create /cities/amsterdam.json so that `node build-cities.mjs` regenerates an amsterdam.html that is pixel-equivalent to the current one. Fail the build on unresolved tokens. Commit.

Phase 2: add Module A (Budget Reality Check) and Module B (Dossier Readiness Check) to the template, data-driven from JSON, graceful without JS. Amsterdam data only. Preview on Vercel, Lighthouse report.

Phase 3: create madrid.json (deposit mode), barcelona.json and paris.json (waitlist mode) with copy marked [PLACEHOLDER] where it must come from Valentino. Build all four. Add llms.txt, robots.txt, sitemap.xml, JSON-LD per page.

After each phase: list every [PLACEHOLDER] and every item from §10 not yet met. Do not invent testimonials, stats, legal claims or photos.
```
