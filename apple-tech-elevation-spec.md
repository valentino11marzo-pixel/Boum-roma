# BOOM — Apple-Tech Elevation Spec

**Master plan to take the apartment-detail and apartments (discovery) surfaces to ultra Apple-tech, market-ready.**

Scope: the two product surfaces that carry the rental decision — the **detail** page (the apartment IS the product) and the **discovery** grid (the journey into it). The guiding idea, lifted from Apple HIG and re-grounded in BOOM's actual code: **Clarity, Deference, Depth** on a dark (`#060607`) + gold (`#FFD700`) vanilla web app, mobile-first, no framework.

> Source-of-truth note: the live files referenced in the surface specs are `preview-apartment-new.html` / `preview-detail-clean-hi.html` / `preview-detail-redesign-hi.html` (detail variants) and `preview-apartments-final.html` (discovery). Several earlier specs cited stale line numbers / sibling variants — where a spec corrected itself, this plan uses the corrected reality.

---

## 1. The Experience Bar

These are pass/fail tests. A surface is not "done" until it clears every applicable bar. Cover the gold, disable the motion, tab through with no mouse — if it still reads premium and operable, it passes.

| # | Bar | Test | FAIL when |
|---|-----|------|-----------|
| B1 | **Deference** | Turn all ambient art off and desaturate gold to grey. | Anything decorative was secretly load-bearing; hierarchy collapses. |
| B2 | **Clarity** | A first-timer names the one primary action per screen in <3s (Apply/Reserve on detail; open a listing on discovery). | Two gold elements compete for "the next tap." |
| B3 | **Color discipline** | Gold only on primary CTA + money-value; green only on verified/availability; amber only on over-budget. | Gold on a tertiary link, decoration, or a second simultaneous CTA. |
| B4 | **Type rhythm** | Every text element maps to the scale (eyebrow 10.5px/2.6px-track → body 14–15px → h2 clamp(21–30) → h1 clamp(27–46)/wt-200) and the t1–t4 opacity ladder (1 / .72 / .46 / .26). | Any ad-hoc font-size or a 5th opacity value. |
| B5 | **Touch & feedback** | Every interactive target ≥44×44px; every tap yields a visible/motion response within ~100ms. | A control that toggles state with no felt confirmation, or a <44px hit area. |
| B6 | **Motion meaning** | Disable each animation in turn. If removing it loses no info about state or space, it shouldn't exist. All motion uses tokenized easing. | Decorative-only movement or a rogue easing curve. |
| B7 | **Continuity** | Tap a discovery card → its photo, price, and fit-score read as the SAME objects on detail (same ratio, `eur()`, %-fit). | The detail page contradicts or re-skins what the card promised. |
| B8 | **Perceived performance** | No screen ever blank or spinner-only; skeletons reserve final geometry; zero shift when `/api/listings` resolves. LCP ≤2.5s, INP ≤200ms, CLS ≈0 on mid-tier 4G. | Any reflow when live data lands; a sample-data flash to a real visitor. |
| B9 | **Progressive disclosure** | Money detail, FAQs, 3D block collapsed by default; move-in total computed live and identical across every price surface. | Two price surfaces disagree, or detail is front-loaded as a wall. |
| B10 | **Accessibility (WCAG AA)** | Complete a booking by keyboard only; focus visible + trapped/restored in every overlay; reduced-motion removes travel AND count-ups; icon buttons labelled with `aria-pressed`. | Any focus trap leak, unlabeled control, or motion ignoring OS preference. |
| B11 | **Ship-readiness** | No dev scaffolding on a market surface. | A tester sees the word "prototype", a 4-way bg switch, an `alert()` apply, or "sample/demo" copy. |
| B12 | **Density / calm** | Consistent spacing rhythm; ≤7 facets/quick-filters at once; nothing cramped. | A viewport feels busy rather than composed. |

---

## 2. Steal-Worthy Patterns + the Motion / Perceived-Perf System

### 2.1 Patterns to steal (and where they already live in the code)

| Pattern | Source | Reuse |
|---|---|---|
| **Explainable fit-score** | discovery `scoreParts(l)` → `{score, parts}`, tooltip on `.pc .fit` | One scoring engine, surfaced identically on detail `.sim` cards. The system's reasoning is legible, never a black box. |
| **One model, three synced surfaces** | `computeStay()` + `render()` writing `.srows`, `.mtiles`, mobile rail in one pass | Every price representation stays in lockstep; the number is never contradicted on the same screen. |
| **Progressive disclosure via CSS** | `.decoded`, `.faq` accordions | Prefer `grid-template-rows:0fr→1fr` (jank-free, no JS height measurement) over `max-height` guesses and `display:none`. |
| **URL as state container** | discovery `syncURL()`/`hydrate()` round-tripping the full filter model | Detail adopts `?in=&dur=` so a sent link reopens the exact quote. Shareable, restorable, SEO-grade. |
| **One bottom-sheet grammar** | `.ov`/`.sheet` translateY-up, focus-trapped, Esc/backdrop close | Define once; reuse for filters, compare, AI-ask, 3D. Never invent a second modal style. |
| **Skeleton-matches-geometry** | discovery `.sk` mirroring `.pc` aspect/padding | Sample data first → live swaps in silently. The house rule for every async surface. |
| **Dialable ambient depth** | `#bgArt`/`#bgGlow`/`#bgGrain` at negative z + Off switch | Atmosphere is opt-out and never load-bearing. |
| **Shared-element handoff** | (absent today) View Transitions API | The flagship move — see 2.3. |

