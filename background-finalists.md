# BOOM Page Background — Finalist Shortlist

The judged candidates and fresh alternatives, scored and tuned, so we can finalize the site's page-background system.

## Recommendation

Ship **Guilloché** as the site default. It is the only candidate that is already reading-safe as shipped (readability 8, calm 9, total 44) while also topping the set on uniqueness (10) and brand fit (9) — a banknote-grade rosette + hypotrochoid weave placed as a single faint off-centre top-right flourish under the POOL mask, so the precious detail recedes behind content and the left text column sees near-bare background. Cap the inner-ring peak to ~0.14 and make the placement responsive on mobile, and it carries every surface. As **accents**, use **Cassettoni** (the iconic Pantheon coffered dome — the single most unmistakably-Roman candidate) for hero/landing and apartment-detail headers once its oculus/coffer opacity is halved and the mask/dome offset is corrected, and **Marmo** (literal Carrara/travertine veining, cheap because static) as the soft editorial veil for prose-heavy, card-based pages once its `op` is cut from 0.8 to ~0.55. Keep **Deco** strictly for art-directed, text-light splash surfaces (login, pass-delivery, section dividers) — never behind dense copy.

## Ranked Candidates

| Rank | Candidate | Read | Unique | Brand | Perf | Calm | **Total** | Verdict |
|---|---|---|---|---|---|---|---|---|
| 1 | **Guilloché** | 8 | 10 | 9 | 8 | 9 | **44** | Most premium and most distinctive; reading-safe as shipped — cap inner ring, make placement responsive. Ship as default. |
| 2 | **Cassettoni** | 6 | 10 | 9 | 8 | 7 | **40** | Most unmistakably-Roman (Pantheon dome), but dense rings + oculus sit in the mask's hot zone — halve peak opacity and offset the mask/dome before trusting behind top-right content. |
| 3 | **Marmo** | 6 | 6 | 9 | 8 | 7 | **36** | Most on-brand and cheap (static veining), but at op:0.8 the warm-white veins drop body text to ~2.9:1 — cut to ~0.55 with a cooler, thinner vein. |
| 4 | **Deco** | 6 | 7 | 7 | 8 | 5 | **33** | Premium 1920s corner sunburst that frames a hero beautifully, but straight gold rays cut through prices/paragraphs — text-light surfaces only, spokes dimmed hard, add length falloff. |
| 5 | **Travertino** | 6 | 6 | 7 | 6 | 7 | **32** | Genuinely premium tactile Roman stone, but ships far too hot (op 0.85) with the wrong mask (SOFT keeps it under copy) and a horizontal sediment band that fights small text. |
| 5 | **Streamlines** | 6 | 8 | 6 | 7 | 5 | **32** | Most original — a contemporary engineering-schematic field — but flat 1px gold lines at 0.30 peak are the readability risk; tamed under POOL it's a strong grid/hero accent, weak for long-form. |

*(Travertino and Streamlines tie at 32. Travertino edges Streamlines on calm; Streamlines edges Travertino on uniqueness.)*

## Top 4 — Exact Tuning

### 1. Guilloché — total 44 — **ship as default**

