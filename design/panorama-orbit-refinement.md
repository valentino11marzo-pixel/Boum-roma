# Panorama — proportion, camera and quiet detail

6 November 2026. Refinement of the existing second home, not another product or
commercial route. The visitor should understand the offer quickly, enjoy exploring
the globe, and retain control of every movement.

## Visual decision

The original Solari destination stays prominent. Its background field becomes
quieter so the actual letters and geographic globe carry the opening. The city
rail loses repeated boxes; the selected city keeps BOOM yellow. The planner uses
a dark heading and a yellow action, reducing competition between two large gold
blocks. Section boundaries use a softer hairline than interactive controls.

The four live service tickets retain all names, prices, conditions, routes and
native links. More compact title/terms spacing improves comparison; secondary
service links no longer compete with the purchase actions. No fabricated proof,
scarcity, location, office or performance claim is introduced.

## Motion relationships

| Element | Role | Start | Duration | Behaviour |
| --- | --- | --- | --- | --- |
| Real globe camera | Lead | After the opening settles | Ambient, at most 24 paints/s | Slow bounded geographic orbit; pauses under pointer or keyboard focus |
| Zoom camera | Lead | Direct +/− press | 260ms | Interruptible, bounded scale; keyboard and reduced motion apply immediately |
| Existing destination flight | Lead | City entry | Existing 1220ms | Starts from the visible camera and reaches the original destination flow |
| Exploration hint | Support | 3200ms of visible inactivity | 180ms | One appearance per page visit; dismissed by activity, never repeated |
| Solari city name | Support | City selection | Existing controller | Original renderer and city event |
| Ticket copy, prices, forms | Static | Immediately | — | Remain still and immediately usable |

`data-globe-ambient=true` opts Panorama into the orbit; ordinary Club remains
on demand. The same canvas moves into Full view. Zoom changes the camera only,
never the city, URL, search criteria or history. Reset restores orientation and
camera distance. The original pause button is beside the globe on mobile too;
the fullscreen button controls that same state.

The orbit has no frame-by-frame layout reads or HTML-label movement. It stops
outside the viewport, while the page is hidden, during a flight or direct gesture,
with reduced motion, with explicit pause and with data saving enabled. Timers are
cancelled, not merely left running behind an invisible canvas. The existing
pixel budget and local Natural Earth geography remain in use.

The hint is redundant visual guidance, not a screen-reader announcement or a
conversion step. It never takes focus, scrolls, covers a form or asks for data.
Reduced motion and pause suppress it. There is no new tracking or dependency.

## Reference and verification

The pause control follows [W3C Pause, Stop, Hide](https://www.w3.org/WAI/WCAG22/Understanding/pause-stop-hide).
The reduced-motion path follows [W3C Animation from Interactions](https://www.w3.org/WAI/WCAG22/Understanding/animation-from-interactions.html).
IntersectionObserver and Page Visibility cover different lifecycle boundaries;
both are needed when a page contains embedded or hidden views.

`flightpanoramaui` exercises actual painted motion, camera bounds and interruption,
pointer and keyboard stops, pause/reduced/offscreen/hidden/data-saving lifecycle,
one-time guidance, the existing tickets and original service handoffs. Ordinary
Club flight tests retain their finite-idle assertion. Visual checks cover narrow
phones, tablet and desktop, including fullscreen controls and ticket text.

Conversion and retention improvements are hypotheses, not measured outcomes.
The acceptance standard for this iteration is clearer hierarchy, reliable controls,
bounded motion and no loss of the real BOOM journey.

Final verification: Panorama 15/15, Europe 11/11, editions 20/20, original
Solari motion 7/7, Club flight 13/13 and Next UI 12/12: 78 browser scenarios.
The new main integration also passes upgrade 70/70, mail-address checks and
public-desk projection 6/6. The original main homepage remains byte-identical.
The fullscreen regression found a real resize/focus race: stopping ambient work
also cancelled a required canvas repaint. Required dirty draws now survive the
stop; the original painted-buffer assertion passes unchanged on phone and desktop.
