# Panorama — visual refinement, 5 November 2026

The user accepts the simpler working journey and rejects the quality of typography,
colour, buttons and section composition. This pass refines the existing black BOOM
aviation world. Original logo, yellow Solari, globe, real homes and canonical flows
stay authoritative. It does not add another named version or a new product layer.

## Decisions before implementation

- Cabin black `#0b0c0e`; graphite `#17191d`; raised graphite `#22252a`;
  rule `#3a3e45`; foreground `#f5f5f0`; secondary `#b9bdc5`; BOOM action `#ffd700`.
- One reliable interface family: locally served Instrument Sans, variable 400–700,
  OFL licensed. Original vector logo and Solari retain their original lettering.
  Roles: display 48–60/500; section 32–48/500; body 16/400; label 13/500;
  helper 12/400; button 15/600. Interface tracking 0; headings -.025em.
- Left-aligned 5/7 opening, same grid for navigation, main action and planner.
  Reduce the globe shell to the actual globe; use full view for immersion.
  Phone globe 280px, avoiding a full extra screen before planning.
- Filled yellow means the next commercial step; graphite means a local tool;
  underlined text means an explanation. A shared 44–52px target and visible focus
  replace different pill/bevel/arrow conventions. Press feedback is short and
  stops under reduced motion; no attention loop is introduced.
- Source of trust: real catalogue, actual fees, named human, existing workspace.
  Put useful links beside the first action and improve existing cost explanations.
  Remove decorative kickers and repeated instructions, not facts or disclosures.

```text
logo                 homes / desks / city                    saved
Rome      Madrid      Barcelona      Amsterdam      London      Milan
promise + Solari     | actual globe, quiet full-view control
concrete offer      | depth comes from geography
primary action     | destination context
person / fees      |
------------------- one consistent planning instrument ----------------
homes and neighbourhood → support choices → process → useful company footer
```

Self-critique before code: a bigger arched card and more grain would repeat the
rejected treatment. Remove both. The memorable element remains the working
geographic globe plus original Solari; everything else makes the decision clearer.
The font is a functional improvement to a platform-dependent fallback, not a
replacement logo or a new brand name. No conversion uplift is claimed.

## Evidence and method

Impeccable 4.8.0, source commit 6d56f3b29ba150ce62236e765c0d5e965d1aa03a:
typeset, polish and craft-floor; context permits incumbent refinement without a
new product-init flow. Two independent audits identified underweight display,
9–12px controls, competing CTA names, redundant framing and mixed surface hues.

- [Impeccable](https://github.com/pbakaus/impeccable)
- [NN/g homepage principles](https://www.nngroup.com/articles/homepage-design-principles/)
- [GOV.UK action hierarchy](https://design-system.service.gov.uk/components/button/)
- [Instrument Sans source and license](https://github.com/google/fonts/tree/main/ofl/instrumentsans)

Verification covers rendered typography, contrast, touch targets and the original
journeys on 320/390/1440, with separate visual review at tablet width. Font fallback,
long city names, full view, reduced motion and edited brief remain in scope.

## Final review

Rendered Chrome captures at 390/900/1440px showed no horizontal overflow or script
errors. Visual review also covered services, footer, Rome detail and the London
desk. The public listing photograph and the founder image were checked loaded;
full-viewport captures avoid the sticky-header artefact of oversized element shots.
The independent review requested clearer link cues on services. Shared SVG arrows
now identify both paid-service entries and the workspace demo; secondary service
links are underlined. The tablet planner overlap and a reduced-motion rule that
removed globe label positioning were corrected before final regression coverage.

One Impeccable detector pass was run against the two scoped stylesheets, JS and
shared HTML. It returned 65 findings: one flags the deliberately retained original
Solari Helvetica; 64 inspect the uninitialised shared/base Flight page (old gradient
service tickets, 8–10px labels, default font and kickers), rather than the opt-in
Panorama state. Those are not reported as a clean detector run. The actual
Panorama state is verified in Chrome: its font is loaded, forms use 16px values and
13px labels, cost explanations remain visible and the primary actions meet 4.5:1.
No unrelated edition is restyled to suppress a static detector finding.
