# BOOM redesign — project state & handoff

**Use this to continue in a fresh chat** (this conversation is context-heavy). Everything below now lives on branch
**`claude/apartment-detail-redesign-w2ggqp`** — the former `claude/apartment-detail-redesign` lineage was merged into it
(commit `ed12369`), so this branch carries BOTH the redesign previews AND the elevation/motion layer. Production `main` untouched. Preview base:
`https://boum-roma-git-claude-apartment-detail-red-bc2b26-valentino-boom.vercel.app/<file-without-.html>`

> Note: the agent **cannot open** the Vercel domain (network policy) — visual bugs must be reported by the user; code is validated with `node` parse/smoke tests.

## The two product pages (current focus)
- **Apartment detail** → `preview-apartment-new.html` — new mobile-first identity; loads real Firestore data with `?id=<listing-id>` (`/api/listings`), sample fallback; hero carousel + lightbox; live stay/price engine; **"Secure this home"** flow (quick-check pre-approval → fair €300 hold, credited/refundable → Stripe step); **real MapLibre 3D map** ("Explore the block in 3D": colored OSM basemap + height-graded 3D buildings + gold pin + 5/10/15-min walk rings, lazy-loaded); similar/smart-match; money "decoded"; AI sheet; motion tokens; Esc/ARIA. Safari hero black-stripe fixed (aspect-ratio moved to container).
- **Apartments discovery** → `preview-apartments-final.html` — real data (`/api/listings`)+fallback; **URL-synced filters** (deep-linkable) + persisted save/compare (localStorage); **real compare modal**; **custom calendar** (move-in, dark+gold, today-onward, mobile sheet); smart-match fit %; filter bar (gold-dot active, **Clear all** pill, edge fade); **real MapLibre map** (gold price pins, fitBounds, saved=green); keyboard/ARIA/aria-live/reduced-motion.

Shared: background system `js/boom-bg.js` (finalists: Guilloché default + Cassettoni/Marmo/Déco + Tessellato/Acqua/Bussola; per-page Auto; switcher hidden unless `?bg=1`). Logo = `boom-mark.svg` (transparent) / inlined.

## The build roadmap (authoritative)
`apple-tech-elevation-spec.md` — from a 32-agent workflow: the Experience Bar (B1–B12), motion/perceived-perf token system, per-surface specs (P0–P2), market-readiness checklist (conversion/perf/a11y/SEO), and a 6-batch implementation sequence. **Read this first** to continue.

### Done so far (from the roadmap)
- Batch 0: motion token scale (`--d-1..6`, `--ease-out/inout/spring`) on both; CTAs de-stubbed (optimistic Apply, honest Reserve); Esc/overlay a11y.
- Real 3D maps (both pages). Custom calendar (discovery). Filter-bar polish. Safari fix.
- ✅ **Roadmap 1 — FLIP grid reconcile + blur-up** (`js/boom-elevate.js`, dependency-free/idempotent/reduced-motion-safe):
  discovery cards now carry `data-id` + `data-blur-up`; `render()` FLIPs persisting cards to their new slots and rise-fades
  new ones; blur-up shows the imgur-thumb LQIP while photos decode (unwraps `/_vercel/image` URLs too).
- ✅ **Roadmap 2 — list→detail continuity + scroll-restore**: card click stores a one-shot handoff (sessionStorage, 10s TTL,
  id-matched) → the detail hero **morphs in from the card's exact screen position** (`playArrival`); back-navigation restores
  the grid scroll position. Wired on BOTH pairs: live `apartments.html→apartment-detail.html` AND preview
  `preview-apartments-final.html→preview-apartment-new.html` (the preview links to `/listing/<id>`, so the chain already works cross-page).
  Verified end-to-end in headless Chromium (same-tab navigation, FLIP transforms on real facet clicks, arrival claim, zero JS errors).
- **Roma Atelier backgrounds** (`js/boom-bg-roma.js` + `preview-bg-roma.html`): 5 animated Rome-iconic generative modes —
  Cosmati / Oculus / Sampietrini / Meandro / Aurum — DPR-capped, tab-hidden pause, reduced-motion→static frame, intensity dial.
- **Roman Deco direction** (`preview-artdeco.html`): monumental Cinzel + sunburst/fluting geometry, stepped gold CTAs,
  listing-as-artefact panel, roll-up stats, cursor-light. Candidate skin alongside the four existing design-language studies.
- **THE NEW GENERATION (current fork in the road)** — complete rework on `js/boom-ambient.js`, the NEW sectional ambient
  engine (one canvas, 7 Rome-iconic generative scenes — oculus/cosmati/velluto/meandro/contorni/aurum/sampietrini — one per
  `data-ambient` section, cross-faded on scroll, palette-parametric, **mood system** browse/read/focus/convert that stills the
  ambience while the user decides; DPR-capped, saveData/reduced-motion→static):
  - **Aurea** (`preview-flagship.html` + `preview-flagship-detail.html`) — the flagship product end-to-end: Cormorant voice,
    refined gold #D9B45B under B3 discipline, live data, FLIP/blur-up/continuity (arrival morph verified), apply drawer =
    convert mood, computed ledger consistent across surfaces.
  - **Notturna** (`preview-notturna.html`) — ultra-tech noir: blue-black, platinum voice, ember gold reserved for money,
    all-sans instrument UI, tabular numerals. Working grid + FLIP, platinum ambience.
  - **Meridiana** (`preview-meridiana.html`) — the first LIGHT direction: travertine paper, warm ink, bronze; couture-editorial.
    Bronze ambience on light paper. Working grid + FLIP.
  All verified in headless Chromium: zero page errors on all four surfaces; detail hero morph claimed from a real click chain.

### Next (recommended order)
1. **Money-decoded computed ledger** on detail (registry/cedolare/TARI/condominio/utilities) + custom calendar on detail.
2. **Compare = analytical matrix** (€/m², winner chips); budget as **min–max range**; filter sheet drag-to-dismiss + focus trap.
3. **a11y + SEO floor** (skip-links, contrast lifts, JSON-LD/OG/SSR, flip robots), social proof, WhatsApp rail.
4. **Go-live cutover**: promote the two preview product pages onto the live routes (`/apartments`, `/listing/:id`) after the
   user picks the final background (Roma Atelier vs boom-bg finalists) and confirms the direction (convergent vs Roman Deco).

## Other previews (archive/explore)
Backgrounds: `preview-bg-highcaliber` (generative Canvas), `preview-background-final`, `preview-gran-atelier`, `preview-contour`, `preview-monogram`. Design languages: `preview-design-study` (Roman Deco-Machine), `preview-design-brutech`, `preview-design-aurum`, `preview-design-maison`. Index hub: `preview-index`.

## Constraints / conventions
- Vanilla HTML/CSS/JS, no build; dark `#060607` + gold `#FFD700`; mobile-first; perf-first (transform/opacity, reduced-motion, lazy maps).
- Validate every change: `node` parse of inline `<script>` + a smoke test; commit per slice; push to the branch.