### 2.2 The motion token scale (the single biggest "not-yet-world-class" tell to fix)

Today the files carry **one** motion token (`--ease:cubic-bezier(.16,1,.3,1)`) and hardcode every duration inline. Publish a scale in `:root` and map by **intent**, not by element:

```css
:root{
  --d-1:120ms; --d-2:180ms; --d-3:240ms; --d-4:320ms; --d-5:440ms; --d-6:620ms;
  --ease-out:cubic-bezier(.16,1,.3,1);     /* keep the house decel — Apple ease-out-expo */
  --ease-inout:cubic-bezier(.65,0,.35,1);  /* symmetric — for things that move AND return */
  --ease-spring:linear(0,.006,.101 6.5%,.539 18.2%,.849,.998 41.8%,1.027 56%,1.013 80.2%,1);
  --ease:var(--ease-out);                  /* alias so nothing breaks mid-sweep */
}
```

| Intent band | Elements | Duration | Easing |
|---|---|---|---|
| Micro-feedback (press, toggle, focus) | `.gbtn`, `.iact`, `.seg button`, dots | `--d-1` / `--d-2` | `--ease-spring` |
| UI state (hover, nav scrim, pill active, date field) | nav, `.seg`, `.icbtn`, `.datein`, facets | `--d-2` / `--d-3` | `--ease-out` |
| Spatial / return (sheet, lightbox, accordion, page handoff) | `.sheet`, `.ov`, `.lb`, `.decoded`, `.faq` | `--d-4` / `--d-5` | `--ease-inout` |
| Ambient / reveal (scroll-in, count-up, parallax) | `.reveal`, `countUp`, `.step::after` | `--d-5` / `--d-6` | `--ease-out` |

**Rules.** Duration scales with distance and size (chip < card < section): `.reveal-sm` 8px/`--d-3`, `.reveal-md` 16px/`--d-4`, `.reveal-lg` 24px/`--d-5`. Animate **only `transform` and `opacity`** in any loop (plus `grid-template-rows` for one-shot accordions). `will-change:transform` is set on intent and removed on `transitionend` — never resident. Scroll handlers stay `{passive:true}`. Everything is interruptible: a second tap reverses, doesn't queue.

### 2.3 The flagship move — shared-element list→detail handoff

Currently a hard cut: discovery cards `href="/listing/:id"`, detail hero paints cold. The signature "native app" tell is the tapped card's **photo + price flying into the hero**.

- **Prereq (routing):** cards link clean `/listing/:id`; detail reads id from path OR `?id=`. Add a Vercel rewrite `/listing/:id → detail?id=:id`.
- Tag card `.ph img` `view-transition-name:hero-${id}`, `.pr` `view-transition-name:price-${id}`; assign the SAME names to the detail hero img + price keyed off the incoming id.
- Intercept the click: `await img.decode()` (the card image is `loading=lazy` — decode before transitioning so the morph never flashes empty), then `document.startViewTransition(()=>location.href=href)`.
- **Aspect correction:** card crop is 4:3; hero is responsive 4:3→16:10→16:9. Add `::view-transition-old/new(hero-*){object-fit:cover;height:100%}` so the ratio change reads as a controlled crop, not a stretch.
- Fall through to native nav when unsupported or under reduced-motion. Cap to ONE named id at a time (the tapped card) to keep the snapshot tree cheap on a 30-card grid. 300ms on `--ease-out`.

### 2.4 Perceived-performance laws

1. **Skeleton matches final geometry, byte-for-byte** → CLS ≈ 0 on data swap.
2. **Commit the pixel before the promise** → optimistic UI: save/compare/date-change/apply acknowledge inside one frame (<16ms); only true network results get a skeleton, and they fade in, never block.
3. **Reduced-motion is a branch, not a kill switch** → replace travel/scale with opacity cross-fades at `--d-2`, keep instant state changes, skip View Transitions, jump count-ups to final.
4. **Protect the main thread** → defer the topo/grain background to `requestIdleCallback` after LCP; never recompute on mobile resize; skip under reduced-motion.

---

## 3. Per-Surface Elevation Specs

Each surface: buildable techniques · motion · states · a11y · priority. P0 = launch blocker / biggest jump; P1 = high-value depth; P2 = polish.

### DETAIL PAGE

#### 3.1 Hero gallery (asymmetric mosaic + lightbox) — **P0**

