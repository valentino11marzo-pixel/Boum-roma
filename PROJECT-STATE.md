# BOOM Redesign · Project State

Living tracker for the apartments-funnel redesign. Read this + `apple-tech-elevation-spec.md`
before continuing. Update the **Status** and **Next** sections whenever you finish a batch.

- **Branch**: `claude/apartment-detail-redesign-w2ggqp`
- **Scope**: `apartments.html` (listing grid) → `apartment-detail.html` (single-property scheda)
- **Spec**: `apple-tech-elevation-spec.md`
- **Constraints**: vanilla HTML/CSS/JS, no build step, dark theme + gold accents, live site (boomrome.com). Everything additive and reduced-motion aware.

> ⚠️ **Provenance**: the previous `PROJECT-STATE.md` / `apple-tech-elevation-spec.md` were
> written in an earlier web session whose ephemeral container was reclaimed before they were
> committed — they were lost. Both files are now reconstructed and committed so they persist.
> If you (the human) had additional notes in the originals, paste them back and they'll merge.

---

## Status

| Batch | Title | State |
|---|---|---|
| 1 | Grid FLIP + blur-up images + list→scheda continuity | ✅ **Done** (this branch) |
| 2 | Detail-page entrance choreography | ▢ Next |
| 3 | Gallery & lightbox elevation | ▢ Planned |
| 4 | Cross-document View Transitions (progressive enhancement) | ▢ Planned |
| 5 | Funnel-wide consistency (zone pages, footers, match) | ▢ Planned |

### Batch 1 — what shipped

- **New module** `js/boom-elevate.js` — dependency-free, idempotent, reduced-motion aware. Exposes `BoomElevate.{ flipCapture, scan, blurUp, captureHandoff, playArrival, reduce }`. (See spec for the API table.)
- **`apartments.html`**
  - Loads `boom-elevate.js` synchronously (after `neighborhoods.js`).
  - Card `<img>` now carries `data-blur-up`.
  - `renderGrid()` captures positions → swaps `innerHTML` → `play()` FLIP, then `scan()` for blur-up. Old whole-grid `apt-results-anim` fade kept as the fallback path.
  - Card click + Enter/Space keydown call `captureHandoff(card photo, id)` before navigating to `/listing/<id>`.
- **`apartment-detail.html`**
  - Loads `boom-elevate.js` synchronously (after the Firebase compat scripts, before the inline boot script — so it's ready for the SSR-instant render).
  - Hero (single + single-with-video) and gallery images carry `data-blur-up`.
  - Right after the page is revealed: `playArrival(hero, id)` (morph in from the card), then `scan(#mediaSection)` (blur-up the rest). `playArrival` claims the hero so blur-up skips it.
- **Service worker**: untouched on purpose — HTML is network-first and `/js/*.js` isn't precached, so the changes ship without a `CACHE_VERSION` bump (avoids re-fetching the 2.28 MB portal shell for all users).

---

## Next — Batch 2 (detail-page entrance choreography)

Goal: replace the detail page's instant spinner→content swap with a staggered reveal of the
above-the-fold blocks, anchored on the hero's arrival morph. See spec §"Batch 2".

Entry points already mapped (file:line references, current as of Batch 1):

- `apartment-detail.html`
  - Content reveal happens at the `pageLoading→apartmentPage` toggle right after `buildMedia()`/`playArrival()` (search for `apartmentPage'); ... .classList.add('show')`).
  - Above-the-fold DOM: `.apartment-page > .breadcrumb`, `.apt-header` (`.apt-title-block` h1/address/zone, `.apt-price-block`, `.apt-specs`), then `#mediaSection`.
  - House easing: `cubic-bezier(.16,1,.3,1)`. Brand tokens in `:root` (~line 74).
  - Don't disturb: 3D map (`launch3DMap`), model-viewer, money scrollytelling (`.pay-track`), lightbox.

---

## How to continue (next session checklist)

1. `git checkout claude/apartment-detail-redesign-w2ggqp` (it carries Batch 1).
2. Read this file + `apple-tech-elevation-spec.md`.
3. Pick the next ▢ batch; keep edits additive + reduced-motion aware.
4. Verify against the spec's acceptance bar; commit; **update the Status/Next tables here**; push.

## Manual QA (do once per batch, on a real deploy)

- Filter/sort the grid → cards glide, new ones rise-fade (not a hard re-paint).
- Slow network → card + hero photos show a blurred preview that sharpens.
- Tap a card → the hero on the detail page morphs in from where the card was.
- Toggle OS "reduce motion" → everything is instant, nothing hidden.
- Hover image carousel, save/compare/share, lightbox, 3D map still work.
