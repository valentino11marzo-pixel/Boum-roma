# PropPass Audit — 2026-04-29
**Scope**: review of `api/generate-pass.js` ahead of the Phase 2 premium redesign.

## 1. Code architecture

Single-file Vercel Function at `api/generate-pass.js` (233 lines). Pattern:

- **Builder dispatch table** `BUILDERS = { viewing, tenant, referral, landlord }` → 4 sibling functions, each returns a `pass.json` object literal.
- **`loadAssets(type)`**: reads up to 9 PNGs from `pass-assets/{type}/` via `fs.readFileSync`. Missing files are silently skipped.
- **Handler**: builds `passJson` → loads images → instantiates `new PKPass(buffers, signerOptions)` → `getAsBuffer()` → returns `application/vnd.apple.pkpass`.
- **CORS**: hardcoded allowlist `[boomrome.com, www.boomrome.com]`. POST-only; rejects missing `data`/unknown `type`.

## 2. Asset inventory (current)

`pass-assets/{tenant,landlord,viewing,referral}/` — identical assets across all 4 dirs:

| File | Size | Bytes | Notes |
|---|---|---|---|
| `icon.png` | 29×29 | ~985 | RGB |
| `icon@2x.png` | 58×58 | ~2.6 KB | RGB |
| `icon@3x.png` | 87×87 | ~4.5 KB | RGB |
| `logo.png` | 160×50 | ~2.7 KB | RGB |
| `logo@2x.png` | 320×100 | ~6.5 KB | RGB |
| `strip.png` | 375×144 | ~881 b | RGB — flat color, no design |
| `strip@2x.png` | 1125×432 | ~6.5 KB | mismatch: 1125 ≠ 750 (3x dim) |
| `thumbnail.png` | 90×90 | ~4.6 KB | RGB |
| `thumbnail@2x.png` | 180×180 | ~12.8 KB | RGB |

**Findings**:
- All 4 pass types share **identical** logo/icon/thumbnail/strip files. The pass types are visually undifferentiated apart from `backgroundColor` and `labelColor` set in `pass.json`.
- `logo@3x.png` (480×150), `icon@3x.png` exists but `logo@3x` is missing → Apple recommends 3x for retina iPhones.
- `strip@2x.png` is sized 1125×432 — that's the 3x scale (3×375 = 1125, 3×144 = 432), labeled as 2x. Likely a build error from the original asset pipeline.
- `strip.png` is ~880 bytes flat → currently a near-blank placeholder, not used as a design element.
- No `BOOM-logo-*.svg` variants found in repo. Only `boom-logo.svg` (1024×1024 gold spiral on black).

## 3. Certificate handling

```js
const signerCert = Buffer.from(process.env.PASS_CERT_BASE64 || "", "base64");
const signerKey = Buffer.from(process.env.PASS_KEY_BASE64 || "", "base64");
const signerKeyPassphrase = process.env.PASS_KEY_PASSPHRASE || "";
const wwdr = `-----BEGIN CERTIFICATE-----...G4 cert hardcoded...-----END CERTIFICATE-----`;
```

- Pass cert + private key in env (base64) — production-correct.
- WWDR certificate (Apple Worldwide Developer Relations CA G4) hardcoded in source — fine, it's a public cert.
- Pass Type ID: `pass.com.boomrome.proppass`. Team ID: `3MFCAL4947`.

## 4. Field structure (per type)

| Type | header | primary | secondary | auxiliary | back |
|---|---|---|---|---|---|
| **viewing** (eventTicket) | DATE | PROPERTY | TIME, ZONE, AGENT | CLIENT, RENT, ROOMS | agentPhone, agentEmail, instructions, boomContact, website |
| **tenant** (storeCard) | YOUR HOME | TENANT | FROM, TO, RENT | CONTRACT, DEPOSIT, PAYMENT DAY | iban, paymentDay, emergency, landlordName, propertyAddress, contractType, houseRules, boomSupport, portal |
| **landlord** (storeCard) | PREMIUM PARTNER | PROPERTY OWNER (uppercase) | PROPERTIES, SINCE, STATUS | (none) | activeTenant, activeRent, contractDates, contractType, nextPayment, propertyAddress, cadastral, boomDirect, boomEmail, portal |
| **referral** (coupon) | REFERRAL | REFER A FRIEND | YOUR CODE | EXPIRES, USES LEFT | howItWorks, terms, shareLink, boomSupport |

