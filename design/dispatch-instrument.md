# Dispatch: an architectural departure instrument

8 November 2026. The petrol entrance was rejected. This iteration changes the
material hierarchy and composition instead of adding another coloured wash.

## Design decision

The subject is a real move: homes in Rome, tenant-side support in Europe. The
original Solari and geographic globe remain the characteristic BOOM objects.
A continuous black instrument now sits inside a porcelain architectural shell.
The pale surface is a perimeter around the entire composition, never a white
half-ticket behind the Solari (a previously rejected treatment).

Palette: black #000000, porcelain #EEEDE8, structural silver #777770, separator
#595953, supporting text #D1D1C9, BOOM yellow #FFD700. The globe uses neutral
silver/graphite lighting; yellow identifies the actual destination and action.
The original Helvetica Neue 300 stays the display voice, with weight400 for
supporting instructions and weight500 for primary actions.

Desktop composition:

    porcelain perimeter
    ┌─────────────────────────────┬───────────────────────────────┐
    │ Where next?                 │                               │
    │ original mechanical Solari │       silver geography        │
    │ six native destinations     │       original globe          │
    │ real service promise        │                               │
    │ primary action + evidence   │       quiet lens console      │
    └─────────────────────────────┴───────────────────────────────┘
    original search / actual populated brief

All copy and actions align left. A single seam separates reading from geography.
The city directory retains the six original targets, but removes the boxed table
appearance. The mechanical board has a continuous dark casing. On a phone, the
same source order stacks inside the same shell without a second set of controls.

The initial plan was reviewed against past feedback: a dominant ivory left card
would repeat a rejected design, and another tinted dark backdrop would leave the
same structural problem. Both were rejected in favour of the full instrument.

## Motion and ownership

One finite800ms aperture reveal starts when the original geography is ready,
so slow loading cannot spend the reveal on an empty stage. It moves
only the geographic stage (opacity and transform), not the controls or city
choices. It uses the existing easing token and is absent in reduced/quiet motion.
The existing mechanical city tour, interruptible camera, selected-city carrier,
route trace, pause and Full view retain their original controllers and timing.
There is no extra animation loop, package, generated image, customer store or
form/payment owner. The tour still never selects a city or changes the brief.

Only Dispatch receives the new globe material. Geography, projection, camera,
land sample buffer and scheduling remain unchanged. Inactive routes and pins
become silver; actual selected routes retain yellow.

## Scope

The actual city service tickets, prices, conditions, forms and company identity
are retained. The shell's pale material leads into the already white decision
surfaces. This remains the branch Preview; the root migration remains governed
by dispatch-launch-readiness.md and dispatch-launch-system.md.

Current regression evidence: flightdispatchui28/28, flightclubmotion8/8 and
focused Panorama Dispatch3/3 pass. The five320/390/768/900/1440px departure
scenarios were repeated after the final phone spacing change and all pass.
No repository tests were changed. Syntax, whitespace and public-index parity
with origin/main718bba72 pass.

Actual320/390/1440px captures have no overflow, browser errors or missing assets.
The native city remains Rome while the presentation tours other destinations.
A separate runtime proof observes one running800ms stage effect at geography
readiness, completion after850ms, and no stage effect under Pause or reduced
motion. Action controls remain outside that stage with no entrance transforms.
No physical-device frame-rate, conversion uplift or root migration is claimed.
