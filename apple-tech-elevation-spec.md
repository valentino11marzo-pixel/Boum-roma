# BOOM · Apple-Tech Elevation Spec

**Surface**: the apartments funnel — `apartments.html` (the listing grid) → `apartment-detail.html` (the single-property "scheda").
**Goal**: make browsing BOOM feel like an Apple product page — motion that is *physical, continuous, and quiet*. Nothing flashy; everything intentional. The listing should feel like one continuous surface that re-arranges, breathes, and carries you into the detail page without a hard cut.

> **Note on provenance**: the original `apple-tech-elevation-spec.md` and `PROJECT-STATE.md`
> were authored in an earlier web session whose ephemeral container was reclaimed before
> they were committed, so they were lost. This file is a faithful reconstruction from the
> stated vision (FLIP grid + blur-up + list→detail continuity) and the current code, then
> committed so it survives future reclaims. Adjust freely.

---

## Design principles

1. **Continuity over cuts.** When something moves, the user's eye should be able to follow it. A card that becomes a detail page should *travel* there, not blink there.
2. **Progressive, never blocking.** Every effect is additive. If the JS fails, the CSS is absent, or `prefers-reduced-motion` is set, the page is fully functional and instantly readable — no hidden content, no layout shift.
3. **Quiet luxury easing.** One easing curve everywhere: `cubic-bezier(.16,1,.3,1)` (the same curve already used across BOOM for card image zoom and the mobile CTA). Durations in the 0.45–0.7s band. No bounces.
4. **Respect the existing system.** Reuse the brand tokens (`--gold #FFD700`, `--pure-black #08080A`, `--dark-void #0A0A0A`, Helvetica Neue 300). Don't fight page-owned motion (the detail page's scrollytelling, the 3D map). That is why the elevation layer is its own module, **not** bolted onto `boom-motion.js` (which pulls in Lenis smooth-scroll + button magnetics that would conflict with the detail page).
5. **Reduced-motion is a first-class path**, not an afterthought — every primitive checks it and degrades to instant.

---

## The module — `js/boom-elevate.js`

A single, dependency-free, idempotent module. Loaded **synchronously, before each page's own render script**, so the API is ready even on the detail page's SSR-instant render path. Public API on `window.BoomElevate`:

| Method | Used by | What it does |
|---|---|---|
| `flipCapture(container, selector) → play()` | list grid | Records keyed children's rects; call `play()` after the DOM swap to glide persisting cards to their new spots and rise-fade new ones in. |
| `scan(root)` | both pages | Enhances every `img[data-blur-up]` under `root` with a blurred preview that crossfades to the sharp photo. |
| `blurUp(img)` | both | The single-image version of `scan`. |
| `captureHandoff(img, id)` | list | On card tap, stashes the photo's rect + src + id in `sessionStorage` (5s TTL) for the detail page to pick up. |
| `playArrival(heroImg, id) → bool` | detail | If a fresh handoff matches this listing, morphs the hero in from the card's old on-screen position/size. Returns `true` when it owns the hero (so blur-up skips it). |
| `reduce` | — | The cached `prefers-reduced-motion` boolean. |

All effects use the LQIP trick that fits BOOM's data: **every listing photo is hosted on `i.imgur.com`**, so the low-quality placeholder is just the imgur thumbnail (`<id>t.jpeg`, 160 px, aspect-preserving) — same host, no Vercel image optimizer, no `remotePatterns` allowlist entry needed. Non-imgur URLs simply load plainly (graceful).

---

## Batches

### ✅ Batch 1 — Grid motion + list→scheda continuity *(DONE)*

1. **FLIP on the grid.** `renderGrid()` in `apartments.html` now captures card positions before the `innerHTML` swap and animates them afterward. Filtering/sorting makes persisting cards *glide* to their new positions; newly-matching cards rise + fade in. Replaces the old whole-grid `fadeIn`. Falls back to that `fadeIn` when `BoomElevate`/motion is unavailable.
2. **Blur-up images.** Card photos (`apartments.html`) and the detail hero + gallery (`apartment-detail.html`) carry `data-blur-up`. A blurred imgur-thumbnail preview sits on top and fades away as the full photo decodes — implemented as an overlay so the `<img>`'s own hover-zoom transition is never overridden.
3. **List → scheda continuity.** Tapping a card stashes its photo rect via `captureHandoff`; the detail page calls `playArrival` right after it reveals content, morphing the hero in from exactly where the card was. One continuous surface, list to detail. Degrades to a normal navigation when unsupported or reduced-motion.

**Touched**: `js/boom-elevate.js` (new), `apartments.html` (script include, `data-blur-up`, FLIP+scan in `renderGrid`, handoff on click/keydown), `apartment-detail.html` (script include, `data-blur-up` on hero/gallery, `playArrival`+`scan` after reveal).

### ▢ Batch 2 — Detail-page entrance choreography *(proposed)*

The detail page currently flips from a spinner to `display:block` with no entrance. Stagger the above-the-fold blocks (breadcrumb → title → price → specs → hero) in on reveal with the house easing, coordinated so the hero's `playArrival` morph reads as the anchor of the sequence. Keep it skippable under reduced-motion.

### ▢ Batch 3 — Gallery & lightbox elevation *(proposed)*

Shared-element morph from a gallery thumbnail into the lightbox (and back), blur-up inside the lightbox, and momentum-aware swipe. Today the lightbox is a plain opacity fade.

### ▢ Batch 4 — Cross-document View Transitions *(proposed, progressive enhancement)*

Once SSR (`window.__LISTING`) coverage is confirmed so the hero exists at first paint, layer the native cross-document View Transitions API (`@view-transition { navigation: auto }` + a `pagereveal` coordinator) on top of — or in place of — the JS arrival morph, for browsers that support it. Must be mutually exclusive with the JS morph to avoid double-animating, and must handle the loading-spinner-first paint correctly.

### ▢ Batch 5 — Funnel-wide consistency *(proposed)*

Extend blur-up + continuity to the other entry points into the detail page (zone pages `apartments-in/*`, the "more in {zone}" footer, search/match surfaces) so every route into a scheda feels the same.

---

## Acceptance bar (every batch)

- No console errors; no layout shift introduced.
- `prefers-reduced-motion: reduce` → instant, no animation, full content.
- JS-disabled / module-missing → page identical to pre-elevation behaviour.
- Mobile (touch) and desktop (hover) both correct; 60fps on a mid mobile.
- No regression to existing features (hover image carousel, save/compare/share, lightbox, 3D map, scrollytelling).