## 5. Native features used / unused

| Feature | viewing | tenant | landlord | referral | Notes |
|---|---|---|---|---|---|
| `relevantDate` | ✅ (from date+time) | ❌ | ❌ | ❌ | tenant should use `startDate` |
| `expirationDate` | ✅ (+1 day) | ❌ | ❌ | ✅ (if provided) | tenant should use `endDate` |
| `locations` | ✅ (if lat/lng) | ✅ (if lat/lng) | ❌ | ❌ | landlord could use property loc |
| `webServiceURL` + `authenticationToken` | ❌ | ❌ | ❌ | ❌ | **No push updates** — pass content is frozen at issuance |
| `barcodes` | ✅ QR | ✅ QR | ✅ QR | ✅ QR | All present, sane URLs |
| `barcodes.altText` | ❌ | ❌ | ❌ | ❌ | Should add for accessibility |
| `userInfo` | ❌ | ❌ | ❌ | ❌ | Could carry contractId for our analytics |
| `voided` | ❌ | ❌ | ❌ | ❌ | No mechanism to invalidate after revoke |

## 6. Color palette (current)

| Type | bg | fg | label | Notes |
|---|---|---|---|---|
| viewing | `rgb(10,10,10)` | white | gold `(212,175,55)` | OK |
| tenant | `rgb(10,10,10)` | white | gold | identical to viewing |
| landlord | `rgb(18,16,10)` | warm cream `(232,212,139)` | dim gold `(201,168,76)` | Closest to "gold" but darker than Amex Gold |
| referral | `rgb(10,10,10)` | white | gold | identical to viewing |

3 of 4 types use the same palette. Landlord is the only one differentiated.

## 7. Issues identified

1. **Visually undifferentiated**: 3 of 4 pass types share the same color palette, identical logo, identical (placeholder) strip image. Apple Wallet shows them as 4 near-identical cards.
2. **Strip image is blank** (~880 b solid color) — strip is the dominant visual real estate on Wallet cards, currently wasted.
3. **`strip@2x.png` mislabeled as 2x but sized as 3x** — Apple Wallet may pick the wrong asset, causing blur or sizing issues.
4. **Missing `logo@3x.png`** — retina iPhones may downscale 2x logo.
5. **No `webServiceURL`** → pass content is static after generation. Cannot push updates (e.g., next payment date for tenant card, status changes for landlord).
6. **No `userInfo`** with `contractId` → no analytics on which pass was scanned.
7. **No `voided` lifecycle** → revoked passes (e.g., terminated contract) remain on the user's device looking valid.
8. **Tenant card omits `relevantDate`/`expirationDate`** despite having `startDate`/`endDate` — Wallet won't surface it on the lock screen near contract milestones.
9. **Asset directory layout** has `strip.png` (1x) but the actual 1x size used by Apple Wallet for storeCard is 375×144 *or* 375×98 — current is 375×144, OK for storeCard but no dedicated eventTicket-sized strip for Viewing pass (Apple recommends 375×98 there).
10. **No accessibility**: missing `barcodes.altText`, no semantic field labels.

## 8. Phase 2 implications (out of scope today)

- Differentiate the 4 pass types visually: distinct strip image per type (Phase 1 deliverable).
- Add `webServiceURL` + register a Vercel function to push updates (Phase 2).
- Add `userInfo: { contractId, passType, issuedAt }` to all builders (Phase 2).
- Lifecycle: implement pass voiding via `webServiceURL` (Phase 2).
- Investigate strip image at recommended Apple sizes (375×98 for eventTicket, 375×144 for storeCard) — current Phase 1 spec is 375×123 which is non-standard; may need re-test on a real device.
- Add `logo@3x.png` (480×150) and verify `strip@2x.png` is actually 2x not 3x.
