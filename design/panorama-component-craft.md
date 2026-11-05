# BOOM Panorama — component craft, 6 November 2026

The original black/yellow identity, Solari, globe and real service journeys remain
binding. This pass addresses the user's rejection of ordinary-looking controls:
precise anatomy and useful state feedback, rather than more effects or libraries.

## What changed

- Destination pass: code, action label, separate black arrow compartment. Standard
  primary actions use a 56px minimum height; compact tools use 48px, with a 44px
  minimum where the existing globe toolbar requires it. The larger hero pass is
  76px (72px on phone). Utility corners are 8px; main actions/passes are 12px.
- City choices are separate stable cells. The selected one remains solid yellow;
  the name and original pressed state communicate selection without colour alone.
- The globe has an aligned upper rail for city architecture and Full view, plus a
  lower rail for destination, scope, Reset and source attribution. The same canvas
  and controllers are preserved; height accounts for every control, without clipping.
- Rome services use two full-width tickets: title/conditions, process/scope, fare.
  The yellow fare area groups actual price with its fee note and a black action.
  The whole ticket remains one link; the visual action does not nest another control.
  Tablet uses two columns; phone stacks content, fare and full-width action.
- Form focus, selected offers, disabled controls and hover/press states use shared
  tokens. Existing dynamic action labels get a decorative authored arrow; their
  words remain the source of the action. No price, promise, deadline or claim changed.

## Motion contract

Button press feedback is 140ms, including touch. Arrow motion uses a 220ms
exponential ease-out and a 2–3px travel, only on fine-pointer hover. Repeated
controls do not move the surrounding layout.

The one new authored transition is a changed service choice: its real data commits
immediately, then the content moves 6px/fades for 220ms. It runs only after a direct
pointer selection, never for initial rendering, unchanged selection or keyboard
activation. A tracked single frame follows native event dispatch; capture-listener
microtasks can run before the original bubble handler and are unsuitable here.
A new choice, keyboard input, pause, reduced motion, hidden page, history change
or pagehide cancels pending/running presentation. No timers, persistent loop,
secondary service state or extra dependencies were introduced.

## Sources and interpretation

- [IBM Carbon button guidance](https://www.carbondesignsystem.com/building-blocks/core/components/button/guidelines): consistent action hierarchy and anatomy.
- [IBM Carbon motion](https://www.carbondesignsystem.com/building-blocks/foundations/motion/overview): separate frequent control feedback from more expressive transitions.
- [Apple motion guidance](https://developer.apple.com/design/human-interface-guidelines/motion): purposeful, optional and interruptible motion.
- [Linear's UI redesign](https://linear.app/now/how-we-redesigned-the-linear-ui): alignment and complete state coverage compound across the interface.

The specific sizes, composition and timings above are BOOM decisions informed by
those principles, not copied component styling or claims of improved conversion.
Impeccable, Animate and Emil design-engineering guidance informed the implementation.

## Verification

The new eleventh Panorama scenario observes actual browser animation objects and
painted styles. It covers rapid replacement, completed state, unchanged choice,
keyboard focus, pause/reduced interruption and the canonical London price/scope.
The prior ten scenarios remain, including all six cities and fifteen service pairs.
Rendered review covers 320/390/900/1440px, with no horizontal overflow or page errors.
One scoped Impeccable run returned only the original Solari Helvetica warning; this
font is deliberately preserved under the user's explicit brand instruction.
