# BOOM Cities — Engineering & Product Brief for Claude Code

Status: v1.7 · 4 Nov 2026 (v1.6: 3 Nov · v1.5: 26 Oct (v1.4: 22 Oct · v1.3: 16 Oct · v1.2: 15 Oct · v1.1: 14 Oct · v1: 13 Oct) · Owner: Valentino Egidi · Reference implementation: `amsterdam.html` (in repo root)

**v1.7 — "the first card as the home's tickets, the Horizon, the onda, Valencia", 4 Nov 2026 (the founder: "iterate the first card toward the home's tickets, the map, the onda, and Valencia live"; the record is CLAUDE.md «IL BIGLIETTO v1.7» and «BOOM Desks → La mappa»; the design trees and the measured spec are scratch, not repo):**
- **The first card is the home's ticket family.** Four prototypes (A–D) in front of three judges (founder-eye, conversion, engineering), resolved by the lead into one hybrid. Full Search is the flagship: a lying ticket with a wordless gold-leaf band (no "First class" word anywhere — a class label is a fact we do not have), the situation question with its CSS "?", the plan name, its promise ("We search. You choose."), a standing tear, a darker stub with the price as a gold quota, a decorative barcode that encodes nothing and a gold pip; the ✓ refund coupon torn under it on selling desks; Application Pack and Attended Viewing as an economy pair side by side on phones (360–939 px); the pass's one route in display type; an opened fare is the full home ticket (band lit once, ✓ includes, ✓ refund on Full Search, a second tear, a darker stub holding the door on phones, barcode, the outlined pay control); at ≥ 940 the three tickets lie down and the closed Full Search shows its ✓ rule and a quiet pay control under the ticket, inside its frame, while the door stays in the pass stub. Deleted from v1.6: the row dividers, the gold-bar refund inside the pass, the door's hover lift ("First class" and the hover lift are refused by `tests/cities/run.mjs`, not by the build). No JSON copy changed: the promise is the plan's `name`.
- **The hard phone pins** (measured, every desk): the three prices WITH their conditions readable at 390×664, 375×812 and 390×844; the door and who-answers above the fold at 375×812 and 390×844 (Madrid/Barcelona/Valencia the tightest: who-answers 812 at 390×844, the Application Pack condition 589 against 597 at 390×664). Said plainly, not pinned: at 360×780 who-answers sits 0–86 px under the fold on 6 of 8 desks (measured; the door above it on every desk); at 320×568 the pair's prices sit under the strip, which carries the door. First screen 117–127 words (cap 150).
- **Deep links**: `/<slug>#fare-<plan>`, the alias `#<plan>`, and `#pay-<plan>` (the till on a selling desk with Start-now never pre-ticked; the door on Paris and Berlin). Guards: a plan that exists, no `paid=` return, a blank pass; the hash is folded; nothing is a number the browser invents. The operator's ready reply on selling desks ends with "If you'd rather start now: <url>#pay-full-search". The hub's gates stay on `/<slug>#fares` (the lead's choice: the literal `#fare-full-search` would land a hub visitor on an opened €500 with its pay button at the edge).
- **The Horizon** replaces the flat network map on `/desks` and in every desk's Network: a camera above the Sahara frames every desk plus Rome by itself (a new desk re-frames the map; nothing is refused by a fixed rectangle), the real coast kept in degrees, lifted great-circle arcs from Rome, labels placed by a backtracking placer for phone and desktop boxes, and the build refuses three things with three functions: `hzViolations` an arc within 6 px of a dot it does not serve (it measures only that clearance), `hzLabels` a label with no place («no place for the labels»), `hzArcs` an arc no lift keeps clear or one behind the horizon («no bow takes the arc ROM → XXX clear of the other desks»: check that desk's `validGeo` before touching `HZ_LIFT`). Live pins stay ≥ 44 px apart on the phone map (`HUB_MAP_PX`: 356 px wide at 390, 286 at 320). Alive only on view (its own 3.5 KB cap, counted in the page total): the real terminator each minute, an open-now glow from the desk calendar, one plane per arc once on first view and again on pin hover or focus; on touch the first tap docks the desk's card under the map. Shown on phones too (the v1.6 "no map under 640 px" pin is gone).
- **The onda** lives inside the pass on phones (parity with the home) and behind a translucent paper top on desktop; it beats only while the desk is open, from the city board on a phone and from the stub code at desk width (on the hub from the EUROPE board at every width: the ROM row sat under the canvas on desktop); one pulse per fact (a fare opened, OPEN, PAID); one rAF chain; measured +11–13 % of a 4×-throttled main thread. The WCAG 2.2.2 exposure — a loop longer than 5 s on the phone's first screen with no pause control but `prefers-reduced-motion` — is shared with the home and accepted by the founder; the strict alternative (beat a few times on arrival, then rest until a fact) is ~30 B away.
- **Valencia live with the till** (decided in writing on 3 Nov after being told of RAICV and of the RDL 29/2026 vote): the sixth live desk on Madrid's Spanish rules (LAU art. 20 "Optional, chosen in writing", the must-state verbatim, "Who pays the agent · LAU art. 20" as the first check) and its own calendar `es-vlc` (the Comunitat's days plus the city's two; Sant Joan 24/6 in 2026 only, the `dated` key). RAICV is the Valencian AICAT: the page claims no registration of any kind, and the derived proof line under the pass names the registry on every non-home desk ("an Italian real estate agency registered in Rome"), and since the review so do the fact sheets' Who rows and `llms.txt`. Not a declared stressed zone on 3/11/2026 (said with "today", held on the hub). Fianza one month, lodged with the Generalitat: the desk asks for the receipt. No duty found to issue documents in Valencian; hojas de reclamaciones not promised. The Spanish og cards read "OPTIONAL · FROM €149".
- **Stage 0**: the served assets (`assets/boom-*.css|js`) are emitted by the build from `assets/src/` without their comments; nobody edits a served file by hand, and `node build-cities.mjs --check` must exit 0.
- **The adversarial review (4 Nov), closed the same day**: the build refuses a selling Spanish desk whose "Optional, chosen in writing" head (`#faresH`) is not before the first price in `#fares` (LAU art. 20 is an order, not just a phrase); the build refuses registration and licence claims on every desk page (third round, same day: every sentence with registration/licence vocabulary must be listed in the reviewed allowlist `cities/_claims.json`, default deny, with a lint on the file and named-register bans on selling desks; the first-round rule was `DESK_BANNED`: "a registered (Italian) agency", and any "licensed/registered/listed/authorised/accredited/enrolled in|with|by|at|under|on" that does not land on Rome, the Rome Chamber of Commerce, the town hall or a university; on selling desks also RAICV, AICAT, carte professionnelle, §34c, "licensed/registered agent"; Paris and Berlin keep "with a licensed partner"); the Who rows and `llms.txt` say "an Italian real estate agency registered in Rome"; the PFS plancia offers every live desk as a client market (radar-off desks marked, pinned by run.mjs); the map's "night, now" key shows only when night is drawn; the till gives focus back to its opener after a resize and deep links are ignored while it is open; forced colors keep the economy tear as a dashed column wherever the tickets lie down; the fare focus ring is drawn above the stub; `updated`/`<lastmod>` 4 Nov on the six live desks and `/desks`. Tests after it: run 993, ui 444, checkout 117, calendar 97, markets-ui 25.
- **The fourth round (4 Nov, night)** hardened that guard against a good-faith author and formatting artefacts: entities decoded before the split, NFKC, no zero-width or format characters, words split by inline tags read whole, every text attribute and CSS `content:` read, the `…Html` fields limited to `<b> <strong> <em> <i> <br> <a href>`; the vocabulary widened (un-/non-/de-/pre- prefixes, approved, listed, member, permit, supervised, chartered, the authorities — Generalitat, gemeente, INCASÒL, Chamber of Commerce … — the local-language forms, the registers' initials closed up, "agent/reg/lic no." shapes, §34c in every spelling) and the selling-desk ban with it; a sentence next to the company's Rome line that names another desk place, and a sentence after a reviewed "Registration" heading, must be reviewed too; the lint gained the tenant-place participle, the relative clause, the nominal registration, the strict Rome seat and the first person in law. Copy truths: Milan's registration check now says "Until it is registered, the lease is void under Italian law" (late registration cures retroactively, Cass. SS.UU. 23601/2017 — still held on the hub for the lawyer), Amsterdam's Full Search says "the right to register (BRP) at the address confirmed in writing" (the gemeente registers, not us). Declared limit: a claim with none of that vocabulary, no authority, no number shape and no desk place next to the company ("We are on the official list.") is not caught by a vocabulary guard. The record is CLAUDE.md «IL BIGLIETTO v1.7», point 8.
- **The fifth round (4 Nov, night)** closed what the fourth round's verifiers found: the number shapes now reach the vocabulary (the splitter never cuts after no./nr./n./núm./reg./regd./lic./ref./n.º, the shapes accept a space or a hyphen, "agency", "ref.", "ID", "code", "number", "n." and the Spanish/Italian order "Número de agente 1234", and a belt refuses a string whose whole text has more hits than its sentences — 14 shapes that built clean in a FAQ, a check and a fact-sheet row are refused); a listed short sentence is a key whatever its kind ("Registration", "Generalitat", "INCASÒL", "fianza · INCASÒL"), and what stands next to it — before it as a check's legal label, after it, inside the block, in prose — must be reviewed or neutral (no vocabulary, place, three digits or code, first person, yes/since/number/file/list/done/✓): the six true values in the first person ("We confirm it before you sign", "we ask for the receipt"…) are listed as kind `follower`; the vocabulary gained the approval synonyms (permitted, entitled, endorsed, vetted, homologated, TrustMark, complaints scheme) and the local words (vergunning, gecertificeerd, aangesloten, beëdigd; afiliada, asociada, permiso; certificata, associata, patentino; certifiée, affiliée, adhérent; zertifiziert, Zulassung; IHK, FNAIM, IVD, "Fimaa"), Wales and Scotland are desk places. Measured: no true sentence of the nine built pages was pulled into review by the new words or shapes, and no built page changed. By design a register name stays refused on a selling desk even in true tenant advice ("Check the landlord's agent on the KvK register"); the founder can ask for a law-kind exception later. Tests: run 1085 (ui unchanged at 477: no built page changed).
- **Budgets not raised** (82 KB gz per desk WITH the map counted — 76.4–79.4 today; the hub 78 — 71.8; CSS 15 / JS 14 / onda 4 / map 3.5; 640 words at load per desk, 980 on the hub): the bytes for the new card, the map and the onda came from Stage 0 and from craft, never from a cap.
- **Open legal items, nobody's code**: a Valencian lawyer on RAICV (Decreto 98/2022); the RDL 29/2026 convalidation date (12/11 per CLAUDE.md, ~6–7/11 inferred, unconfirmed) under the "Optional, chosen in writing" of three desks with a till; hojas de reclamaciones and Valencian documents; the 2028 `es-vlc` calendar (not yet published); the Milan local unit and the London VAT/redress items of v1.6.
- **"Validated" cannot be claimed yet**: nobody has read a live-desk lead or a paid order from any desk; the pages are built to be read, not yet read.

**v1.6 — "the complete aviation desk", 3 Nov 2026:** the first screen stays the boarding pass; under it the page is a terminal walk (Departures, Pre-flight, Baggage, Gate, Questions, Network, the fact sheet). Caps raised ONCE by the founder (82 KB gz, 640 words at load); the hub `/desks` with the network map. The record is CLAUDE.md «IL DESK AVIAZIONE COMPLETO» and «BOOM Desks».

**v1.5 — "Il biglietto", 26 Oct 2026 (the founder: "a copy like Apple's"; "Ti do il sì, procedi". Where this block and v1.4 disagree, this block wins):** the first phone screen is ONE boarding pass — the city on one Solari board, one sentence carrying the desk's must-state in bold, the three fares (each row says who it is for, the price with its condition, and opens its own ticket in place: what the fee buys, the refund rule under the €500 where the desk sells, a quiet pay button), one gold door ("Start with a free call" where the desk sells, "Open my file" on Paris and Berlin), who answers and when. Retired: the Check-in quiz, the eight-paper meter, the shareable pass and the `#checkin=` links, the month select, the second contact field, the facts card, the v1.4 hero (the build refuses their keys by name). Kept: How it works (three steps), the checks (folded, with their legal tag), the eight papers each city's landlords ask for (a folded list), the FAQ, the fact sheet (folded, whole in the DOM). The free door asks a name and ONE contact (email or WhatsApp number); the plan of the open fare travels with the lead. The desk window under the door reads the desk calendar (`js/desk-calendar.js`, the same file the webhook counts the withdrawal on: Koningsdag, the Diada, Christmas say "Monday from 09:00"). Madrid and Barcelona drop "extra guarantees two months at most" until counsel confirms the RDL 29/2026 vote. Budgets: 460 visible words at load (Amsterdam went from 1,065 to 350), lead ≤ 30, fares ≤ 70, each ticket ≤ 60, weight ≤ 60 KB gzipped with the JS ≤ 12.

**v1.4 — "The Itinerary", 22 Oct 2026 (the founder's decisions of 22 Oct; the record is `STUDIO_CITIES_ESPERIENZA.md` §12). Where this block and v1.3 disagree, this block wins:** the hero is editorial (H1, a lead of 20 words or fewer, the three prices as text on a fares board with each plan's condition, the refund rule verbatim under the €500 where the desk sells, one gold door, WhatsApp); the three questions, the ticket and the door sit together in section 01 "Your plan", directly under the hero; the main button on Amsterdam, Madrid and Barcelona is "Start with a free call" (Paris and Berlin keep "Open my file"); the ticket shows OPEN and PAID only on server proof, with one file number per person computed by the server; each plan lists the papers it really prepares (Full Search and the Application Pack: the letter; Attended Viewing: none); the fact sheet is measured on its own (≤ 210 words) and the visible-body ceiling drops from 950 to 850 words.

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
| Valencia | Likely yes as a service contract with the tenant, under the same national law as Madrid: LAU art. 20 (Ley 12/2023, RDL 29/2026) puts the landlord's agency and lease costs on the landlord; the desk's services are optional ones the tenant chooses in writing. | Registro de Agentes de Intermediación Inmobiliaria de la Comunitat Valenciana (RAICV, Decreto 98/2022, under Ley 2/2017 DA 6ª): mandatory for agents working habitually in the Comunitat. Whether a Rome-established EU agency with no office there must register (art. 3.2.b exclusion vs the telematic-provider address rule; TSJCV 706/2024 not final) is OPEN — verify with Valencian counsel. The page never claims a registration (there is no number). | `search` with checkout — live by the founder's decision of 3 Nov 2026, taken after being told of RAICV and of the RDL 29/2026 vote | "You hire us; we do not act for the landlord." Not a declared stressed zone on 3/11/2026 (volatile: re-check at every `updated`). Fianza one month, lodged by the landlord with the Generalitat (Decreto 46/2022): the desk asks for the deposit receipt. No duty found to issue documents in Valencian; hojas de reclamaciones not promised. |
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
