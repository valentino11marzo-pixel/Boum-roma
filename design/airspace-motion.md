# Airspace — geography and the decision

Airspace is a new Dispatch composition over the original Europe, Club and
Panorama controllers. The left scene contains the existing Solari, city choices
and geographic canvas; the white decision surface contains the selected city's
original service or Rome planner. Selection always updates actual content first.

## Native choreography

| Element | Trigger | Owner | Timing and behavior |
| --- | --- | --- | --- |
| Solari destination and field | Native city selection | Next motion | Original flap response and pulse; no new board or clock |
| Geographic camera and route | Native city selection | Flight globe | Existing finite orientation/route transition |
| Globe/Horizon | Deliberate lens choice | Flight globe | Existing320ms framing transition; keyboard immediate |
| Geographic entry | Existing plan link or native globe destination | Club and Flight globe | Original validated, cancellable flight and destination arrival |
| Selected offer, fee, CTA and city stamp | Native city selection | Europe | Immediate final content; no paper or content entrance queue |

The initial lens is Globe. The same atlas and its Full view return anchor stay
together, so entering and leaving Full view preserves the native canvas and
camera. Pausing, reduced motion, Save-Data, document visibility and interruptions
remain governed by the existing owners. No additional timer, frame loop or
customer state is added.

Automatic city touring is disabled in Airspace: the visible offer must match
the selected destination at entry. The original manual tour remains a separate
native control and may be omitted from this composition's visible chrome.
City marks use the existing BOOM architectural sprite, without the base Club's
additional decorative ink response or the legacy scroll entrance.

## Structural contract

`#nextHero > #airspaceScene` contains the original `#directionClubTicket` and
the new `#airspaceDecision` aside. The aside contains the same
`#europeCitySignature`, `.europe-planner.edition-club-runway` and
`#europeDeskStory`. The Rome planner wrapper is hidden for foreign destinations;
Europe retains its own visibility, field and service ownership. Club's original
responsive planner arrangement recognizes this parent and leaves it in place.

The existing plan link moves into the decision surface for Rome and returns
beside the geographic introduction for foreign destinations, where Airspace hides
the redundant link because the actual service review is already adjacent. The Rome
link still invokes the original validated flight event. The foreign desk form remains the sole
review action and keeps its actual manifest fee and native offer fragment.
The rest of Home, Apartments, Detail and their original data are unchanged.

`data-airspace-ready="true"` marks completed mounting for browser verification.
It is a read-only presentation observation, not another selected-city state.