- **Recommended opacity:** 0.10–0.14 effective ink on near-black. The generator already self-grades strokes 0.10→0.20 per ring at 0.4–0.5px; keep layer `op:1` but cap the inner-ring peak (currently 0.20) to ~0.14 so the densest concentric band can't compete with right-aligned prices/cards.
- **Mask:** POOL — correct as shipped. The POOL mask (94% 88% at 79% 12%) holds the top-right brightest, while the rosette center sits lower at 74%/36%, so the densest inner engraving lands in the mask's mid-knockdown zone and the weave fades to transparent before reaching the left text column. SOFT would push the busiest rings under center-stage copy; NONE would expose full-opacity engraving behind text.
- **Best used on:** Trust/value surfaces where the banknote semantics reinforce the message — index/landing hero (top-right of the fold), pricing and offer sections, contract/Magic-Sign and Apple Wallet pass-delivery pages, and the owner/landlord dashboard. Avoid as the default on dense listing grids (`apartments.html`) where many right-aligned price chips would sit on the inner rings — Streamlines/Marmo suit those better.
- **Production fixes:**
  - Cap the inner rosette opacity: change the per-ring formula so the brightest ring is ~0.14 not 0.20 (e.g. `(0.14 - r*0.018)`), keeping outer rings fainter — protects right-column prices/cards overlapping the 74%/36% center.
  - Make placement responsive: on narrow viewports (<768px) the fixed 74%/36% center plus min(W,H)-based radius shrinks the rosette into the center of a tall phone screen, landing under body copy. Shift cx toward 0.85, lift cy toward 0.22, and clamp base to `min(W, H*0.55)` so it stays a corner flourish on mobile.
  - Reduce path point counts for the one-time rasterization: N=480 per rosette ring and M=12*240 (2880 pts) for the weave is overkill at hairline width — N=320 and M=8*240 are visually identical and cut ~35% of segments, helping low-end mobile first paint.
  - Gate the separate `.bb-grain` feTurbulence overlay (opacity .24, mix-blend overlay) — that filter, not this generator, is the real GPU/paint cost and can lift the guilloché ink unpredictably over text; lower grain to ~.16 or drop it on this background.
  - Round all path coordinates to integers (`P()` already uses `toFixed(1)`) and consider rendering the SVG once to a cached data-URI / OffscreenCanvas so the debounced (180ms) resize rebuild doesn't re-tessellate ~5.7k segments on every orientation change.
  - Verify the foil gradient direction (x1 0 y1 0 → x2 0.55 y2 1) doesn't put the brightest `#FFEAAE` stop in the lower-left where it could approach left-column text; bias the gradient so peak luminance stays top-right under the pool mask.

### 2. Cassettoni — total 40 — **hero accent**

