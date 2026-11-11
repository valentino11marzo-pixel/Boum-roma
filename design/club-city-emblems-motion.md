# Club city emblems — one selection response

The city picker is an occasional action. Motion confirms a pointer/touch
selection and softens the change of architectural silhouette. Keyboard,
history, initial render and programmatic city changes remain instantaneous.
The existing Europe controller still owns the city, brief and destination.

## Timeline, decided before implementation

| Element | Role | Starts | Duration | Motion | Relationship |
| --- | --- | --- | --- | --- | --- |
| Architectural structure | Lead inside decorative art | 0ms | 220ms | Opacity .68→1, fixed position | Begins with selection and stays legible |
| Architectural accent | Support inside decorative art | 30ms | 250ms | Normalized stroke dashoffset 1→0 | Begins with structure; linework completes at 280ms |
| City name, landmark label, form and CTA | Static | — | — | Immediate final state | Always usable |
| Signature container | Static | — | — | No entry or scroll drift | Children own the only response |
| Solari and globe | Existing owners | — | — | Existing behavior | No additional clock or sequence |

WAAPI opacity and a stroke reveal use the existing `--edition-ease` token.
The architectural silhouette is visible immediately. Its structural detailing
draws into place rather than moving the building. Accent paths normalize their
length to 1 and inherit dash properties through the external SVG use element;
the bounded artwork is at most 120×90px. Both layers finish within 280ms and
retain no fill effect. The default, with no animation, is the complete emblem.
There is no entrance queue, hover reaction or idle loop. This applies only to
`edition=club` without `experience=panorama`; other presentations keep their
original city artwork.

## Interruption and accessibility

Each render cancels the preceding response before replacing the art. A new
pointer selection animates only when the city changes. The selected destination
and all commercial controls update immediately, regardless of motion support.
Pause, reduced motion, Save-Data, hidden document, offscreen signature, view exit
and pagehide cancel rather than freeze the decoration. Returning to the page or
viewport never replays it. Private observers disconnect on pagehide and reconnect
on pageshow; no animation frame, timeout or customer state is added.

## Feel check

Scrub the first 30ms and final 60ms of a native city tap. The new silhouette
should read immediately and the yellow strokes should construct its detail,
without a second entrance. Verify external-use dash inheritance in the actual
browser by comparing yellow coverage at 0ms, 140ms and 280ms. Repeat rapidly
between London and Rome and verify the
last selection is the only visible art. Check at 320/390px that the illustration
does not compete with the selected city, Solari, brief or next action.

## Verification — 10 November 2026

The final focused suite passed23/23, with actual SVG ink captured at0/140/280ms.
Six city marks were inspected at320/390/1440px. Europe11/11, editions20/20 and
Club flight13/13 passed. The complete Panorama regression found only the
intentional Studio toolbar expansion; its updated four-choice assertion and
full valid/invalid-draft journey reran1/1. Other Panorama scenarios were unchanged.
The new CSS has no Impeccable detector findings; Studio retains one warning
for the existing Inter fallback behind the explicitly pinned Helvetica family.
These are browser and source checks, not physical-device frame-rate or conversion
measurements. Production index remains equal to integrated main.
