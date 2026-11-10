---
name: BOOM City Editions
description: An opt-in architectural artwork view over the native Airspace decision surface.
colors:
  primary: "#ffd700"
  scene: "#000"
  paper: "#fff"
  control-rule: "#55554d"
  art-amber: "#f2a42b"
  art-orange: "#ee6d28"
  art-red: "#dd3e39"
  art-magenta: "#b92c64"
  art-violet: "#7137b7"
typography:
  introduction:
    fontFamily: '"Helvetica Neue", Helvetica, Arial, sans-serif'
    fontSize: "28px"
    fontWeight: 300
    lineHeight: 1.15
    letterSpacing: "-0.025em"
  control:
    fontFamily: '"Helvetica Neue", Helvetica, Arial, sans-serif'
    fontSize: "13px"
    fontWeight: 400
    lineHeight: 1.3
    letterSpacing: "0"
rounded:
  control: "3px"
  mode-group: "4px"
spacing:
  control-gap: "12px"
  phone-control-gap: "8px"
  phone-gutter: "20px"
  band-step: "20px"
  tablet-band-step: "16px"
  phone-band-step: "12px"
components:
  view-button:
    backgroundColor: "{colors.scene}"
    textColor: "{colors.paper}"
    typography: "{typography.control}"
    rounded: "{rounded.control}"
    padding: "10px 14px"
  view-button-selected:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.scene}"
    typography: "{typography.control}"
    rounded: "{rounded.control}"
    padding: "10px 14px"
  mode-group:
    backgroundColor: "{colors.scene}"
    rounded: "{rounded.mode-group}"
  pause-control:
    backgroundColor: "{colors.scene}"
    textColor: "{colors.paper}"
    rounded: "{rounded.control}"
    padding: "10px 14px"
  artwork-bands:
    width: "min(100%, 510px)"
---

# Design System: BOOM City Editions

## Overview

**Creative North Star: "The city as a graphic edition"**

The original architectural city mark sits inside six substantial coloured bands,
with the native Solari city name beneath. Architecture, geometry and destination
form one graphic scene. City edition and Globe are two views of the same selected
city, beside its original white decision surface.

This is the opt-in Dispatch composition `cityeditions`, extending the confirmed
BOOM identity in response to the supplied reel references. It does not replace
other compositions or PRODUCT.md. The [Airspace system](../airspace/DESIGN.md)
remains the reference for inherited typography, forms, service actions, city
navigation, company content and native globe. This document records only the
additions and explicit layout overrides.

**Key Characteristics:**

- Original BOOM architectural SVG at a meaningful scale.
- Decorative colour confined to the artwork.
- Original Solari, city selection, globe and service owners.
- Immediate view switching and a finite decorative construction.

Sources: [direction](../city-editions-direction.md),
[City Editions CSS](../../assets/boom-city-editions.css),
[City Editions controller](../../assets/boom-city-editions.js),
[shared Airspace CSS](../../assets/boom-airspace.css) and
[native edition easing](../../assets/boom-edition-club.css).
The supplied references inform the composition; no creator footage, artwork,
wordmark or audio is embedded. No new raster is generated. Existing founder
photography and listing imagery keep their original provenance.

## Colors

### Primary

BOOM yellow remains the action and focus colour. In the artwork it also supplies
the outermost band and the original emblem's accent layer.

### Secondary — artwork only

Amber, orange, red, magenta and violet follow the outer yellow band in that
order. They are flat border colours, not gradients or alternative service states.
Sidecar tonal ramps visualize those hues in the panel; they add no runtime colours.

### Neutral

Scene black carries the graphic composition. White draws the original landmark
structure and selected view control. The muted control rule separates the view
group and native Pause button from the scene.

**The Artwork Colour Rule.** Keep the five additional colours inside the
decorative architecture; actions and commercial content inherit BOOM/Airspace.

## Typography

The Helvetica Neue stack and light heading voice are inherited. The artwork
view's introduction uses the frontmatter role, reducing to (24px) at intermediate
widths. On phones it is visually hidden while retaining its accessible content;
the native Solari carries the visible destination. The Globe view hides that
introduction on phones. View controls use the control role, reducing to (12px)
on phones; the native Pause label is also (12px). No new display font is added.

## Layout