- **Recommended opacity:** 0.07–0.10 effective on near-black (drop the dome's max coffer-stroke band from 0.24 to ~0.12, and the oculus fills from 0.12/0.07 to ~0.05/0.03). Keep `texWrap` container opacity at 1 and dim inside the SVG instead, so the POOL mask still does the shaping.
- **Mask:** POOL — but INVERTED/repositioned. Current POOL is brightest at 79%,12%, exactly where the dome center (74%,30%) and oculus sit, so it amplifies the busiest region. Keep the pool concept (single off-centre hero, clean left reading column) but move the mask's solid anchor to the empty lower-left and let it fade toward the dome, OR pull the dome down/right so its dense rings clear the content column. SOFT would flatten the deliberate single-instance composition; NONE is unusable (oculus + outer rings at full strength over content).
- **Best used on:** Hero / landing sections, apartment-detail headers, login/auth and pass-delivery screens — any page where the top-right is imagery or sparse UI and reading content lives in the left/center column. Already wired as the apartment-detail + `apartment_*` default in `pageDefault()`. Avoid on dense data surfaces (`portal.html` dashboards, tables, the PFS command center) where content fills the full width including the top-right hot zone.
- **Production fixes:**
  - Reduce the oculus fills: the two center circles at `rgba(255,232,170,0.12)` and `rgba(255,224,150,0.07)` are the biggest readability risk because they sit at 74%,30% — a common spot for top-right hero copy/price. Halve to ~0.05 and ~0.03, or clip the oculus so it only shows where no content lands.
  - Cap the coffer-stroke opacity ramp: it climbs to `0.07+0.17*6/7 = 0.216` (outer band ~0.24). Cap the formula at ~0.12 (e.g. `0.05+0.09*kk/rings`) so even the brightest ring stays below the text-contrast threshold.
  - Fix the mask/dome overlap: POOL anchors solid at 79%,12% which amplifies the densest dome region. Either re-anchor the pool gradient to the lower-left (`#000` at ~25%,80%) and fade toward the dome, or shift the dome center to ~80%,22% so its rings clear the content column.
  - Decouple `.bb-glow` and oculus: the global `.bb-glow` radial sits at 79%,4% and the oculus at 74%,30% — two warm bright sources stack in the top-right. Dim `.bb-glow` to ~0.04 on cassettoni pages so they don't compound.
  - Test the dome WITH the `.bb-grain` overlay (opacity .24, mix-blend overlay) on — overlay blend can brighten the already-bright outer rings; if so, reduce grain to ~.16 on this background.
  - Add a content-safe class or auto-detect: when cassettoni is active on a full-width data page, automatically downshift effective opacity (or fall back to marmo/soft) so dashboards never get the hero dome behind tables.
  - Precompute and cache the 179-element SVG string per (W,H) bucket instead of rebuilding 24 sectors × 7 rings of trig on every resize debounce; rounding W/H to 160px buckets avoids regenerating ~179 paths during window drags on low-end devices.
  - Bake to a static asset for production: this is a single non-animated instance — render `gCassettoni` once to an inline data-URI / pre-generated SVG (or a 1× WebP at the masked opacity) and skip the runtime JS trig + DOM string build entirely.

### 3. Marmo — total 36 — **editorial accent**

- **Recommended opacity:** 0.10–0.14 on near-black — drop `DEF.marmo.op` from 0.8 to ~0.55 (peak vein effective alpha falls from ~0.25 to ~0.17). The `op` knob multiplies a texture whose internal peak is already 0.62, so 0.55 lands the brightest filaments in the safe 0.10–0.14 perceived range; the cloud base is already faint (typical ~0.08).
- **Mask:** SOFT — keep the radial mask it already ships with. Marble has no single focal point (unlike cassettoni/guilloché), so an even, edge-fading veil is correct; a POOL mask would clump the brightest veins into one corner and create an unbalanced bright zone. SOFT also pulls texture away from the central reading column. Do NOT use NONE — full-bleed veins put peak-bright filaments under bare body text.
- **Best used on:** Editorial / low-density pages where text sits in cards or short columns — index/landing hero, apartment-detail prose blocks, About, blog posts, the contract/pass marketing surfaces. Weakest on data-dense bare-text screens (long Firestore listing grids, portal tables) where paragraphs sit directly on the background with no card — there it needs the opacity drop most. Avoid behind small bare gold figures.
- **Production fixes:**
  - Lower `DEF.marmo.op` from 0.8 to ~0.55. At 0.8 a peak vein reaches ~0.25 effective alpha of luminous `#F0DDA8` (lum 0.73) on near-black, dropping `#cfcfcf` body text from 13:1 to ~2.9:1 — below WCAG AA. At ~0.55 the worst case returns toward ~3.8–4.3:1 and cards stay fully safe.
  - Cool/desaturate the vein flood color: `#F0DDA8` is very light-warm and is the single biggest contrast offender. Shift to a dimmer brass like `#C9A24A` or reduce the `feFuncA` peak from .62 to ~.45 so the brightest filaments are less luminous against text.
  - Tighten the vein threshold band: `tableValues='0 0 0 .12 .62 .12 0 0'` actually passes ~45% of the turbulence domain (broad cloudy veins). Narrow to e.g. `'0 0 0 0 .55 0 0 0'` for genuinely thin filaments that touch far less text area.
  - It's static (no motion guard needed), but DO gate the initial paint: 2× full-viewport octave-3 feTurbulence can jank first paint on low-end mobile. Render the texture to an offscreen canvas/dataURL once, or defer `build()` to `requestIdleCallback` so it never blocks LCP.
  - Pre-rasterize to a static asset: bake the marmo SVG to a single WebP/AVIF (or inline 1× dataURL) at the masked opacity. Removes the live-filter cost and guarantees identical rendering across browsers (Safari rasterizes feTurbulence differently).
  - Verify the `.bb-grain` overlay (opacity .24, mix-blend overlay) doesn't re-brighten vein peaks — overlay blend lightens mid-tones and can push a light vein brighter than computed. Test grain off vs on over body text; cap grain at ~.15 if it amplifies veins.

### 4. Deco — total 33 — **art-directed splash only**

- **Recommended opacity:** 0.06–0.10 effective on near-black (drop layer `op` to ~0.5–0.6 and/or halve the per-stroke opacities; 0.12 spoke rays are too hot near content).
- **Mask:** POOL.
- **Best used on:** Hero / landing splash, `login.html`, `pass-delivery.html`, and section dividers — surfaces that are art-directed and text-light. Strong as an above-the-fold first impression where the corner sunburst frames a headline. Weakest on dense, scroll-heavy reading surfaces (apartments listing grid, apartment-detail spec paragraphs, portal tables) where long straight rays run through prices and body copy.
- **Production fixes:**
  - Cap and soften the rays: the `i%4===0` spokes at opacity 0.12 + width 1.1 are the readability risk — drop to ~0.07 and width 0.9, and thin rays to ~0.035. A straight high-contrast line behind text causes more letter-edge interference than any cloudy texture.
  - Add a radial falloff so each ray dies before mid-canvas: append a stroke-opacity gradient (or a second mask) that zeroes lines past ~55% of length, so rays read as a corner burst, not full-width streaks across the content column.
  - Reduce ray count from 52 to ~32–36 to cut visual busyness (helps the calm problem) and shave DOM nodes; 52 lines + 7 arcs is fine for perf but denser than needed.
  - Bump the arc weight slightly (arcs at 0.05 nearly vanish under the grain overlay) OR drop them — they contribute almost nothing while the rays dominate, making it read as plain sunburst rather than "rays + concentric arcs".
  - Guard against the left-handed reading column: BOOM body copy and cards sit center/left, rays travel down-left toward them. Either flip the fan to hug the right edge tighter (narrow the 0.62π sweep to ~0.45π) or nudge `fx` fully off-canvas (`W*1.02`) so the dense convergence point is outside the viewport.
  - Turn off / dim on dense surfaces via the existing `pageDefault()` routing — keep deco for hero/login/pass pages, fall back to marmo or none on apartments/apartment-detail/portal.
  - Lower grain interaction: the global `.bb-grain` overlay at .24 sits on top of the gold foil; on bright spokes this can shimmer/alias on cheap panels. Mask grain out of the top-right hot zone or reduce to .18 when deco is active.
  - Static, so motion guard is moot, but add `prefers-contrast`: when high-contrast is requested, force `key='none'` so the rays never compete with text for low-vision users.

## Fresh Alternatives Proposed

Three new concepts designed to fill the gaps the judged set leaves — specifically a maximally-recessive default for the densest data pages, and a calmer Roman corner-medallion than the existing radials.

### Tessellato — sparse Roman mosaic field

A sparse, jittered Roman mosaic (opus tessellatum / vermiculatum) of irregular gold tesserae scattered on black, thinning toward the central reading column so listings and prices sit on near-bare ground. Roman to the bone (every Domus and basilica floor is mosaic) without being a busy radial or a vein network that crosses text. The "redundant wallpaper" problem is solved structurally: tiles are jitter-placed, randomly rotated, randomly skipped (grout gaps), and opacity-graded from a fixed PRNG seed, so the eye reads scattered chips of gold leaf, never a grid. Same dot-texture family as marmo, but more legibly recessive because it is discrete low-contrast specks, not continuous tone or lines.

**Build approach:** New `gen(W,H)` returning a single full-viewport SVG instance. Deterministic `mulberry32(seed)` PRNG so each load paints identically (no flicker) yet is spatially non-repeating. Grid-walk gx,gy at cell=44 from -cell to W/H+cell; per cell: `rnd()<0.32` → continue (grout gap); else `x=gx+(rnd()-.5)*2*jit`, `y=gy+(rnd()-.5)*2*jit` with `jit=cell*0.42`; `w/h = cell*(0.30+rnd()*0.34)`; `rot=(rnd()-.5)*22deg`. Emit `<rect x y width height rx=1.2 transform=rotate(rot x y) fill=url(#bbFoil) opacity=op/>`. Key readability move: `colFade=min(1,abs(x - W*0.5)/(W*0.34))`; `op=(0.04+0.13*colFade*rnd())` so tesserae fade to ~0.04 near the center column and only reach ~0.17 at the margins. Reuse the existing FOIL gradient verbatim. Register as `{nm:'Tessellato', gen:gTessellato, mask:SOFT, op:0.9}` — SOFT centers the fade and lets edges recede. Verified: ~548 rects, ~74KB static markup, single pass, no animation, no SVG filter. Strongest readability of the three behind dense content (the colFade actively starves the reading column to ~0.04); zero periodicity from the continuous PRNG stream; GPU-cheaper at paint than the filter-based marmo/travertino.

### Acqua — still-water caustic

A near-formless field of very soft gold caustics — late light on still water in a Roman fountain basin, or the sheen off travertine after rain. Reads as atmosphere, not pattern: large slow blooms of warm gold with no hard edge anywhere. The maximally-recessive option — even softer than marmo — for the pages where content density is highest and any motif would be a liability. Roman via the water association (Trevi, the aqueducts, fountain basins) rather than a literal geometric motif, so it stays quiet and timeless.

**Build approach:** Pure filter generator (same family as marmo/travertino, no path math). `gen()` returns `<defs><filter id=bbAqA>` with: `feTurbulence type=fractalNoise baseFrequency=0.006 0.009 numOctaves=2 seed=21 stitchTiles=stitch` → `feDisplacementMap scale=40` (warps the noise into liquid lobes instead of marble mottle) → `feColorMatrix` mapping to warm dark gold (`'0 0 0 0 .20  0 0 0 0 .17  0 0 0 0 .09  .20 .16 .07 0 0'`) → `feGaussianBlur stdDeviation=1.4` to kill residual graininess. Then a single `<rect width=100% height=100% filter=url(#bbAqA)/>`. Register as `{nm:'Acqua', gen:gAcqua, mask:SOFT, op:0.8}`. The displacement+blur are what separate it visually from marmo (no displacement, sharper vein contrast). Verified: ~428-byte payload, 4 filter primitives, one rect. Highest readability margin of all nine — no edge, line or discrete shape, only smooth low-contrast tonal drift, so nothing can align with or cut through a line of type; safest possible choice for spec sheets, contracts, price tables. Filter computed once on load/resize, no animation, GPU composites a flat bitmap thereafter — comparable cost to marmo/travertino.

### Bussola — off-canvas Cosmati medallion

A single large Cosmatesque inlay medallion — concentric rings plus fine radiating spokes, the geometry of a Cosmati pavement rota — anchored mostly off-canvas in the top-right corner, so only a quiet arc of it enters the frame. Unmistakably Roman (Cosmati floors in San Clemente, Santa Maria in Cosmedin) and premium like a wax seal or compass rose, but unlike guilloché/deco/cassettoni it is ONE calm ring system, not a dense rosette — so almost nothing crosses the central content. Occupies the same top-right "corner medallion" niche as deco/guilloché at a fraction of the line density.

**Build approach:** `gen(W,H)`: `cx=W*0.90`, `cy=H*0.04` (center pushed off the top-right corner), `R=min(W,H)*0.92` so ~70% of it is off-canvas. Reuse FOIL. Draw 5 concentric rings at radius factors `[0.34,0.55,0.7,0.86,1]` as `<circle fill=none stroke=url(#bbFoil)>` with alternating stroke-width 0.9/0.5 and opacity stepping 0.14 down to ~0.07. Then 32 radiating spokes between `r0=R*0.55` and `r1=R*0.86`: loop k, `ang=k/32*2PI`, emit `<line>` from `(cx+r0 cos, cy+r0 sin)` to `(cx+r1 cos, cy+r1 sin)` stroke-width 0.5 opacity 0.08. CRITICAL: register with the POOL mask — `{nm:'Bussola', gen:gBussola, mask:POOL, op:1}` — POOL's hotspot at 79%/12% keeps the visible arc in the upper-right and fades it to transparent over the reading column. Verified: ~38 elements (5 circles + 32 spokes + gradient), ~4KB. Max stroke opacity 0.14 on the outer ring, spokes 0.08; the reading column sees essentially bare background. Single instance, one center → zero periodicity. The lightest geometric option in the entire set (~37 vector primitives, no filter, no blur, no animation), best on landing/hero and detail pages rather than the densest tables.

WROTE background-finalists.md
