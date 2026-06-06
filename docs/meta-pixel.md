# Meta (Facebook/Instagram) Pixel

`js/boom-pixel.js` adds the Meta Pixel layer that `boom-track.js` (GA4-only)
doesn't cover. It powers IG/FB **retargeting**, **lookalike audiences**, and
ad-conversion optimisation — the highest-ROI paid channel for expat/student
rentals.

## Activate (1 step)
The module is a **safe no-op until a Pixel ID is set** — it ships dark.

1. Meta Events Manager → create a Pixel → copy the numeric **Pixel ID**.
2. Set it once, either:
   - edit `PIXEL_ID` at the top of `js/boom-pixel.js`, **or**
   - add `<script>window.BOOM_PIXEL_ID='1234567890';</script>` before the include.
3. Include near `</body>` on any page (mirrors the `boom-track.js` pattern):
   ```html
   <script defer src="/js/boom-pixel.js"></script>
   ```

## Events (Meta standard → slot straight into Ads Manager)
| Event | Fires on |
|---|---|
| `PageView` | every page |
| `Contact` | WhatsApp / `tel:` / `mailto:` click (with `method`) |
| `Lead` | any `<form>` submit |
| `InitiateCheckout` | click toward `/book`, `/booking`, Stripe, `checkout` |

Manual: `window.boomPixel('AddToWishlist', { value: 1 })`.

## Currently wired
The uncontested public pages (no other branch edits them): the 7 `blog-*` posts,
`booking`, `deals`, `form-tenant`, `form-landlord`, `onboarding`, `pre-arrival`,
`precheck`, `thank-you`, `partners`, `universities`, `corporate`, `research`.

Add the one-line include to the rest (`index`, marketing, portal) once their
redesign branches land, so it doesn't collide with that work.

## Notes
- Independent of GA4/`boom-track.js` — no shared file edited, no double-count
  (separate analytics systems).
- For accurate ad attribution later, pair with the **Conversions API** (server-
  side) — out of scope here; the browser Pixel is the first, sufficient step.
