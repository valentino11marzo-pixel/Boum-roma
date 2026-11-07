# Dispatch and the public homepage

Research: 7 November 2026. Source inspected: `2c735498`. This records release
requirements, not a claim that the current preview is ready to replace `/`.

The recommended destination stays `https://www.boomrome.com/`. Replacing its
presentation on that URL is a homepage redesign, not a domain move. Keep the
existing public catalogue, listing, service and city URLs. The new dark entrance
and white trust/footer surfaces do not require changing this URL architecture.

## What exists now

- `index.html` is the public static homepage: self-canonical `/`, index/follow,
  description/social metadata, agency/site/FAQ structured data, real listing
  links and links to the broader business, including `/buy-property-europe`.
- `flight-next.html` is an intentional alternative: initial `noindex,nofollow`,
  no canonical, description, social metadata or structured data. Dispatch is
  constructed by the existing controllers from query parameters.
- `/home-dispatch` is a temporary redirect to
  `/flight-next?direction=club&edition=club&experience=panorama&vision=dispatch`.
  Other variants and Studio are also previews, not additional indexed homes.
- Vercel serves static HTML with clean URLs. `/index.html` already permanently
  redirects to `/`; `/listing/:id` is rewritten to the existing server renderer.
  There is no current homepage SSR route or automatic application build step.
- Dispatch loads its home cards from `/api/listings`. `robots.txt` disallows
  `/api/` except `/api/meteo`; the API also has a noindex response-header rule.
  The existing public homepage already provides listing links in its HTML.
- `scripts/seo-config.js` marks the current index head as `manualHead:true`.
  `design/pages-deco/costruisci-portale.py` preserves the current main-home
  composition by default; Flight is explicitly an alternative. Both sources
  must agree with any intentional promotion, or a later regeneration can undo it.

## Remaining work before making Dispatch the public `/`

1. **Create the actual root entrance.** Do not merely rewrite `/` to the preview
   file: browser `location.search` would still be empty, while the current
   direction/edition/experience/vision guards require flags. Define a root entry
   that reuses those controllers without requiring a decorative query string.
   Keep the preview entry and Studio isolated.
2. **Make the initial response indexable and descriptive.** Remove the preview
   noindex from the production root response itself; provide one absolute
   self-canonical, accurate title/description and matching social metadata.
   Preserve the agency's established identity. Recheck claims such as the old
   “48-hour move-in” title against the actual offer instead of copying them blindly.
3. **Preserve meaningful HTML before enhancement.** Ship the principal heading,
   agency proposition, truthful service scope, trust information and ordinary
   links in the root HTML. Preserve the current public catalogue/listing access;
   use the existing public data/build source if including initial home cards.
   Do not create another customer store or commercial catalogue. The globe can
   remain an enhancement. Do not rely on Google's renderer fetching a currently
   robots-blocked API to discover the page's home inventory. A narrow public
   resource exception is a separate option to assess; opening all `/api/` is not
   the proposed fix.
4. **Retain the complete public journey.** Use real `a[href]` links to
   `/apartments`, native `/listing/:id`, the four Rome services and city pages.
   The six curated Flight cities are not the complete network: retain `/desks`
   and the existing active destinations, including Valencia, Paris and Berlin.
   Preserve buying, owners, corporate, universities, agency, terms and privacy
   entry points where relevant. Keep app state/detail URLs separate from the
   canonical home; do not indiscriminately redirect every Flight query to `/`.
5. **Align metadata and source generators.** Keep `/` in the sitemap and its
   canonical consistent. Retain only structured data that describes visible,
   supported content: preserve the real agency entity; keep FAQ data only if the
   matching questions and answers remain on the page. Update the owned generator
   and SEO configuration as well as generated HTML. Existing preview URLs can
   remain noindex while used for comparison. Redirect a retired equivalent home
   alias directly to `/` only when its preview role is intentionally removed.

## Release evidence

Before promotion, inspect the actual root HTTP response and headers: status 200,
no accidental noindex, one production canonical, useful HTML and working native
links with JavaScript disabled. Test a cold load, a failed listings request,
keyboard/reduced-motion paths, phone geometry and the full native home/service
handoff. Verify the relevant existing `seo`, `crawl`, `hometruth`, `listingssr`,
`flight` and `buying` protections plus the changed UI suites. Do not relax old
truth/privacy/checkout assertions to make the redesign pass.

The dark Dispatch revision passed 81 checks on the frozen source after integrating
current main: Panorama 44, Dispatch 10, original Club motion 8 and native city
handoff 19. The new cases cover real flap containment, empty/partial/valid plans,
public fees and refunds, multi-turn globe return, and review of all three
Milan/London fares without opening or submitting checkout. Final captures at
320, 390, 451, 900 and 1440px showed no horizontal overflow. This validates the
preview experience; none of these checks promotes or validates a new root entry.
Production follows the repository's `AGENTS.md` and `CLAUDE.md` deployment route:
integrate current main, reviewed PR, then the authorized merge to main. Verify
the deployed Git SHA, production domain, canonical and assets after deployment.
Search Console URL Inspection should then confirm what Google rendered and which
canonical it selected; monitor indexing and traffic. No indexing time or ranking
improvement is promised. The remaining root work can be completed on the same day
if these checks pass; the preview's visual readiness alone is insufficient.

## Official sources checked

- [Google: JavaScript SEO basics](https://developers.google.com/search/docs/crawling-indexing/javascript/javascript-seo-basics).
  Google can render JavaScript, but rendering is a separate stage. Static or
  server-rendered primary content remains useful. An initial noindex may prevent
  rendering, so removing it later with JavaScript is unreliable. HTML is the
  preferred place for a consistent canonical.
- [Google: canonical URL methods](https://developers.google.com/search/docs/crawling-indexing/consolidate-duplicate-urls).
  Redirects and canonical annotations are strong signals, sitemap inclusion a
  weaker one. They should agree. A canonical is not a substitute for a usable,
  indexable production response.
- [Google: crawlable links](https://developers.google.com/search/docs/crawling-indexing/links-crawlable).
  Ordinary anchors with resolvable hrefs support discovery. The interactive city
  buttons should coexist with real links to the original public destinations.
- [Google: site moves](https://developers.google.com/search/docs/crawling-indexing/site-move-with-url-changes).
  If URLs are actually retired, map them to equivalent destinations and use
  direct permanent redirects. Keeping `/` on the same domain does not require a
  Change of Address request. Preserve existing public routes during the redesign.
- [Google: structured-data guidelines](https://developers.google.com/search/docs/appearance/structured-data/sd-policies).
  Markup must represent visible, accurate content. Correct markup does not
  guarantee a rich result. Historical local SEO notes are not evidence of
  current eligibility or a promised conversion/ranking benefit.
