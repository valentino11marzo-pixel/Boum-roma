# BOOM — Apple Wallet (PropPass) System

Reference for the full Wallet stack: design, signing, **live updates**,
distribution and adoption analytics.

## Pass types
`tenant` · `silver` · `landlord` (storeCard) · `viewing` (eventTicket) · `referral` (coupon).
Pass Type ID `pass.com.boomrome.proppass`, Team `3MFCAL4947`.

## Design rules (applied)
- Brushed-metal **strip = artwork only** (empty `primaryFields`) → no text over the metal.
- One **header** field (status/tier) + **3 fields** in the single secondary/auxiliary
  row below the strip (Apple combines them, max 4 — we use 3 for breathing room).
- **Semantic fields**: `currencyCode` for money, `dateStyle`/`timeStyle` for dates →
  Apple formats, aligns and localizes automatically.
- Everything else (address, deposit, code, duration, links) lives on the **back**,
  with `attributedValue` action links (Pay / Maintenance / Maps / WhatsApp).
- `changeMessage` on live fields → nice push notifications on update.

## Files
| File | Role |
|---|---|
| `generate-pass.js` | Builders + `buildAndSign()` + signing. POST `/api/generate-pass` (manual data). |
| `_passkit.js` | Live engine: `loadPassData` (live data from Firestore), `getLatestPass`, device registration, **cert-based APNs** `apnsPush`, `pushPass`. |
| `pass-update/[...path].js` | Apple **PassKit Web Service** (register / unregister / list / latest / log). |
| `pass-issue.js` | Admin: issue a record-linked pass (returns `X-Pass-Serial`, `X-Pass-Token`). |
| `my-pass.js` | **Public token link** — `GET /api/my-pass?type&id&t` → the customer's live pass. |
| `pass-push.js` | Trigger an update — `POST {serial}` or `{type,entityId}` (admin or `X-Homie-Secret`). |
| `pass-demo.js` | `GET /api/pass-demo?type=…` sample pass (no record needed). |
| `/pass-studio` | Admin UI: create any pass, get the Add-to-Wallet link, push updates, see installs. |

## Collections
- `passRegistrations/{deviceId__serial}` — `{deviceLibraryId, passTypeId, serialNumber, pushToken}`.
- `passMeta/{serial}` — `{type, entityId, updatedAt}` (drives "what changed since").

## Live update flow
1. Pass issued → `webServiceURL` baked in → device registers (`passRegistrations`).
2. Data changes → call `pushPass(serial)` (or `/api/pass-push`) → `passMeta.updatedAt`
   bumped + **APNs** wakes the device → it calls `GET /v1/passes/...` → `getLatestPass`
   rebuilds from current Firestore → pass refreshes on the lock screen.

### Automatic triggers (already wired in `reminder-cron.js`)
- Viewing pass pushed on the 3h and 30m reminders.
- Tenant pass pushed when rent enters the 3-day window and when it goes overdue
  (dedup flags `passDueSoonPushed` / `passOverduePushed` on the payment doc).

### Add later (1-liners)
- **"Pagato ✓" instant push**: when the portal marks a payment paid, call
  `POST /api/pass-push { type:"tenant", entityId:<contractId> }`.
- Contract signed / viewing rescheduled → same call with the right serial.

## Distribution
Build an Add-to-Wallet link: `/api/my-pass?type=tenant&id=<contractId>&t=<authToken>`
where `authToken = generateAuthToken(id)`. The Studio shows this link after issuing.
Send it by email / WhatsApp; on iPhone Safari it opens "Add to Apple Wallet".

## Adoption analytics (free)
`passRegistrations` = who installed each pass; register/unregister webhooks track
add/remove. The Studio shows the install count per pass.

## Production checklist
1. **APNs**: the cert-based push reuses `PASS_CERT_BASE64`/`PASS_KEY_BASE64`. The Pass
   Type ID certificate must be **push-enabled** in the Apple Developer portal.
   (Alternative: token-based with a `.p8` APNs key — easy to switch in `apnsPush`.)
2. **Admin email**: `AGENT_ADMIN_EMAILS` (or `FIREBASE_ADMIN_EMAIL`) must include the
   address used in Pass Studio (for `pass-issue` / `pass-push`).
3. **Domain**: `webServiceURL` and Add-to-Wallet links use `boomrome.com` → real push
   works once the branch is merged to `main`.

## Roadmap (not yet built)
- **Google Wallet** parity (JWT) for Android reach.
- **Property-photo strip** option for the tenant pass.
- **Localization** `it`/`en` via `pass.strings`.
- **NFC / Smart Tap** check-in at viewings (needs entitlement).
