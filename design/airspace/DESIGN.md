---
name: BOOM Airspace
description: The opt-in Dispatch composition joining native geography to the original service decision.
colors:
  primary: "#ffd700"
  primary-hover: "#ffe44a"
  scene: "#000"
  paper: "#fff"
  ink: "#111"
  muted: "#55564f"
  rule: "#d9d9d2"
  field-border: "#aaa99e"
  chrome-rule: "#454540"
  chrome-text: "#d4d4cb"
  selected-scene: "#1b1903"
typography:
  display:
    fontFamily: '"Helvetica Neue", Helvetica, Arial, sans-serif'
    fontSize: "clamp(26px, 2.35vw, 36px)"
    fontWeight: 300
    lineHeight: 1.12
    letterSpacing: "-0.025em"
  headline:
    fontFamily: '"Helvetica Neue", Helvetica, Arial, sans-serif'
    fontSize: "clamp(30px, 2.6vw, 38px)"
    fontWeight: 300
    lineHeight: 1.08
    letterSpacing: "-0.03em"
  title:
    fontFamily: '"Helvetica Neue", Helvetica, Arial, sans-serif'
    fontSize: "27px"
    fontWeight: 300
    lineHeight: 1.15
    letterSpacing: "-0.025em"
  price:
    fontFamily: '"Helvetica Neue", Helvetica, Arial, sans-serif'
    fontSize: "48px"
    fontWeight: 300
    lineHeight: 1
    letterSpacing: "-0.03em"
  body:
    fontFamily: '"Helvetica Neue", Helvetica, Arial, sans-serif'
    fontSize: "14px"
    fontWeight: 400
    lineHeight: 1.5
  label:
    fontFamily: '"Helvetica Neue", Helvetica, Arial, sans-serif'
    fontSize: "12px"
    fontWeight: 400
    lineHeight: 1.4
rounded:
  surface: "0px"
  action: "4px"
  portrait: "3px"
spacing:
  compact: "8px"
  related: "12px"
  group: "16px"
  phone-gutter: "20px"
  section: "24px"
  desktop-gutter: "clamp(28px, 3.3vw, 56px)"
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.scene}"
    rounded: "{rounded.action}"
    padding: "16px 20px"
    width: "100%"
  button-primary-hover:
    backgroundColor: "{colors.primary-hover}"
    textColor: "{colors.scene}"
  field:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    rounded: "{rounded.action}"
  city-choice-selected:
    backgroundColor: "{colors.selected-scene}"
    textColor: "{colors.primary}"
    rounded: "{rounded.surface}"
  lens-selected:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.scene}"
    padding: "8px 10px"
  service-choice:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    rounded: "{rounded.surface}"
    padding: "8px 0"
  decision-surface:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    rounded: "{rounded.surface}"
    padding: "18px clamp(24px, 3vw, 44px) 24px"
  full-view-phone:
    backgroundColor: "{colors.scene}"
    textColor: "{colors.chrome-text}"
    rounded: "{rounded.action}"
    padding: "12px"
    width: "44px"
---

# Design System: BOOM Airspace

## Overview

**Creative North Star: "Airspace — geography into a decision"**

Airspace gives the original BOOM destination and service a continuous setting:
an open black geographic scene meets a white decision surface. The yellow
identity, Helvetica Neue light voice, original Solari pulse and native globe
carry the established BOOM character. The composition is direct and spacious;
the offer is ordinary readable content, with its actual terms and next action.

This document describes only the opt-in Dispatch Airspace composition. It does
not replace the root BOOM design system, PRODUCT.md, Club or the other Flight
compositions. Its runtime boundary is Club direction and edition, Panorama
experience, Dispatch vision, `composition=airspace`, and Europe readiness.
The design choice was delegated in the current direction contract. Tokens below
are extracted from the implementation, not a new brand proposal.

**Key Characteristics:**

- One native geographic scene and one original decision surface.
- Black, white and BOOM yellow; light headlines and restrained controls.
- Complete city choices without a horizontal carousel.
- Actual service, fee and conditions, followed by the native review action.
- Original motion ownership, pause and reduced-motion paths.

Source record: [Airspace CSS](../../assets/boom-airspace.css),
[mounting controller](../../assets/boom-airspace.js),
[native globe](../../assets/boom-flight-globe.js),
[inherited action rules](../../assets/boom-dispatch-refinement.css),
[direction](../airspace-direction.md) and [motion contract](../airspace-motion.md).
This is an implementation record. It makes no claim that the concurrent finish
review, screenshot assessment or browser checks have passed.

