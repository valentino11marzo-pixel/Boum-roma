# Dispatch: a city choice travels through the interface

7 November 2026. Follow-up to the departure hall: the user explicitly requested
new animation and design. Preserve the current composition and the real rental
journey. Modes: Experience in geography; Operate in the service ticket.

## Motion thesis

A city selection is one gesture, visible first in the directory and then in its
geographic destination. The outline moves between the actual city targets;
the existing globe draws its real geographic connection and resolves at the
selected coordinate. This is a connection between BOOM destinations, not an
airline route or flight-status claim. Nothing waits for animation to accept input.

| Element | Role | Start | Duration | Relationship |
| --- | --- | --- | --- | --- |
| Directory outline | Lead feedback | Accepted pointer city change | Existing220ms state token | Travels from its currently painted rectangle to the native selected button |
| Original Solari and city camera | Existing lead | Native city change | Existing controllers | Retain their original state and timing |
| Geographic trace and arrival ring | Supporting explanation | Accepted pointer city change |850ms, aligned to camera | Route draws while the camera travels; arrival resolves at the real coordinate |
| Ticket CTA arrow | Fine-pointer feedback | Hover | Existing state token |3px directional response; prices stay still |

The selected city name changes immediately and stays yellow on black. The
moving outline is transparent, avoiding black text on an absent yellow plate
or white text over a moving yellow background. Rapid reversal reads the actual
in-flight rectangle before cancelling; no duplicate labels or customer state.

Service names, prices, refund conditions, forms and reading content do not
move as a decorative group. The original finite offer-change feedback keeps
its current owner. The Rome ticket's real origin/destination and the European
ticket's perforated offer/continuation seam get a clearer aviation treatment.

## Lifecycle and budget

The directory uses finite WAAPI transforms, no animation loop. The geographic
trace shares the original renderer clock and frame budget. Keyboard selection,
Pause, reduced motion, history, hidden/offscreen state and native view changes
settle the extra motion. Full view, lens changes, drag and zoom cancel the
geographic trace. Essential selection and actions remain available in every path.

No added dependency, form, customer store, price calculation, tracking or payment
behavior. Original Helvetica Neue300, Solari, black/yellow and white service
surfaces remain. Other six visions retain their existing behavior.

## Feel check

Inspect rapid Madrid→Amsterdam→Rome choices, especially when the directory wraps
on a phone: the frame must depart from its current point rather than snap to an
old target. Inspect the route's leading point and final arrival ring together
with the original camera. Check the ticket arrow without making the price move.
Record the sequence and verify actual intermediate frames, then static keyboard
and reduced-motion states. Physical-phone frame rate remains unmeasured.


## Verified result

Final sequential browser runs: Dispatch22/22, original Club motion8/8 and
Panorama44/44, all passing. The five new scenarios observe intermediate painted
positions/pixels, rapid reversal, one temporary animation per role, native
selection/history/form identity and the interruption boundaries above. A native
scene repaint also emits `resize`; the carrier now distinguishes that notification
from an actual viewport change so accepted selection intent is not swallowed.

Fresh320/390/1440px captures show readable destinations, intact tickets and zero
horizontal overflow. Native route progress was captured at164–174ms and701–714ms,
then after settling. Desktop and phone recordings retain114/112 actual browser
frames and their original timestamps, without interpolation. Static detector
checks on the new CSS/JS and modified globe report no findings; this is a scoped
check, not a whole-site audit. Syntax and whitespace checks pass.

The rail previews a destination. Globe-label clicks keep the existing1220ms
journey-entry flight, rather than layering this decorative trace over it. Main's
public index is unchanged. Physical-device frame rate and conversion uplift are
not measured by these browser checks.
