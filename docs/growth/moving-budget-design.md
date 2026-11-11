# Moving budget · Design refinement

Scope: `/moving-budget`, existing BOOM identity, existing facts and calculation engine. Mode: Operate, with a concise introduction that explains the job. The mandate is a distinctive, fluid experience that makes the service easier to understand and trust.

Skills applied: Impeccable (bolder/polish and craft floor), Apple Design and Emil Design Engineering. Refinement uses the existing black, white and gold palette, Helvetica typography and the destination codes already used by BOOM Desks. No rebrand, stock imagery, animation library or new claim of competence.

| Before | After | Why |
|---|---|---|
| City selection below the introduction | Functional destination panel in the first screen, with the real desk code | The visitor starts the task while understanding it |
| Nine rows in one long page | Arrival, monthly and review navigation with counts of entered lines | Makes the work legible without hiding useful content |
| Mobile result after all fields | Compact sticky summary linked to the full result | The effect of an edit remains visible on a small screen |
| Missing costs listed as plain text | Focusable links to the specific control, plus “Continue” | Helps recover from uncertainty and invalid input |
| Amounts labelled only in the introduction | Currency also appears in each amount placeholder | Reduces mistakes when switching destinations |
| Passive buttons | Immediate press feedback, deliberate hover/focus states, reduced motion | Interaction acknowledges input without delaying calculation |
| Decorative Unicode arrows | Consistent authored SVG arrows for navigation | Clear geometry and consistent rendering |
| Static asset version `1` | CSS and controller content hashes | The preview loads the revised interaction rather than cached code |

## System and limits

Palette: canvas `#060607`, surface `#0c0c0e`, text `#ffffff`, quiet text `#b8b8bb`, gold `#ffd700`. The white summary is a working document on the black canvas. Colour does not replace labels. Typography keeps the BOOM system and uses tabular numerals for amounts; heading tracking stays at or above −0.04em. Touch controls remain at least 44px high.

The code does not manufacture a confidence score. “Confirmed” means the visitor selected a confirmed quote; the counts measure entered fields only. Money updates immediately. There is no artificial loading, countdown, scarcity, success celebration or claim that a completed worksheet guarantees a home. Reaching nine entered lines still asks the visitor to review estimates.

Movement is limited to direct button feedback and pointer hover; keyboard focus and numerical updates do not wait for motion. The sticky mobile surface uses translucency to distinguish content scrolling underneath; reduced transparency and increased contrast make it solid. No persistent personal data, automatic request or payment is introduced.

## Verification

`movingbudget` covers arithmetic and generated facts. `movingbudgetui` exercises the real browser controller at 320, 390 and 1440px, the three visible navigation steps, mobile dock, recovery focus, independent currencies, print, reduced motion and no-JavaScript fallback. It reports SKIP explicitly when Playwright is unavailable.

Manual Chrome verification in this session: destination selection and real AMS code; review moves focus to the summary; Continue moves focus to the missing certainty selector; a 1,400 confirmed amount changes arrival cash and expenses immediately and advances to deposit. The mobile pass found and corrected an inherited navigation rule that hid the third step. Production remains gated by the existing PR/main release path.

The Impeccable detector was run once on the changed template, CSS and controller. It reported a font warning and contrast pairs spanning screen/print rules. Helvetica is deliberately retained from the incumbent BOOM system. Screen secondary text is `#b8b8bb` on `#060607`; the white summary uses `#505054` / `#555`, and confirmed labels turn black in print. The reported quiet-on-white and black-on-dark pairings are not the intended rendered combinations; review used the stylesheet scopes and actual Chrome rendering. This does not replace a full assistive-technology audit.

Final browser run: **29 passed, 0 failed**, using an isolated Chrome session and Playwright installed only in `/private/tmp/boom-browser-qa` (no production dependency changes). This run also verifies the rendered contrast of secondary text on both dark and white surfaces. Desktop and mobile captures are saved in the local delivery dossier. The previous local Playwright skip is superseded for this new `movingbudgetui` suite; other unrun browser suites are not implied to have passed. UI refinement and public last-modified date: 10 November 2026.

Full-site CI follow-up, 11 November: `telefono` found undersized certainty selectors and `scroll` found the missing shared scrolling contract. Selectors now use 16px, and the budget generator embeds `scrollBlock()` from the existing source. Local real-Chrome rerun: `movingbudgetui` 29, `telefono` 2 and `scroll` 4 checks passed; five arithmetic/SEO suites also pass. The earlier full-suite CI failure is not a green run. Publication was explicitly approved by Valentino on 11 November.
