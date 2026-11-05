# Panorama — a second home connected to the real BOOM project

6 November 2026. Valentino asked for the richer ticketing already on the live
homepage, carried into Panorama as an integrated second home. The live site was
read and visually inspected, alongside the server catalogue and original services.
The prior two simplified tickets were incomplete: Virtual Viewing and Contract
Check had become unpriced text links.

## Published identity, preserved

Panorama now presents the same four ticket identities as the published homepage:
Property Finding (PF-0350, €350), Virtual Viewing (VV-0089, €89), Deal Assistance
(DA-0249, €249), Contract Check Express (CC-0049, €49). The codes are existing
product references, never booking numbers or paid status. The original gold,
green, purple and cyan service colours identify these products; BOOM's black/yellow
hero, original Solari and globe remain unchanged. No new colour is assigned to a city.

The flagship ticket and the three supporting tickets reuse the live anatomy:
physical side band, named product, situation, route, concrete facts, perforation,
price and action. Typography and terms remain readable; the watermark uses the
original BOOM mark. The material is bounded and static, with short pointer feedback
rather than the older live page's continuous foil/glow/position animation.

- Property Finding: at least three matching options within fifteen days or the
  €350 refund; credited to the agency fee on success. Original Terms §4.2 remains.
- Virtual Viewing: live video, photos and report; scheduled within 48 hours; refund
  if the property cannot be reached; agency-fee credit when renting that home with BOOM.
- Deal Assistance: landlord/property checks, English contract review, negotiation
  through signature; first review 24 hours after payment; prior €49 Contract Check credit.
- Contract Check Express: written verdict within 24 hours of receiving the contract,
  no negotiation; full credit toward Deal Assistance.

The free viewing of BOOM catalogue homes is explicit. Applying for a listed home
does not require buying one of these separate services. All services & prices links
to /services, including products beyond the four homepage tickets.

## Original paths own the work

`flight-next.html#panoramaServiceTickets` is an inert, reviewable presentation
fragment. Only Panorama mounts it. Ordinary Club retains its existing two tickets.
The four anchors keep the actual service URLs and `data-journey-service`; the
original Club public-brief handoff updates supported links. Editing the home planner
refreshes the native hrefs immediately, so dates, budget and household also survive
opening a service in another tab before submitting a home search. Invalid or incomplete
draft dates are omitted instead of reviving old dates; the search/history is not
committed while editing and private places never enter this brief. Ordinary service
departure snapshots the validated public brief into canonical history so Back restores
the planner; opening a new tab leaves the source page untouched. No customer data, form,
checkout endpoint, payment state or commercial catalogue was recreated.

Price checks compare VV/DA/CC against `api/_catalog.js` and PFS against its server
price in `api/create-checkout.js`. The service landing pages retain their forms and
payment logic. International offers continue to come from the existing city manifest;
Rome tickets stay hidden on foreign destinations.

## A clear second-home entry

`/home-panorama` temporarily redirects to the existing canonical Flight URL with
Club/Panorama parameters. A redirect is deliberate: those controllers read the
actual URL, so an invisible rewrite would misrepresent their state.

`/flight-studio` now says “Le home di BOOM” and links Home attuale to the exact
published https://www.boomrome.com/ in another tab. Production forbids cross-origin
framing; it is not cloned or mislabelled as Club. The single comparison iframe,
validated public preferences and private-place boundary remain.

The earlier Flight homepage is preserved at `/home-flight` with noindex/nofollow;
`index.html` is restored byte-for-byte to current `origin/main` (f5b0b66a, also the
verified production commit). The old Flight preview and its tests now use the
explicit alternative. The homepage generator defaults to the canonical composition;
`--flight` produces a separate file instead of replacing the main entrance. This
protects the homepage, not every route: the larger Flight PR still contains earlier
catalogue, listing, Skyline, international service and API work requiring normal review.
The latest main integration retains the new Paris, Berlin and Valencia desks, their
order/withdrawal logic and canonical footer links. Flight still offers its six curated
destinations; the existing /desks links open the complete live network. The two
original city handoff hooks follow the new source-assets generator instead of
editing only its emitted JavaScript. Rome forms and checkout logic remain unchanged. VV/DA/CC and /services load a
small navigation-boundary helper (also kept in the three service source templates):
it skips only the native outgoing snapshot toward Flight, preventing Chromium
rejections when Back reaches the application. Native navigation remains in control.

## Craft and verification

Additional guidance: Web Interface Guidelines for keyboard/focus/targets/safe areas,
Fixing Motion Performance for finite compositor feedback and batched measurement,
plus Impeccable's adaptation and resilience guidance. Studio resize reads geometry
before writing styles. Panorama adds mobile anchor clearance, safe-area dialog
insets, the correct browser theme colour and a local font preload.

The browser suite covers four widths (320/390/900/1440), all four product identities,
server prices, conditions and routes; native original-service navigation without
submission; supported brief prefill; private/presentation-parameter exclusion;
Rome/foreign/Rome restoration; and exact live-home and redirect destinations.
The scoped Impeccable detector reports one warning for the deliberately preserved
original Solari Helvetica. Physical-device frame rates and increased conversion
remain unmeasured.

Sources inspected: https://www.boomrome.com/ , /services , /property-finding ,
/virtual-viewing , /deal-assistance , /contract-check-express ; local api/_catalog.js,
api/create-checkout.js and the original service-page adapters.

Integration checks: build-cities --check and citiespublic (6/6) pass; cities
passes 1,330 assertions. Its global BOOM-asset claims scanner still covers every
asset: empty CSS content is valid, and exact housing phrases and the verified Rome
registered-office address are reviewed exceptions. Appended foreign-registration
mutations remain rejected. No registration vocabulary is globally ignored.

Merged-source browser validation: Panorama 12/12, Europe 11/11, editions 20/20,
company 6/6, journey 5/5, motion 7/7, globe-flight 13/13 and Next 12/12: 86/86.
City handoff passes 16/16, including the new Valencia route, actual Paris order-at-signing
and an explicitly closed generated fixture. No assertion was weakened to keep Paris
incorrectly closed. Flight 14/14, Stay generator 9/9 and Home truth 46/46 also pass.
All outgoing writes are aborted in these browser checks. The legacy Google consent-mode
ping is recognized only at its exact collection boundary with denied-consent flags;
all other attempted writes remain failures. Final ticket captures were visually checked
at 320/390/900/1440, with desktop/phone Studio views.