## Colors

The sole primary accent is BOOM yellow. Pure scene black and decision white
make the two working regions legible without an outer surround.

### Primary

- **BOOM yellow:** the real review action, selected city, geographic route and
  focus treatment on dark surfaces. The brighter hover variant belongs to the
  primary action under a fine pointer.

### Neutral

- **Scene black:** geographic stage and quiet utility controls.
- **Decision white:** original service, planner and company content; also the
  selected lens on the dark stage.
- **Decision ink / muted ink:** primary and supporting copy on white.
- **Decision rule / field border:** separation of options and visible field edges.
- **Chrome rule / chrome text:** utility boundaries and labels on the stage.
- **Selected scene:** a subdued yellow-black tint beneath the selected city.

**The Content White Rule.** In Airspace, white holds the actual decision and
company content; it is not a porcelain frame around the geographic scene.

The existing architectural city sprite retains its darker gold accent on white.
That asset detail does not add a second action color. Sidecar tonal ramps are
panel visualization aids, not additional runtime colors.

## Typography

**Display and body font:** Helvetica Neue, with the actual scoped CSS fallbacks
Helvetica, Arial and sans-serif. The original BOOM mark and Solari letterforms
retain their native rendering.

The light voice belongs to meaningful headings and real prices. Controls and
supporting copy remain sturdier; the review button uses weight (500), while
most text and controls use (400).

### Hierarchy

- **Display:** the scene introduction uses the frontmatter display role. On
  phones it becomes (24px), or (23px) below the narrow-phone breakpoint.
- **Headline:** the desk heading uses the headline role, becoming (32px) on
  phones. The Rome planner heading is (34px / 1.1).
- **Title and price:** the service title uses the title role, becoming (28px)
  on phones; the displayed fee keeps the price role.
- **Body:** service copy uses the body role with a maximum width of (56ch).
  On phones it becomes (15px / 1.55); conditions and next-step notes become
  (13px). Input values remain (16px).
- **Label:** supporting metadata uses the label role. The small desktop city
  codes are secondary identifiers and disappear on phones.
- **Chapter headings:** the Rome services heading scales from (36px) to (64px),
  with (38px) on phones. The company heading scales from (40px) to (72px), with
  (42px) on phones. These are lower-page headings, not competing hero titles.

The Solari board is measured by its original controller. Airspace caps the
rendered size at (96px), (74px) on intermediate widths, (62px) on phones and
(54px) on narrow phones; its responsive source measurement can reduce it further.

**The Original Voice Rule.** Preserve Helvetica Neue weight (300) for the
Airspace headings and keep the original logo and Solari; do not substitute a
new display family or redraw those identity assets.

## Layout

Above (1180px), the scene and decision surface use a two-column grid
`minmax(0, 1.75fr) minmax(420px, 1fr)`, without a gap. The scene is sticky below
the existing navigation, sized to the remaining small viewport height, with a
minimum (720px) and maximum (1100px). The decision surface grows with actual
content. These are source constraints, not measured viewport pass results.

From (761px) through (1180px), the grid becomes
`minmax(0, 1.25fr) minmax(350px, 1fr)`. Six cities form two rows of three, and
lenses and motion tools occupy separate rows below the canvas. The globe region
starts (184px) below the scene top and reserves (250px) below it. The redundant
scene promise is hidden; the complete city rail sits (8px) from the scene bottom.
The scene gutter is (28px).

At (760px) and below, navigation is (64px) high and the scene becomes an
ordinary block of (548px). Title, Solari, globe, its control row and all six
city choices precede the white decision surface. The page scrolls normally;
the scene does not create a nested scroll region. The phone gutter is the
frontmatter phone-gutter token. Below (360px), the scene height becomes (520px).

The phone control row contains Globe/Horizon, the icon-only Full view button,
and the native Pause control. Full view retains its accessible text and title;
only the visible label is hidden by CSS. Its SVG is the existing four-corner
expand icon. The button is (44px) wide, the lenses have minimum (48px) widths,
and Pause keeps a minimum (74px) width. Zoom and reset remain outside this
compact scene row. Full view continues to use the original dialog controls.