The real hero is a CSS-grid mosaic (`.gal`, 2×2 `.gal-it.main` + up to 5 cells), not a carousel. Five Apple-tier gaps.

- **Shared-element zoom** from tapped cell into lightbox (honor the `cursor:zoom-in` promise). Tier A: View Transitions (`view-transition-name:gphoto`). Tier B: FLIP from `getBoundingClientRect()`. Reverse on close, reading the *current* `lbIndex` cell (may differ after prev/next). Open/close `--d-5` on `--ease-out`; backdrop fades `--d-3` underneath so the photo leads.
- **Thumb-first, decode-gated image.** Restructure `galleryImgs` → `[{thumb:imgOpt(src,1080), full:imgSized(src,'h')}]`. Set `thumb` immediately (warm from the mosaic), shimmer, then `new Image().decode()` the full and swap. Fixes the multi-MB cold original on tap.
- **Pinch / double-tap zoom + drag-to-dismiss.** `touch-action:none`, pointer Map for pinch, double-tap 1×↔2.5× anchored at tap, vertical drag → translateY+opacity dismiss past 120px. Disable horizontal swipe-nav while scale>1. Bump `.lightbox-close` to a 44×44 hit area.
- **Focus trap + restore.** Save `document.activeElement`, focus `#lbClose`, trap Tab within {close, prev, next, image}, restore on close. Add Home/End.
- **First-paint / CLS.** Ship a `.gal` skeleton of correct shape **only when** SSR `__LISTING.images.length` is known (the genuinely-empty case keeps `.media-placeholder` — no black Safari flash). Gate skeleton removal on `.main img.decode()`.
- **Real inline video** (not `window.open` to YouTube). Facade/click-to-load iframe so the ~1MB player is never shipped on load.
- **States:** loading shimmer → decoded; error keeps the thumb (mirror mosaic `onerror`); reduced-motion keeps the `.25s` opacity fade, no travel; zoom/video stay function-only.
- **a11y:** mosaic cells get `tabindex=0 role=button aria-label="Open photo N of M"` + Enter/Space; counter `aria-live=polite` "Photo 3 of 12"; extend the reduced-motion guard to `.gal-it img` hover-zoom (currently missed); inline `<video>` carries `aria-label` + captions `<track>`.

#### 3.2 Decision sidebar (the "Your stay" engine + bottom bar) — **P0**

The pricing math is good (`computeStay()` pure/synchronous); the *surface* is still a web form. Five elevations.

- **Sliding-pill segmented control** (6/12/18/Flex). One absolutely-positioned `.thumb` slides under the finger on `--ease-spring`; `.on` sets only color; `:active{scale(.94)}` + `navigator.vibrate?.(6)`. `positionThumb()` after first layout; re-run on resize/orientation. When Flex is active, keep the "Until" row (label "Stay length" / "open-ended") so the grid never loses a row.
- **Living ledger.** Author a reusable `countUp(el,to)` reading `el.__cur` (not 0), cancelling in-flight rAF. Build `#srows`/`#mtiles` skeletons ONCE; stop the per-render `innerHTML` teardown. Only changed numbers roll (`--d-5`) — the user sees exactly what their choice moved. Total gets a one-shot gold sheen.
- **Branded, availability-aware date field.** Keep the real `<input type=date>` (a11y + OS picker) under a styled `.datein-face`; invisible input over face preserves the native wheel. Fold the availability signal onto the field via a fit chip (green free / amber frees-date / neutral). One-shot pulse if no date picked.
- **Optimistic Apply** — kill the `alert()` stub. `:active{scale(.97)}` + `vibrate(8)`; synchronously set busy → render a locked summary sheet from `computeStay()` (move-in, length, total) → fire the lead POST → flip to "Application started ✓". Reserve variant: "Holding for €300".
- **Promote the sticky decision.** Pin the card's total + Apply as a mini-footer; mobile bar number rolls via the same `countUp` (one source of truth). Two-gold arbitration: an IntersectionObserver demotes the bottom-bar CTA to a quiet outline while the in-card `.gbtn` is on screen.
- **a11y:** `role=radiogroup`/`role=radio` + `aria-checked` + roving tabindex/arrows on the segment; `aria-live=polite` announces the *settled* total only (not every digit); `aria-busy`/`role=status` on Apply; raise `.seg button` to min-height 44; amber never color-alone (keep the "!" + "frees {date}" text).

#### 3.3 Money-decoded ledger — **P1**

The honesty differentiator vs Immobiliare/Idealista. Today: a prose wall behind a `+`, four of five cards with empty amounts.

