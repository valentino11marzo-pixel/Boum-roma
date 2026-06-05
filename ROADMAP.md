# BOOM Rome — Product & Engineering Roadmap

A living plan to make boomrome.com the most **trustworthy, fastest, and most intelligent**
way to rent in Rome. Theme across everything: *be different in a low-trust market by making
technology the proof of trust.*

---

## 0. Recently shipped (this engagement)

| Area | Change |
|---|---|
| /apartments | Concierge match flow, smart empty-state (closest matches), best-value sort, recently-viewed, a11y, re-sequenced lower funnel (browse → scarcity → trust → offer → safety-net) |
| /listing/:id | **Verified-by-BOOM** trust band, LCP `fetchpriority` + right-sized images, scoped zone query (w/ fallback), arrow-key typing bug fix, carousel a11y, **freshness chip**, **map click-to-load facade** |
| / (home) | Verification proof row, right-sized static images, **deep-linked featured cards** to real listings |
| /apartments-in/* (11 hubs) | **Right-sized listing images** (imgThumb) + **fixed broken `/apartments/:id` links** → `/listing/:id` |

---

## 1. Audit synthesis (prioritized)

### ✅ Done in this engagement
- Image right-sizing on all four data-driven surfaces (apartments, listing, home, hubs).
- LCP priority on the listing hero image.
- Broken hub → listing links fixed (was `/apartments/:id`, which has no route).
- Map third-party payload deferred behind a facade.

### 🔜 High-impact, still open
1. **CLS — intrinsic image sizing.** Dynamic `<img>` on /apartments + /listing lack `width`/`height` (CSS locks listing height, so low risk there; /apartments cards could shift). Add `width/height` or `aspect-ratio` to reserve space. *Easy.*
2. **Nav/footer componentization.** Header/footer markup, link sets, and `font-size`/`blur` values drift across pages; some link to `/x.html`, others to clean `/x`. Extract one canonical nav + footer partial (or normalize by hand) and standardize on clean URLs. *Medium.*
3. **Mobile nav parity.** Verify hamburger presence/behavior on every main page (audit flagged inconsistency). *Easy–Medium.*
4. **Home "How BOOM Works" images.** Confirm first in-view frame is `eager`/`fetchpriority`, rest lazy. *Easy.*
5. **Firestore schema normalization.** `image` vs `images[]`, `sqm` vs `size`, `beds` vs `bedrooms`, `status` vs `availabilityStatus`. Migrate once; delete fallback branches. *Medium.*
6. **Hub empty-state CTA.** When a neighborhood has no live listings, make the "we'll find one" CTA time-bound and prominent. *Easy.*

### Strengths to preserve
- SEO is strong everywhere (title/description/canonical/OG/JSON-LD; server-side per-listing SEO via `api/listing.js`).
- Security-hardened Claude proxy already exists (`api/parse-docs.js`: auth, rate-limit, model pinning, field whitelist).
- Rich serverless layer: Stripe (`reserve-checkout`, `create-checkout`, `stripe-webhook`), `generate-pass` (Apple Wallet), `geocode-all`, `sitemap-listings`, `reminder-cron`, the Homie lead agent.

---

## 2. The bigger plan — by theme

**A. Blazing (performance & Core Web Vitals)**
Finish image sizing (CLS dims), defer/iframe-facade all third parties, audit render-blocking CSS/JS,
preconnect critical origins (done on listing pages), ship `webp/avif` where Imgur allows, and add a
lightweight RUM beacon (or PageSpeed CI) so we measure LCP/INP/CLS per page over time.

**B. Trust & differentiation ("technology is trustworthy")**
The Verified-by-BOOM band (listing) + verification row (home) are the seed of a **site-wide trust system**:
a reusable component + a real "what we verify" methodology page, "video-verified" provenance, freshness
signals, and transparent price-intelligence everywhere a price appears.

**C. Conversion funnel**
One consistent CTA system (Apply / Reserve / WhatsApp), social proof at every decision point (already at
Apply/Reserve), reserve-&-hold friction reduction, and a unified application object across `leads`.

**D. IA & consistency**
Apply the funnel-ordering principle site-wide; componentize nav/footer/cards; standardize tokens
(spacing, blur, type scale) so every page feels like one product.

**E. SEO & content**
Programmatic neighborhood hubs are strong — extend with internal linking between hubs ↔ listings ↔ blog
(the blog already covers scams, contracts, tenant rights, visas, costs). This content is also the
**grounding corpus** for the game-changer below.

**F. Accessibility**
Carousel keyboard nav + labels (done on listing), focus management in modals (done on /apartments),
descriptive alt text from listing data, landmark/`<main>` coverage, reduced-motion (broadly respected).

---

## 3. ⭐ The game-changer: **BOOM Copilot**

> An AI rental concierge that actually **knows the live, verified inventory** and the **reality of
> renting in Rome** — and can **take action**. No portal in Italy has this.

### Why this wins
Rome's rental pain for newcomers (students, expats, remote workers) is not "browse listings" — it's
*"What can I afford? Is this price fair? Which neighborhood fits me? Is this contract legit? What
documents do I need? Will I get scammed?"* Today that means WhatsApp ping-pong and fear. BOOM already
has every asset to answer it with technology — and to **act** on the answer.

### What it does
1. **Conversational discovery, grounded in live inventory** — "PhD student at Sapienza, €900, quiet,
   September" → returns *real* matching `/listing/:id` cards, explains trade-offs, suggests nearby zones.
2. **Honest advisor** — fair-price vs zone average (we already compute this), commute times (we already
   have the distance tool), what "video-verified / legal contract" means, and red flags in the *wider*
   market.
3. **Rome rental guide, grounded & cited** — codice fiscale, cedolare secca vs canone concordato,
   deposits, documents, registration — grounded in our own blog corpus, with "verify with our team."
4. **Action-taking (the moat)** — from chat it can: shortlist, **start an application** (writes to
   `leads`), **propose a viewing**, **hand off to a human on WhatsApp with full context**, or kick off
   **Reserve & hold** (`reserve-checkout`). Later: issue an Apple Wallet viewing pass (`generate-pass`).
5. **Multilingual** — serves EN/IT/ES/FR/… natively.

### Architecture (fits the existing stack)
- **Endpoint:** new `api/copilot.js` (Vercel serverless, Node) — mirror the hardening already in
  `parse-docs.js` (auth/origin, rate-limit, field whitelist, model pinned).
- **Grounding via prompt caching:**
  - *System block A (cached):* a compact **catalog projection** of live `listings`
    (id, name, zone, price, beds, sqm, key features, status, fair-price delta, url) refreshed on a short
    TTL. Guarantees recommendations are **real and in-inventory** — never hallucinated.
  - *System block B (cached):* curated **"Rome rental knowledge"** distilled from the blog corpus, with
    canonical links for citations.
  - Prompt caching keeps repeat turns cheap (see the Anthropic prompt-caching guidance).
- **Tool use (Claude tools → server executes):**
  `search_listings(filters)`, `get_listing(id)`, `commute_estimate(listing, place)`,
  `start_application(listing, contact, prefs)` → `leads`, `propose_viewing(...)`,
  `handoff_whatsapp(summary)` → prefilled wa.me deep link, later `reserve_hold(listing, contact)`.
- **Streaming** SSE to a slide-in chat widget in the existing dark+gold theme. Entry points: home hero,
  the `/apartments` concierge button (already there), and **every `/listing` page** ("Ask about this
  apartment", pre-seeded with that listing's context).
- **Models:** Haiku for routing/cheap turns, Sonnet for substantive reasoning; cap `max_tokens`.

### Guardrails
Tool-grounded answers only (no invented properties); legal info framed as guidance + human verification;
explicit consent before writing PII to `leads`; per-IP rate limiting + abuse filters; full request logging.

### Phasing
- **Phase 0 — MVP (read-only):** grounded discovery + advisor + cited guide; tools = `search_listings`,
  `get_listing`. Streaming widget on `/apartments` and `/listing`. *Ship-able as one endpoint + one widget.*
- **Phase 1 — Actions:** `start_application`, `handoff_whatsapp`, `propose_viewing`.
- **Phase 2 — Money & docs:** `reserve_hold` from chat; document pre-check via `parse-docs.js`
  (payslip/ID → instant pre-qualification); Apple Wallet viewing pass on booking.
- **Phase 3 — Proactive:** saved-search agent + "new match" alerts, wired into the existing Homie/`leads`
  + `reminder-cron` infrastructure.

### Why it's defensible
Grounded in **proprietary, verified inventory** + an **action layer** + **local legal knowledge** +
**multilingual** + the **trust brand**. A competitor scraping portals cannot replicate the verified data
or the ability to *act* (apply / reserve / book) inside one conversation.

### Success metrics
Copilot-assisted conversion rate, applications & viewings started in-chat, time-to-shortlist, deflected
WhatsApp volume, languages served, cost-per-conversation (kept low by caching + model routing).

---

## 4. Suggested sequencing
1. **Finish CWV** (CLS dims) + **componentize nav/footer** — quick, compounding polish.
2. **Trust system + price-intelligence everywhere** — extends what's already shipped.
3. **BOOM Copilot Phase 0** — the differentiator; isolated new endpoint + widget, no risk to existing pages.
4. **Copilot Phases 1–2** — turn conversations into applications, viewings, reservations.

*Phase 0 of the Copilot spends Anthropic API budget and is user-facing, so it should ship behind a feature
flag with explicit go-ahead and a cost ceiling.*
