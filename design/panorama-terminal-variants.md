# Two BOOM homes: Panorama and Terminal

6 November 2026. Two persistent compositions of the actual Flight experience,
available in one Studio. The design brief is recognisable aviation, a stronger
BOOM identity and deliberate proportions, while keeping the move understandable.

## A / Panorama

The destination is the opening subject. The original Solari faces a larger
geographic globe; the planning form follows the opening composition. The
camera retains the bounded orbit, controlled zoom and original destination
flight. Zoom, reset and pause form one quiet control group. The service section
keeps Property Finding as its broad first ticket, followed by the other three
actual Rome products.

## B / Terminal

The opening is a working departure desk. On desktop the original Solari and
planning form share the left column; the original globe occupies the right.
On phones the order is title, form, globe in both the DOM and the visual layout.
The yellow form heading establishes a clear place to begin. Foreign cities
retain their own desk offer and brief instead of borrowing Rome's home search.

Four real services form a consistent ticket family, in two columns where space
permits. The main ticket carries the situation, scope and conditions. A
perforation separates the fee and action. Codes, prices, currencies, credit and
refund conditions remain those of the existing service. Smaller screens put
the fee below the scope without cutting off the action or the terms.

## Aviation reference, applied selectively

[Total Design's Schiphol case](https://www.totaldesign.com/case/schiphol/)
describes yellow for primary routes, typography readable at a distance and
clear directional hierarchy. Here that informs the selected city, important
actions and alignment of functional information. It is a reference for
orientation, not a claim of affiliation or an imitation of an airline brand.

The original BOOM Solari, geographical camera, destination signatures and
ticket anatomy provide the aviation character. No invented gates, telemetry,
departure clocks, fake passenger counts or operational claims are added. The
local Instrument Sans family, original BOOM mark and black/yellow identity
stay consistent across both variants.

## One product, two presentations

Canonical B is `/flight-next?direction=club&edition=club&experience=panorama&variant=terminal`.
`/home-terminal` is a temporary redirect; A remains `/home-panorama`.
`/flight-studio` switches A/B in its single iframe and retains Club as a
secondary comparison. Valid public draft fields survive the switch. Invalid
dates keep the visitor in the current variant with their fields intact.

The Club controller moves the existing planner; it never clones the form.
The Europe URL adapter preserves the presentation through home, catalogue,
detail and history. Presentation parameters never become customer criteria
or enter the original service and desk handoffs. No new backend, dependency,
analytics event or storage is introduced. The public homepage is unchanged.

## Verification

`flightpanoramaui` retains the existing Panorama scenarios and adds Terminal
at 320, 390, 900 and 1440 px, original-node identity, rendered geography,
fullscreen return, service prices, complete navigation and privacy boundaries.
It also checks switching both ways in Studio with valid and invalid drafts
and changing device width. Europe, editions, Club flight and Next UI cover
the shared controllers. These are functional and visual acceptance checks;
conversion or retention gains have not been measured.

Final run: Panorama/Terminal 21/21, Europe 11/11, editions 20/20, Club flight
13/13 and Next UI 12/12: 77 browser scenarios. Both native catalogue links
also open the selected presentation in a real background tab. JavaScript
syntax, whitespace and exact preservation of the current main homepage pass.