- **Computed Italian cost model** `costModel(L)` from fields already on `L` (sqm, price, deposit): condominio ≈ `sqm×1.1`/mo, TARI ≈ `sqm×3.2`/yr, utilities as an honest **band** ("Metered · ~€90–160/mo", never a fake exact), registry **€0** via cedolare with the struck-through ordinary 2% comparison.
- **Hairline ledger** grouped into three keynote acts: "One-off — to move in", "Every month", "At signing — registry". Every line carries a real number; `est.` pill (neutral, not gold) when derived.
- **Real-monthly spine** above the toggle: "Rent €1,500 + building & taxes ≈ €89 + utilities (metered) — about €1,680–€1,750 / month." Retitle the toggle "See how we got there."
- **Author `countUp`** here (it does not exist in this file) for the spine + the dormant `data-count` total; reduced-motion sets final directly.
- **Motion:** replace `max-height` with `grid-template-rows:0fr→1fr` + inner `overflow:hidden`; staggered rows (`--i`, 42ms, capped 6); cedolare €0 scale-lands once (`.96→1`, `--ease-out`).
- **Gold rationed to exactly two figures:** the cedolare €0 and the spine band. Everything else `--text-primary`; size (25→16px) + weight-200 + act grouping carry ranking when gold is off.
- **a11y:** `aria-expanded`/`aria-controls`/`role=region`; `<dl>` pairing so "TARI" reads with "€208 per year"; sr-only "You save ~€180/yr with cedolare"; **fix contrast** — the struck "otherwise" figure must be `--text-tertiary` (passes AA), not `--text-muted` (2.4:1, fails) because it carries meaning.

#### 3.4 Location 3D — **P1**

Decoration impersonating a product (dashed CSS rings, a CTA whose modal literally says "In production this is the cinematic MapLibre flyover…"). Strip every "prototype/production" word.

- **Real MapLibre flyover**, progressively loaded. Extend `mapReal` to carry `lat/lng/address`; resolve via explicit coords → `geocodeRome(address)` (ported, sessionStorage-cached) → hardcoded zone centroid (never empty). Lazy-import maplibre-gl only when `#place` is within ~600px (a NEW IntersectionObserver with `rootMargin`, not the one-shot reveal observer) or on first tap. `fill-extrusion` height-graded buildings, gold pin. Keep the exact `.block3d` box dims → CLS ≈ 0.
- **Real walk-time nearby list** synced to map pins (haversine ÷ 80 m/min, honest). Bidirectional hover: row↔pin `feature-state`; `fitBounds` on tap. Demote `.nb .t` time from gold to neutral.
- **Fullscreen sheet = real isochrones** (`bcircle` polygons at 400/800/1200m). Reuse the SAME map instance (move canvas + `resize()`).
- **Build the missing overlay grammar** the `.ov`/`.sheet` lacks: `aria-modal`/`role=dialog`, focus trap, Esc, `lastFocus` restore — and backfill it to `#aiOv`.
- **Motion:** crossfade placeholder out (`--d-4`) → one `flyTo` (pitch 60, bearing −18, 2200ms, house ease); gold pin springs in. Reduced-motion: constructor renders pre-pitched, no flyTo.
- **a11y:** the `.nb` rows ARE the non-visual map equivalent (real tabbable rows with honest times + completable Maps route links); canvas `role=application` + `aria-label`; `cooperativeGestures` so the map never traps page scroll.

#### 3.5 Similar / smart-match carousel — **P1**

The fit badge must be live and explainable, not a hardcoded "96% fit".

- **Reuse discovery's `scoreParts(l)` verbatim** (one source of truth). Re-rank on every date/duration change; sort `L.similar` by score so the snap-start card is the best match. Badge: `title` + `aria-label` + `tabindex=0` + `cursor:help` — **exceeding** discovery's badge, then backport the fix to discovery.
- **Shared-element continuity:** fix `.sim .ph` to `aspect-ratio:4/3` (prereq), route `/listing/:id`, View-Transition the photo+price into the next hero.
- **Intentional carousel:** `scroll-snap-align:start`, right-edge gradient mask, ported `.dots` (active grows to pill), `role=group aria-roledescription=carousel` + Arrow/Home/End, `.reveal-stagger`.
- **Motion:** countUp the % on re-rank; FLIP keyed on `data-id` so the best match physically slides to front; `:active{scale(.97)}`.
- **States:** ≤1 similar → single card, no carousel semantics; loading → 3 skeletons at exact 4:3; empty → hide section.
- **a11y:** score≥85 green/gold pill via a named const shared by CSS+aria; one `role=status` debounced "Re-ranked for your dates"; reduced-motion collapses VT/FLIP/countUp/stagger but keeps badge%, dots, focus-move.

#### 3.6 Trust & aftercare chain — **P1**

Badge soup (six undifferentiated pills), nine competing golds, no aftercare surface, a JS-measured `max-height` accordion.

