# BOOM Panorama — 5 November 2026

An opt-in companion to Club: `/flight-next?direction=club&edition=club&experience=panorama`.
Compare the complete journeys at `/flight-studio`.

## Direction before composition

The opening is a cabin observation window with a working destination instrument.
The globe owns spatial depth; the Solari board confirms the chosen city; the planner
turns intent into the existing homes or tenant-side service journey. Photography
belongs with the real home, and the founder belongs with the person answering.

Desktop: destination strip → headline/pass | large globe → original planner.
Phone: destination strip → headline/pass → globe → original planner, including DOM order.
Full view: title and controls → same globe with all six destinations → route/context.

| Element | Club | Panorama |
|---|---|---|
| Globe | All six callouts on the home | One current-city callout; all six in Full view |
| Hierarchy | Destination-led editorial composition | Large narrative headline and arched observation window |
| Materials | Predominantly flat black/yellow | Cool glass surround, olive instrument surface, thin metal borders |
| Phone | Rome planner before the globe | Explore the globe before the planner |
| Comparison | Separate preview URL | One-frame switch preserving the validated public brief |

Use Helvetica Neue light, existing original BOOM mark and Solari, yellow only for
the active destination/action. Palette: cabin `#07090b`, instrument `#15191c`,
border `#3c454b`, secondary text `#aeb8bb`, action `#ffd700`. Fine SVG grain is local,
static and low opacity on material surfaces; no noise over photographs or text.

## Motion score

| Trigger | Time | Motion and interruption |
|---|---:|---|
| Existing globe arrival | 0–1100 ms | Finite camera entrance; shared pause/reduced-motion policies |
| Full view by pointer | 0–200 ms | One container, opacity .3→1 and y 8→0; ease-out |
| Full view by keyboard | 0 ms | Immediate, focus moves to Close |
| Globe drag | Direct | Camera follows gesture; existing finite 420 ms release |
| Reset | 650 ms | Existing camera reset |
| Choose destination | 1220 ms | Close exploration first, then existing destination transition |
| Form, titles, price, nav | 0 ms | Remain still and immediately usable |

Closing cancels the entrance, restores the same canvas and returns focus. Selecting
a destination restores the canvas before the canonical controller begins arrival.
Reduced motion and shared pause cancel the added entrance; no idle animation added.

Feel check: the eye first reads the promise, then city, then the spatial window.
The opening should feel spacious and tactile; touching Full view changes scale,
not the data model. A long headline must not overpower the city or hide the next step.

## Reference principles

- [Collins Airshow moving maps](https://www.rtx.com/collinsaerospace/what-we-do/industries/business-aviation/cabin/content-and-entertainment/airshow-moving-maps): connect global orientation to destination context.
- [Garmin G3000 PRIME](https://www.garmin.com/en-US/aviation/prime/): direct access to controls and visible state.
- [Solari SkyWay](https://www.solari.it/en/products-type/eng-fids/): consistent information across surfaces.

These inform hierarchy and interaction. BOOM remains a housing and support service:
no invented flight statuses, customers, offices, availability or performance claims.
Rome owns catalogue/Skyline; international destinations keep their real desk offers.

## Verification scope

Browser coverage checks 320/390/1440px complete Rome journeys, London currency and
original form boundaries, modal focus and canvas identity, shared pause/reduced
motion, and comparison draft preservation. Fixtures replace remote catalogue/map
boundaries and prevent writes; separate visual review uses the public catalogue
snapshot. This is preview validation, not a claim of measured conversion uplift.
