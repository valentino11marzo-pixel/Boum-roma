# BOOM · Design Language Study — “Roman Deco-Machine”

**Goal:** stop iterating background variants (that's the redundancy that fatigues),
and converge on **ONE signature design language** to apply across the whole site —
world-class, unmistakably BOOM-in-Rome, and engineered so using it feels almost
*addictive*, without ever slowing real content.

**Live study page:** `/preview-design-study.html`

---

## Recommendation

Adopt a single language and apply it everywhere (nav, components, listing cards,
ledgers, forms), starting with **apartment-detail** and **apartments** on top of
the engines they already have. Do **not** keep producing parallel background
studies — pick the texture *inside* this one language and move on.

## The direction: Roman Deco-Machine

Three forces, fused — not three themes side by side:

| Force | What it contributes |
|---|---|
| **Roman Art Déco** (EUR, travertine arches, rationalism) | monumental geometry, symmetry, stepped/arched forms, fluted (reeded) lines, sunburst — *historically Roman*, not generic deco |
| **Industrial precision** | machined corner brackets, hairline technical rules, blueprint grid, monospace metadata, “spec-sheet” data rows, rivet/seam detail |
| **Ultra-tech response** | tactile, physics-feeling micro-interactions that reward every action instantly |

### Tokens
- **Void** `#060607` (base) · **Ink** `#0A0A0C` / surfaces `#0E0E11`–`#16171B`
- **Gold** `#FFD700` (+ light `#FFE779`, deep `#C99B12`) — accent & edge-light, **not** fill
- **Bone** `#C9BFA8` — travertine neutral, for technical type & rules (the new, distinguishing colour)
- **Tech** `#5FE3E0` — cyan, used *sparingly* only for anything **live** (counts, real-time)

### Type
- **Display:** Helvetica Neue 200, tight tracking, monumental (emotion)
- **Mono:** Space Mono — all facts: prices, m², codes, coordinates → data reads like a machined spec sheet
- **Body:** Inter 300

### Signature components
machined-corner panels · segmented **tactile toggle** (spring “thunk”) · gold CTA with engraved corners · technical key/value spec rows · listing card as a **spec sheet** (mono metadata + display numerals) · cost **ledger** with roll-up.

### The “addictive” interactions (and why they stay fast)
1. **Magnetic CTAs** — gold buttons lean toward the cursor, spring back. `transform` only, rAF-throttled.
2. **Weighted toggle** — segmented slider with spring easing, like a real switch.
3. **Number roll-up** — costs/stats tick up **once** on reveal (a small dopamine confirm). No loops.
4. **Fluted light** — machined reeds catch a gold highlight that follows the pointer (CSS var).
5. **Scan-line reveal** — a thin gold line “reads” each section in on arrival.
6. **Cursor-aware card tilt/bevel** — desktop only.

### Guardrails (so it never becomes the problem)
- `transform`/`opacity` only — GPU-cheap, no layout thrash.
- Pointer effects **desktop-only** (`hover:hover`); touch gets crisp taps.
- `prefers-reduced-motion` fully honored → everything instant.
- Effects fire **once**, never idle-loop (battery/INP safe).
- Content always wins — never blocks reading a price or paragraph.

### Do NOT
- No repeating wallpaper / tiled monograms.
- No decorative motion that doesn't confirm an action.
- No more than one accent (gold) + one live colour (tech) on screen at once.
- No texture that survives over body text (always focal-masked / low-contrast).

## Applying it
- **apartment-detail:** nav + hero numerals (display) · gallery as machined frame · **money ledger** with roll-up · spec-sheet facts · magnetic Apply/CTA · keep all existing engines (3D, video, AI, SEO).
- **apartments:** filter pills as machined controls · cards as spec sheets · price roll-up on reveal · the tactile toggle for list/map · facets in mono.

---
*Synthesis by the BOOM design study. Non-production; for review before applying to live pages.*