- **Foundation edit (keystone):** add the missing `--d-*` scale + `--verify:#28E08A`; recolor the hero `.hbadge.vf` from gold to **verification green** (frees gold for price+CTA). Same green as the ledger checks → eye links hero→evidence.
- **Collapse 6 pills → one "Verified by BOOM" evidence ledger** that proves on intent: `<dl>` rows with substantiation tied to the real entity (Egidi Immobiliare S.r.l., P.IVA 17322991005). Demote the two non-proof pills ("BOOM-managed", "24/7 WhatsApp") into the aftercare card.
- **Synchronize the move-in timeline** into one journey (rail sweep `--d-6` + nodes off one per-step index); add a 5th terminal node "You move in · and BOOM stays" bridging to aftercare.
- **Build the aftercare card** (the Immobiliare-killer): Rent (Stripe autopay + receipts), Documents, Maintenance, Deposit — "An agency's care, a product's convenience."
- **Rebuild "Decode the terms"** with `grid-template-rows` (retire the `scrollHeight` read), demote the gold chevron, and **pre-open the legitimacy answer** so credibility is answered on load. Degrade to native `<details open>` if JS dies.
- **a11y:** every disclosure a real `<button aria-expanded aria-controls>` → `role=region`; green "✓" always `aria-hidden` + paired text; **contrast fix** — evidence body copy uses `--t2` (8.42:1) only, never `--t3` (3.26:1, fails); extend the reduced-motion block to every new expand/stagger/chevron.

#### 3.7 Detail global-motion — **P0**

Page-level scroll choreography, sticky anchoring, the live-data swap, haptics, and keeping "calm-but-alive" jank-free.

- **Publish the token scale**, sweep-replace every inline `.Ns`.
- **Staggered, size-tiered reveals** (`.reveal-sm/md/lg` + `.stagger` with `--i`, capped 6/360ms); above-the-fold (`.crumb`/`.hero`/`.titlewrap`) gets `.in` on-ready, never waits for the observer.
- **Compositor-only hero parallax** via `animation-timeline:scroll()` (no rAF, auto-disabled under reduced-motion).
- **Offer-progress rail** (reading progress through the offer, not whole-page scroll) + primary/secondary CTA arbitration.
- **Layout-locked skeleton** so the `?id=` swap is provably zero-shift; the sample never flashes for a real visitor (skeleton on `?id=`, sample only when no id or fetch fails).
- **Press haptics everywhere** + extend `countUp` to first-month/deposit/sqm/floor/%-fit (numbers resolve on entry).
- **Defer `buildBg()`** (synchronous marching-squares topo) to `requestIdleCallback`; skip when `BG==='none'`; drive carousel dots on `scrollend` so the pill tracks the finger.
- **a11y:** refine the blunt `*{transition:none}` into a branch (opacity cross-fades survive); focus-trap/Esc/restore/scroll-lock on `.ov`/`.sheet`/`.lb`; `aria-pressed` + dynamic labels on save/share; segment as a real radiogroup; raise `--t4` text (fails 4.5:1) to `--t3` minimum.

### DISCOVERY PAGE

#### 3.8 Search & filters — **P0**

Filtering works but never *feels*.

- **Identity-keyed FLIP** replaces the `grid.innerHTML` blink: survivors glide to new slots, entrants spring up (staggered, capped), leavers fade+scale in an overlay; `data-id` keys; re-snapshot rects each render so rapid pill-mashing chains smoothly. `#count` counts (tabular-nums), doesn't snap.
- **Visible, clearable state:** `:active{scale(.96)}` + `vibrate(8)` on every toggle; raise `.fpill`/`.facet`/`.iact`/`.seg button`/`.xc` to ≥44; **on-state via a 6px gold dot** (not color alone, WCAG 1.4.1); a "Clear all ⁵" pill that appears in lockstep with `activeCount()`; right-edge scroll-fade mask on the pill bar.
- **Real Apple sheet:** focus trap (the `aria-modal` is currently a lie — Shift+Tab leaks behind), drag-to-dismiss from the header grabber (1:1 finger-follow, backdrop opacity tracks drag, >120px closes), Apply button pulses on every result-count change.
- **a11y:** keep `aria-pressed`/`role=tablist`/Esc; debounce the `aria-live` count ~350ms so pill-mashing doesn't flood SR; global `/` focuses search with `preventDefault`; reduced-motion branches (FLIP→opacity, no drag-spring, count jumps).

#### 3.9 Cards grid — **P0**

Lands flat, cold, and gold-flooded.

- **Blur-up LQIP + responsive srcset** on every card (400/700/1000w + `sizes`), so a card is never a dead charcoal box and never a hard-cut pop — at any later filter render, not just boot. Move the shimmer onto `.pc .ph` itself, killed by `.loaded`. Branded `BOOM`-monogram fallback on `onerror` (never an empty hole).
- **FLIP reconcile** (shared with 3.8) that keeps surviving DOM nodes → images never re-decode on keystroke (a real bandwidth/INP bug today).
- **Physical press + gold rationing:** `:active` scale, `vibrate(8)`, demote `.z`/`.view`/`.bdg.video` from gold (reserve gold for `.pr` price + saved/compare on-state); **lift save/compare OUT of the `<a>`** (fixes invalid nested-interactive HTML and un-clips the focus ring from `.ph{overflow:hidden}`); bump `.iact` to 44.
- **a11y:** stateful labels (Save↔Saved, Add↔In compare); mirror the `.fit` `title` into `aria-label`; gate press-scale behind `@media(prefers-reduced-motion:no-preference)`; verify demoted `.z` clears 4.5:1 (use `--t2` if not).