Above (1180px), the existing continuous black/white split becomes
`minmax(0, 1.65fr) minmax(430px, 1fr)`. Artwork is inset (112px 40px 240px)
inside the inherited sticky scene. Bands reach (510px) and the original emblem
reaches (480px), subject to available space. The decision surface starts with
(36px) top padding. The Solari sits below the artwork, above the six city choices.

From (761px) through (1180px), the inherited (1.25fr / minimum 350px) split
remains. Controls span the (28px) gutters; artwork is inset (130px 28px 270px).
Bands reach (390px). Globe mode reserves its own area with inset
(278px 0 232px). Its attribution sits in normal flow in a separate caption row,
between (28px) gutters, with minimum target height (44px); the row is (104px)
below the globe region and uses a minimum height of (46px).

At (760px) and below, the inherited (64px) navigation precedes a (488px) scene.
Controls sit (12px) from its top; artwork is inset (70px 20px 190px). Bands are
(246px) wide, capped at (90%) of their region; Barcelona uses (190px). The native
emblem is at most (300px) wide. Solari and all six city choices in a three-by-two
rail precede the decision surface, whose top padding becomes (28px). No nested
scene scrolling is introduced.

Phone Globe mode places its native region at inset (142px 0 144px), retains the
text label and SVG on Full view, and keeps attribution (20px) above the region's
bottom. Attribution remains on one line with `width: max-content`. Pause lives
in the upper control row in both views, with minimum width (88px), or (84px)
below (360px). Every new scene control keeps a minimum height of (44px).

## Elevation & Depth

The inherited shell remains flat and unframed. Six nested border shapes create
graphic depth behind the original SVG; they add no shadow or simulated material.
The artwork ignores pointer input and does not obstruct the native controls.

## Shapes

Bands are (10px) thick with the band-step spacing, becoming (8px) on intermediate
widths and (6px) on phones with their respective steps. Rome is an ellipse
(4:3); Madrid uses a rounded arch with small square lower corners; Barcelona is
a tall arch (4:5); Amsterdam uses rectilinear bands with (6px) corners; London
is a wide capsule (3:2); Milan retains concentric circles. These shapes belong
to the artwork, not the form or action vocabulary.

## Components

### Scene mode and native Pause

City edition is initially selected. Its white control and the dark Globe control
use `aria-pressed` and identify their controlled region. Focus is a yellow (2px)
outline with (3px) offset. A view change is immediate: it cancels decorative
work, shows the requested existing region and asks the native canvas and board
to remeasure. The original Pause button is moved into the same control row;
there is no second pause state or substitute globe.

### Architectural edition

The original city signature is moved from the decision surface into the artwork,
never cloned. The six bands are decorative and hidden from assistive technology.
The native city owner supplies the landmark; its adjacent duplicate caption is
hidden in this scene. The real offer updates immediately when the city changes.

Initial entry and a pointer city choice may construct the artwork once. Six
WAAPI animations use (270ms) duration with (30ms) stagger, totaling (420ms).
Each band scales from (.94) to (1) while its opacity rises from (0) to (1).
The emblem fades from (.25) to (1) over (180ms), after (60ms). Both use
`fill: backwards`, so their delayed first frames remain hidden or subdued rather
than flashing final styling. The existing edition easing is authoritative.

**The Finite Decoration Rule.** Decorative construction never delays the offer
or creates another animation clock, form, customer state or dependency.

Keyboard/API/history selection settles immediately. Pause, reduced motion,
Save-Data, hidden document, offscreen artwork, view exit and rapid retargeting
cancel decorative animations. Page exit disconnects observers; return restores
observation. Solari and native globe keep their original lifecycle ownership.
The local view attribute describes presentation only.

## Do's and Don'ts

### Do:

- **Do** scope these additions to City Editions and inherit the Airspace decision surface.
- **Do** preserve the original city signature, Solari, globe, Pause and service nodes.
- **Do** keep six complete city choices and readable native geographic attribution.
- **Do** settle artwork immediately for quiet modes and non-pointer selection.

### Don't:

- **Don't** spread the artwork colours into actions, fees or form states.
- **Don't** copy creator assets or invent photographic provenance.
- **Don't** delay commercial content, loop the construction or add customer state.
- **Don't** duplicate inherited controls or turn the artwork into a new global BOOM identity.