City options are six columns on wide screens, then three by two. Their minimum
height changes from (70px) to (56px) to (44px). Service options and the review
action have minimum heights of (56px); fields have minimum height (48px).
The Rome service tickets become full-width ruled rows, with a (260px) action
column on the right and a dashed divider. On phones, each ticket is one column
with the action stub in its second row. Decorative ticket caps and corner holes
are hidden. The company section continues the white content surface.

## Elevation & Depth

The Airspace shell, decision surface and service rows are flat. Their shadows,
outer borders and rounded container frames are removed. Depth comes from the
native geographic projection and original Solari field, not from simulated
paper or lifted cards. The selected city uses an inset yellow top rule; it is
a state marker, not elevation. Ordinary dividers remain part of the white offer.

**The Native Depth Rule.** Let the real geography and Solari provide depth;
do not add an ornamental HUD, second globe, paper entrance or shadowed shell.

## Shapes

The major surfaces have square edges and meet directly. Actions, inputs and
utility groups use the action radius. The founder portrait uses the smaller
portrait radius. Service choices use a circular selection mark with a dark
ring and yellow center; the circle is a selection cue, not a card shape.

## Components

### Primary action and fields

The full-width yellow review button belongs to the original desk form. Its
current label and destination come from the selected native service. A fine
pointer brightens its background. The white decision surface uses a dark
focus outline (2px) with offset (4px). Fields have a visible neutral stroke,
white fill and dark text; validation and error messages retain their original
controller and are not replaced by a new presentation state.

### City navigation and service choices

The six original city buttons retain `aria-pressed`. Selection uses yellow
text, the selected-scene fill and the inset top rule; keyboard focus uses a
white inset outline. An unselected city gains a quiet dark hover fill. Native
service choices are flat, ruled rows; selection is shown by their circular
mark. Hover uses a light neutral fill. The actual manifest supplies service
labels, prices, conditions and availability.

### Original globe, Solari and Full view

Airspace mounts by moving the original nodes. The existing city signature,
Rome planner and European story move into the decision aside; the atlas and
its Full view return anchor stay together. The Rome planner is hidden for
foreign cities. The existing plan link moves to the decision surface for Rome
and returns beside the geographic introduction for foreign cities. Focus on
that link is preserved during relocation.

The initial lens is Globe. Airspace changes the native camera aperture rather
than scaling a copied canvas, so rendering, hit targets and flight origins use
the same projection. Full view uses the original sphere and restores the native
atlas on close. Globe/Horizon is the original finite framing transition (320ms),
with immediate keyboard handling. Solari pulse and flap timing stay owned by
Next motion; geographic routes, camera and arrival stay owned by Flight globe.

**The Single Owner Rule.** Change presentation through the original owners;
add no animation clock, customer state, catalogue, form or payment path.

The offer updates immediately from native selection. Automatic city touring is
disabled in Airspace so the visible offer matches the selected destination.
Pause, reduced motion, Save-Data, visibility and interrupted journeys remain
owned by the existing controllers. Airspace adds no timer or frame loop and
removes transition duration under reduced motion. The relocated city mark has
no additional decorative entrance or ink animation.

### Original service evidence and portrait

Inclusions remain native disclosure content beside actual fees and conditions.
The founder identity remains linked to the original agency content. The small
portrait is the existing `/img/founder-terrazza.jpg`, not a newly generated raster.
No raster image was generated for this composition. The globe uses existing
local geography, and the city identities use the existing architectural SVG
sprite. No imagery or invented metrics stand in for evidence of a service.

## Do's and Don'ts

### Do:

- **Do** keep this system scoped to the opt-in Airspace composition.
- **Do** move the original globe, forms and service nodes with their native owners.
- **Do** preserve all six city choices, keyboard access, pause and reduced motion.
- **Do** show actual service conditions and failure states before the native action.
- **Do** keep the phone Full view icon in the control row with its accessible name.
- **Do** distinguish implementation evidence from completed visual and browser review.

### Don't:

- **Don't** apply this composition as a global BOOM rebrand or replace other variants.
- **Don't** restore the rejected porcelain surround or rounded outer frame in Airspace.
- **Don't** add another timer, canvas, form, customer state or commercial summary.
- **Don't** introduce fake proof, invented fees, generated founder imagery or new offices.
- **Don't** promote inherited glyph arrows or decorative labels into new system primitives.