#### 3.10 Map & compare — **P0**

A confessed-fake `.mapview` (a gradient box that apologizes in copy) and an analytically-mute compare table.

- **Real clustered MapLibre** (lazy-loaded behind a promise cache; List-first visitors never pay ~200KB). Brand-tune via vignette + `mix-blend overlay` gold (no tile-pixel edits). Pins encode state, **not gold by default:** neutral at rest, green ring+♥ when saved, amber when over-budget, gold fill + `--sh-gold` for the ONE active pin (amber overrides gold). Cluster bubbles show count + price range. Delete the apologetic `.mapnote`; add a "Search this area" ghost on user pan that writes `&bbox=` via `syncURL()`.
- **Bidirectional list↔map sync** (the signature correlation the file lacks): `activeId` highlights the peer; gate hover behind `matchMedia('(hover:hover)')`; desktop split layout (a NEW `.results` parent — structural edit).
- **Analytical compare matrix:** real sticky label column (`.cmprow .lbl` finally fires), computed €/m² + move-in-total + Fit% rows, per-row "✓ best" winner chips (green = earned), dim worse cells, a "Best value · {name} · €{x}/m²" verdict. Horizontal scroll-snap on >3 columns. Delete the dead `forEach` sweeps.
- **a11y:** markers `role=button` + Enter/Space + full `aria-label`; real compare focus trap (today only sets initial focus); never color-alone (✓ chip, "over" word, ♥ glyph); gold focus ring + dark halo so it survives over bright tiles; markers + `.iact` ≥44.

### BOTH PAGES

#### 3.11 List↔detail continuity — **P0**

The journey is a hard cut pretending to be one app. Prereqs first: **unify routing** (`/listing/:id` rewrite + path-OR-query id read).

- **Shared-element hero+price transition** (see 2.3) built to survive the 4:3→16:9 aspect change and the lazy-loaded source (`await img.decode()` before transitioning).
- **Detail skeleton at locked responsive geometry** kills the sample-data flash (a real `?id=` visitor never sees the wrong home).
- **Scroll-restore + bfcache discipline:** `history.scrollRestoration='manual'`, `persistScroll()` to sessionStorage before nav, restore on the *real* render (double-rAF) + `pageshow`; a one-shot gold pulse re-highlights the returned card; no `unload` handlers (keep bfcache eligible).

#### 3.12 Empty / loading / error states — **P0**

A fast path that looks resolved and a failure tail that lies (one `.catch(()=>{})` collapses 500/timeout/offline into "render sample with the proto banner still claiming live data").

- **Detail layout-locked skeleton** + hard rule: `?id=` present → never paint sample.
- **Explicit `dataState` machine** {loading, live, sample, error, offline, notfound} drives both the rendered state AND an always-truthful provenance chip. Disambiguate `#empty`'s three meanings via `activeCount()` (filters-too-tight vs zero-inventory vs failed). `online`/`offline` listeners flip a ribbon + auto-refetch. Detail 404 → "This home is no longer listed."
- **Per-item & partial honesty:** replace `onerror→opacity:0` with branded aspect-locked fallbacks; stop `mapReal` substituting SAMPLE images/nearby/similar (render honest section empties); fix the empty-map `Math.min/max([])` → NaN-pin bug.
- **a11y:** `role=status aria-live=polite` on every state region + provenance chip + offline ribbon; never blame the user, never the word "Error"; verify amber (8.9:1, passes) and `--t3` (4.6:1, just passes) contrast.

---

## 4. Market-Readiness Checklist

### 4.1 Conversion & Trust (must-haves)

