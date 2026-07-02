# BOOM redesign — project state & handoff

**Use this to continue in a fresh chat** (this conversation is context-heavy). Everything below is on branch
`claude/apartment-detail-redesign` (production `main` untouched). Preview base:
`https://boum-roma-git-claude-apartment-detail-redesign-valentino-boom.vercel.app/<file-without-.html>`

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

### Next (recommended order)
1. **FLIP grid reconcile** on discovery (cards physically reposition on filter; no innerHTML blink; images don't re-decode) + blur-up LQIP `srcset`.
2. **Shared-element list→detail continuity** (View Transitions: card photo+price → hero) + scroll-restore.
3. **Money-decoded computed ledger** on detail (registry/cedolare/TARI/condominio/utilities) + custom calendar on detail.
4. **Compare = analytical matrix** (€/m², winner chips); budget as **min–max range**; filter sheet drag-to-dismiss + focus trap.
5. **a11y + SEO floor** (skip-links, contrast lifts, JSON-LD/OG/SSR, flip robots), social proof, WhatsApp rail.

## Other previews (archive/explore)
Backgrounds: `preview-bg-highcaliber` (generative Canvas), `preview-background-final`, `preview-gran-atelier`, `preview-contour`, `preview-monogram`. Design languages: `preview-design-study` (Roman Deco-Machine), `preview-design-brutech`, `preview-design-aurum`, `preview-design-maison`. Index hub: `preview-index`.

## Constraints / conventions
- Vanilla HTML/CSS/JS, no build; dark `#060607` + gold `#FFD700`; mobile-first; perf-first (transform/opacity, reduced-motion, lazy maps).
- Validate every change: `node` parse of inline `<script>` + a smoke test; commit per slice; push to the branch.