- [ ] **Wire the primary CTAs to a real funnel.** `apply()` is an `alert()` stub wired to BOTH Apply and "Reserve & hold · €300". POST the computed stay to the existing `leads` pipeline (`/api/homie/inbound`) and open a pre-filled apply sheet.
- [ ] **Add a low-friction rung** before the high-commitment ask: "Ask this home" / "Request a video viewing" / "Check my dates" — each email/WhatsApp-captures so no visitor leaves uncounted.
- [ ] **Make "Reserve & hold · €300" real or honest.** A dead money button under a "Stripe-secured" badge is the single biggest trust-killer — wire real Stripe checkout or relabel "Request to hold."
- [ ] **Explain what Apply commits you to, inline** — pull "Free, no commitment — we reply in 2h" directly under the CTA.
- [ ] **Surface scarcity honestly** (derive "available in N days" from `availableFrom`; show enquiry counts only if real). No fake countdowns.
- [ ] **Specific trust signals** — link "Registered legal contract" → RLI, "Deposit protected" → how (Stripe/escrow); pull the license number UP next to Apply.
- [ ] **Add human/social proof** — 2–3 real tenant quotes + an aggregate rating near the decision card. Decisive for sight-unseen cross-border renters.
- [ ] **Close the loop on save/compare** — unify the save store across both pages (detail's save persists nothing today), offer "Get alerts on saved homes."
- [ ] **Make the fit-score a trust asset** — expose the "why" on **tap** (hover-only `title` is invisible on mobile); make detail-page fit reflect real dates/budget.
- [ ] **Always-reachable WhatsApp** on the detail rail and discovery (highest-converting channel for Italian/relocation renters); discovery currently has NO persistent CTA.

**Top risks:** dead primary CTAs; fake payment promise; hardcoded "96% fit"; zero social proof; mobile-invisible trust info; `href="#"` escape-hatch CTAs; silent SAMPLE fallback (a user could apply for a sample apartment); the move-in total omits VAT/condominio/utilities while copy promises "no fees invented at the table" — **audit + disclaim or the trust promise breaks at signing.**

### 4.2 Performance budget (must-haves)

| Metric | Budget (mobile, Moto-G-class, 4G) | Current blocker |
|---|---|---|
| LCP | ≤2.0s (beat the 2.5s "good") | Detail hero `<img>` injected only after `/api/listings` resolves on `?id=` pages — guaranteed regression. |
| INP | ≤150ms (good 200ms) | `render()` does full `grid.innerHTML` teardown on every keystroke. |
| CLS | ≤0.05 | No `<img>` width/height; late sample→live swap on detail. |
| Hero transfer | ≤120KB | Hardcoded w=1200/1600, no `srcset`/`sizes`. |

- [ ] **Fix the LCP image:** `fetchpriority=high` on slide 0, `<link rel=preload as=image imagesrcset>`, blur placeholder, `srcset` 640/960/1280/1600 + `sizes`.
- [ ] **Intrinsic dimensions on every `<img>`** (verify CLS with images blocked).
- [ ] **Fonts:** preload the 1–2 above-fold weights, cut the 5-weight render-blocking load, match fallback metrics (`size-adjust`).
- [ ] **Budget the motion/bg system:** bake `#bgGrain` SVG turbulence to a tiling WebP; defer `#bgArt` topo to `requestIdleCallback`, cap grid res, skip on small screens + reduced-motion.
- [ ] **Reduce compositing:** drop per-card `backdrop-filter:blur` (12+ stacked layers → scroll jank); keep blur only on truly-overlapping chrome.
- [ ] **Cheap re-render:** FLIP reconcile by id; `content-visibility:auto` + `contain-intrinsic-size` on off-screen cards.
- [ ] **Right-size images:** per-breakpoint `srcset`, AVIF/WebP, cap full-res behind the lightbox gesture; reconsider `cache:no-store` (use SWR).

### 4.3 Accessibility (WCAG AA, must-haves)

- [ ] **Focus traps** in every overlay (filter sheet, compare, lightbox, AI, 3D) + page-shell `inert`/`aria-hidden` while open + Esc dismissal. Detail overlays have NONE today.
- [ ] **Detail hero operable by keyboard/SR:** real listbox/region semantics, arrows reachable at all breakpoints, lightbox-open is a real `<button>`, slide changes announced.
- [ ] **Contrast:** lift `--t3` (≈3.6:1, fails) to ≥.62 and `--t4` (≈1.9:1) to ≥.50; audit green/amber small text.
- [ ] **Segmented duration = `role=radiogroup`** with `aria-checked` (not class-only).
- [ ] **Icon/emoji a11y:** stateful labels; `aria-hidden` on decorative emoji with meaning carried by adjacent text.
- [ ] **Skip-link** ("Skip to results"/"Skip to listing") as the first focusable element.
- [ ] **`aria-busy` on `#grid`** while fetching; announce empty-state via `role=status`.
- [ ] **Target size ≥44px** on `.iact`, `.counter`, `.xc`, facets.
- [ ] **Un-nest** card action buttons from the card `<a>`.
- [ ] **Reduced-motion as a branch**, not a blanket kill.
- [ ] **Scope RTL out explicitly** (Rome market = EN/IT; physical-property layouts make RTL a rewrite, not a flag-flip).

### 4.4 SEO & Shareability (must-haves)

- [ ] **Flip `noindex,nofollow`** → `index,follow,max-image-preview:large` — but only after the head/JSON-LD/SSR gaps close, and only on the canonical routes.
- [ ] **Detail OG/Twitter/canonical** — port the ~20-tag head from production `apartment-detail.html`; **per-listing OG image** from `IMGS[0].full` (the single highest-leverage share win).
- [ ] **Detail JSON-LD** Apartment + Offer + BreadcrumbList from `mapReal()` data; map `availableFrom`→`availabilityStarts`, rented→`SoldOut`.
- [ ] **SSR the head** (reuse the proven `api/listing.js` injector) — client-only rendering = empty SERP + broken WhatsApp/X unfurls.
- [ ] **Unique per-listing `<title>`/description** at runtime AND in SSR (static title today = duplicate-title defect).
- [ ] **Discovery canonical** → `/apartments` (self-referential, strip volatile params) so filter permutations don't fragment crawl; **ItemList JSON-LD** for the grid.
- [ ] **Register clean routes** in `vercel.json` + sitemap; never index the previews under their literal filenames.
- [ ] **Real internal links** (`/listing/:id`, not `href="#"`) so authority flows discovery↔detail↔similar.

**Top risks:** promoting a preview as-is regresses live SEO (treat production parity as the floor); JSON-LD built from SAMPLE fallback data = false structured data → manual action; filter-URL crawl-budget explosion without canonical.

---

## 5. Implementation Sequence

Ordered so each batch delivers a felt jump and unblocks the next. Ship in this order.

### Batch 0 — Foundations & ship-readiness gates (do first; nothing else is real without these)
1. **Publish the motion token scale** (`--d-*`, `--ease-*`, `--ease-spring`) into both files' `:root`; sweep-replace inline durations. *(2.2)*
2. **Unify routing** — `/listing/:id` rewrite + path-OR-query id read. *(prereq for 3.5, 3.11)*
3. **Wire the primary CTAs to the real `leads` funnel**; remove the `alert()` stub and every "prototype/sample/demo" string. *(B11, 4.1)*
4. **Make "Reserve €300" real or honest.** *(4.1)*

*Felt jump: the page stops lying; everything downstream has tokens and routes to build on.*

### Batch 1 — Perceived performance & the no-lie data layer (the biggest "feels instant" jump)
5. **Detail layout-locked skeleton**; kill the sample-data flash on `?id=`. *(3.7, 3.11, 3.12)*
6. **`dataState` machine + provenance + error/offline states** on both pages. *(3.12)*
7. **Intrinsic image dimensions + LCP preload + `srcset`/`sizes`**; blur-up LQIP on cards. *(3.9, 4.2)*
8. **FLIP reconcile** on the discovery grid (kills the keystroke blink + image re-decode). *(3.8, 3.9)*

*Felt jump: filtering rearranges physical cards; the detail page never reflows; failures read as calm recoverable pauses.*

### Batch 2 — The flagship continuity moment
9. **Shared-element list→detail handoff** (photo + price morph). *(2.3, 3.11)*
10. **Scroll-restore + bfcache** so Back lands on the exact card. *(3.11)*

*Felt jump: the #1 native-app tell — the photo never blinks; list↔detail feels like one surface.*

### Batch 3 — The decision instrument (conversion core)
11. **Sliding-pill segment + living ledger countUp + branded date field + optimistic Apply + sticky-decision arbitration.** *(3.2)*
12. **Hero gallery shared-element zoom + decode-gated lightbox + pinch/focus-trap.** *(3.1)*

*Felt jump: the price engine feels like a live instrument; the gallery feels like a real photo viewer.*

### Batch 4 — Depth & trust differentiators
13. **Money-decoded computed ledger + spine.** *(3.3)*
14. **Trust & aftercare chain** (verification-green keystone, evidence ledger, aftercare card, pre-opened legitimacy). *(3.6)*
15. **Similar smart-match live fit + carousel.** *(3.5)*
16. **Real MapLibre** on discovery (clustered, synced pins) **and** detail (3D flyover + isochrones). *(3.10, 3.4)*
17. **Analytical compare matrix.** *(3.10)*

*Felt jump: BOOM out-honests the portals; the map stops being a gimmick.*

### Batch 5 — Polish, calm, and the a11y/SEO floor (market gate)
18. **Press haptics + staggered reveals + hero parallax + bg-system deferral.** *(3.7, 2.2)*
19. **Search-filter Apple sheet** (focus trap, drag-dismiss, clearable state, gold-dot on-state). *(3.8)*
20. **Full a11y pass** — skip-links, target sizes, contrast lifts, reduced-motion branches, un-nest card actions, radiogroup segments. *(4.3)*
21. **SEO pass** — flip robots, SSR head, JSON-LD from real data, canonical/sitemap, OG images, real internal links. *(4.4)*
22. **Social proof + WhatsApp rail + save-store unification + fit-on-tap.** *(4.1)*

*Felt jump: clears every Experience Bar; indexable, shareable, accessible — market-ready.*

---

### Sequencing principle

Each batch is independently shippable and leaves the surface better than it found it. Batches 0–2 deliver the largest *perceived* jump for the least code (tokens, skeletons, FLIP, one shared-element transition). Batches 3–4 are where the conversion and trust depth lives. Batch 5 is the non-negotiable floor — a surface is not market-ready until it passes Section 1's bar with the gold covered, the motion disabled, and the mouse unplugged.

WROTE apple-tech-elevation-spec.md
