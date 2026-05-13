# BOOM Roma — Operational Status

> Single-source-of-truth snapshot of the portal/Magic-Sign/funnel stack as it
> actually exists in the repo. Anything that could not be verified by reading
> the code is marked **UNVERIFIED — needs manual test**.
> Do not consume this file alongside older paragraphs in chat — the chat
> history is stale; this file is current.

## LAST UPDATED

- **Date**: 2026-05-13
- **Commit**: `e3cadf1` — `feat(chat-concierge): publish stable chat experience as sibling page`
- **Branch**: `sprint/master-2026-05-02` (up-to-date with origin, working tree clean)
- **Default branch (PR target)**: `main`
- **NOTE**: the sprint branch is ahead of `main` by an unknown delta. Whatever is
  live on boomrome.com reflects the last push to `main`, not the contents
  described below, **UNTIL** the sprint branch is merged. **UNVERIFIED —
  needs manual deploy check**.

---

## MAGIC SIGN STATE

### Entry & auth
- Public route: `/portal.html?sign=TOKEN` (token matched against
  `contracts.tenantSignToken` then `contracts.landlordSignToken` —
  `portal.html:1613`).
- Anonymous Firebase auth is required and is performed at three places:
  - magic-link tenant bootstrap (`?postSign=1&magicToken=...`) — `portal.html:1565`
  - magic-sign signing flow — `portal.html:1605`
  - intake form — `portal.html:2702`
- If anon-auth is disabled in the Firebase Console, the signing flow shows a
  "Setup Required" panel — `portal.html:1610`. Anon auth is currently the
  only path for an unauthenticated tenant to reach Firestore, so it must
  stay enabled. **CONFIRMED — code-level guard exists; UNVERIFIED on
  production console.**

### Flow (5 visual steps inside one page)
1. **Contract review** — `portal.html:1650+`. Reads property/signer/otherParty.
   PDF preview link uses `contract.generatedPDF` Firebase Storage URL.
2. **Identity step** — collects CF/DOB/POB/address/doc into `window._msIdData`
   (browser memory only at this point). CF validated by length=16 only,
   no checksum.
3. **OTP / phone verification** — `portal.html:1798-1942`.
   - Single invisible `firebase.auth.RecaptchaVerifier`.
   - `otpInitRecaptcha()` (1843) destroys any prior verifier completely
     and rebuilds — this is the fix-pattern for the historical
     `auth/captcha-check-failed` crash; the code has no leftover catch
     for that specific error code today.
   - **`otpSkipStep()` at `portal.html:1944` is STILL PRESENT.** The
     "Skip phone verification" link is rendered at `portal.html:1836`.
     Phone verification is optional.
4. **Signature canvas** — `portal.html:1949-2013`. HTML5 canvas, DPR scaled,
   data URL stored in Firestore directly on the contract doc.
5. **Submit + success** — `submitMagicSign()` `portal.html:2015-2180`,
   `showMagicSignSuccess()` `portal.html:2182+`. Tenant success screen
   offers optional password creation via `createMagicAccount()` (2230).

### Post-signature automation (when both parties signed)
Triggered inside `submitMagicSign` at `portal.html:2059-2173`:

| # | Step | Where |
|---|---|---|
| a | RLI deadline +25d in `deadlines` collection | 2065 |
| b | Lead doc → `stage:'closed'` in `leads` or `pfsClients` | 2071 |
| c | Property → `status:'rented'`, `currentContractId` | 2076 |
| d | Listing sync → `status:'rented'` | 2080 |
| e | Monthly `payments` schedule generated for full contract span | 2085 |
| f | CAF asseverazione email | 2101 |
| g+h | `generateContractPasses` (tenant + landlord PropPass) + welcome emails (`sendTenantWelcomeWithMagicLink`, `sendLandlordWelcomeWithPass`) | 2103-2122 |
| i | `writePendingMemory('magic_sign_success', ...)` Atlas hook | 2127-2162 |
| j | If `users/{tenantId}` missing → create Firestore profile (no auth account) | 2164-2171 |

Items (i) and (j) run independently from the email IIFE — they will fire
even if EmailJS is down. (i) is idempotent via the
`atlasContractSignedEmitted:true` flag (2155).

### PDF generation — single source of truth: Firebase Storage URL
- `generateContractPDF(id)` at `portal.html:11844` is a dispatcher that
  delegates to:
  - `_generateContractPDF_allegatoB` (11853) — verbatim CAF Roma
    25/07/2023 prot. QC/82672/2023, transitorio.
  - `_generateContractPDF_allegatoC` (12241) — verbatim CAF studenti.
- Both variants build a jsPDF document, upload the blob to Firebase
  Storage at `contracts/{contractId}/contract.pdf` (12211 / 12578), and
  save **only the download URL** to `contract.generatedPDF` plus a
  `pdfHash` + `pdfSizeKB` + `pdfGeneratedAt`. **No base64 in Firestore
  for the contract PDF.** This was the migration in commit `076dcd1`.
- The RLI draft is a different document — that one still writes a
  base64 datauristring into the `documents` collection (`portal.html:2515-2528`).
  Intentional, low-volume admin reference.
- `downloadContractPDF(id)` at `portal.html:13964`:
  - Fetches fresh contract doc from Firestore.
  - If signatures are present but `pdfRegeneratedAfterSign !== true`,
    regenerates the PDF first so the signatures are embedded, then
    flips the flag (13984).
  - Downloads via `fetch(storedPDF).then(r=>r.blob())` → `URL.createObjectURL`.
  - If `generatedPDF` is missing (legacy contracts) it regenerates on
    the fly and downloads. **No more "simple from-scratch fallback".**
- `regenerateContractPDF(id)` at `portal.html:14032` runs a self-healing
  pre-check on canone math (installments × monthly = total) and offers
  an auto-fix before regenerating. This is the path bound to the 🔄
  button in the contract list (11252).

### Magic link tenant login (post-sign welcome)
- `sendTenantWelcomeWithMagicLink(contract, passUrl)` at
  `portal.html:13569-13657`.
- Client-side mint of a UUIDv4 token, writes
  `magicLinks/{tokenId}` with `{contractId, tenantId, tenantEmail,
  expiresAt = now + 1h, used:false, createdAt}`. No Admin SDK.
- URL pattern: `${origin}/portal.html?postSign=1&magicToken=${tokenId}`.
- Bootstrap reader at `portal.html:1558-1599`: anon auth, validates
  expiry + `used`, flips `used:true`, writes a
  `localStorage.boomTenantSession`, then redirects to
  `/portal.html?welcome=1&cid=...`.

### Known bugs / risks
| Severity | Item | Reference |
|---|---|---|
| HIGH | `auth/captcha-check-failed` historical crash — code looks fixed (destroy+reinit pattern) but **UNVERIFIED on real device matrix** (iOS Safari, Android Chrome). | `portal.html:1843` |
| HIGH | OTP phone verification is **bypassable** via the "Skip phone verification" link. If FES Art. 21 CAD claim shown to user (1973) requires verified phone, this is a legal exposure. | `portal.html:1836`, `1944` |
| MED | Identity step CF validated only by length=16. No checksum, no AdE format check. | `portal.html:1696` (per AUDIT.md) |
| MED | Signature is written to Firestore as PNG data URL inside the contract doc. Each signature is ~50-150 KB → contract doc bloat. **UNVERIFIED in production.** | `portal.html:2020`, `2048-2050` |
| LOW | `submitMagicSign` uses `new Date().toISOString()` for `tenantSignedAt`/`landlordSignedAt` (client clock, not `serverTimestamp`). | `portal.html:2022` |
| LOW | `signaturePlace` defaults to `"Roma"` and `signatureDate` to `new Date()` inside Allegato B if the contract has no explicit values. | `portal.html:12013-12015` |

---

## LEADS → CONTRACTS BRIDGE

### What exists
- `createContractFromLead(leadId, source)` at `portal.html:2255-2307`.
- Accepts `source ∈ {'lead','pfs',undefined}` and resolves the lead from
  `S.leads` or `S.pfsClients`.
- Pre-populates the contract wizard with:
  - `tenantId` — matched from `S.users` by email (case-insensitive)
  - `startDate` ← `lead.arrivalDate || lead.checkIn || searchCriteria.checkIn`
  - `endDate` ← `startDate + duration months`
  - `rent` ← `lead.budget || searchCriteria.budget`
  - `deposit` ← `rent × 3`
  - `transitionalReason` ← `lead.situation || lead.transitionalReason`
  - `notes` ← `Source: …\nRequirements: …\nNotes: …`
- Injects hidden inputs `linkedLeadId`, `linkedLeadSource`, optionally
  `linkedViewingId` so post-sign automation can close the lead and link
  the viewing.

### What does NOT exist
- **There is no auto-trigger when a lead enters the "closing" stage.** The
  bridge runs only when the admin clicks the "Create contract" action
  in the lead detail. Stage `closing` is a pipeline label in
  `portal.html:846` but does not fire any automation.
- No reverse sync: editing a lead after contract creation does not
  propagate to the draft contract.
- No tenant-side action — a tenant cannot kick off `createContractFromLead`.

### Closure side
- Post-signature step (b) at `portal.html:2071-2074` flips the lead's
  `stage` to `'closed'`, records `linkedContractId` and `closedAt`.
  Works for both `leads` and `pfsClients` collections (chooses by
  `linkedLeadSource`).

---

## ACCOUNT CREATION

Four distinct paths exist in the code. None of them is fully automated
end-to-end from an external source.

### 1. Admin manual — `saveUser` at `portal.html:9784`
Creates a full Firebase Auth user + Firestore `users/{uid}` doc with
all profile fields (role, CF, IBAN, address, DOB, doc, etc.).
Used by the "Add user" modal in the admin panel. **Working.**

### 2. PFS client → tenant portal activation — `portal.html:10850-10930`
Admin-triggered button on a PFS client card.
- Generates `BOOM{6chars}!` temp password.
- Calls `auth.createUserWithEmailAndPassword(client.email, tempPassword)`.
- Writes `users/{newUserId}` with `role:'tenant'`, links
  `clients.{id}.userId`, flips `stage:'onboarded'`.
- Sends EmailJS welcome with email + temp password in the body.
- **KNOWN UX BUG**: Firebase signs the admin out after creating the new
  user. The code then `prompt()`s the admin to re-enter their password
  to re-authenticate (`portal.html:10901`). This breaks the flow on
  mobile and is generally bad practice. **Confirmed — not fixed in
  this branch.**

### 3. Magic-Sign auto-profile — `portal.html:2164-2171`
At full signature, if `users/{contract.tenantId}` does not exist, creates
**only the Firestore profile** (no Auth account). Tenant is identified
by `contract.tenantId` set when the contract was drafted.

### 4. Magic-Sign optional self-signup — `createMagicAccount` at `portal.html:2230`
On the post-signature success screen the tenant can choose to create a
password. Tries `signInWithEmailAndPassword` first; on
`auth/user-not-found` falls back to `createUserWithEmailAndPassword`.

### 5. Magic-link login (passwordless tenant portal access)
Already described under MAGIC SIGN STATE — `portal.html:13606+` mints
the token, `portal.html:1558+` consumes it. Replaces the need to ever
type a password for a tenant who reached the portal via a welcome email.

### Landlord side
No automated path. Landlord accounts are created by the admin via
path (1) or already exist when the property is added. The PropPass
welcome email goes to a known user; if missing, the post-sign step
just no-ops.

---

## PRE-AGREEMENT (Proposta di Locazione)

### Status: EXISTS AS A TEMPLATE-ONLY DOCUMENT. NOT AUTOMATED. NOT WIRED INTO MAGIC SIGN.

- Admin can open the "Proposta di Locazione" template modal —
  `portal.html:6438`, `openTemplateModal('proposta_locazione')`.
- Form fields defined at `portal.html:14438-14464`.
- PDF generation in the templates engine at `portal.html:15055+`.
- A sibling template "Accettazione Proposta" exists (`portal.html:6442`,
  `14467+`).
- Outputs a PDF the admin downloads and forwards manually.
- **There is no flow that takes a signed proposta and transforms it into
  a contract draft, nor a tokenized link that lets a tenant sign the
  proposta digitally.** If the requirement is "proposta → tenant
  click-to-accept → contract draft pre-populated → magic-sign", that
  pipeline must be built.

---

## PROPPASS

- Backend: `/api/generate-pass.js` (passkit-generator 3.5.7, Apple WWDR
  G4 cert in repo). Pass types: `viewing`, `tenant`, `referral`,
  `landlord`. Last touched 2026-04-30.
- Assets under `pass-assets/{type}/`. Premium V2 redesign shipped
  in `9ab6fbc` + `9751dc4`.
- Auto-deliver on contract signature: `generateContractPasses(contractId)`
  at `portal.html:13251`, called inside post-sign automation
  (`portal.html:2105`). Returns tenant + landlord URLs, which are
  embedded into welcome emails.
- Delivery page: `/pass-delivery.html` (animated gold-ring + QR).
- **Functional**, last hardened with `b210521` ("enforce PropPass
  auto-deliver post-signature").

---

## DEPLOY STATE

### Locale
- `git status` clean on `sprint/master-2026-05-02` at `e3cadf1`.
- Up-to-date with `origin/sprint/master-2026-05-02`.

### Vercel production
- Live host: **boomrome.com / www.boomrome.com** (only origins
  whitelisted in `api/concierge-event.js`, `api/notify-viewing-created.js`,
  `api/recent-signed.js`).
- Build pipeline: none — static files served from repo root
  (`outputDirectory: "."`). HTML is shipped as-is.
- Functions configured in `vercel.json`:
  - `api/reminder-cron.js` — `maxDuration: 60`
  - `api/concierge-phrase.js` — `includeFiles: concierge/voice-prompt.md`
- Cron schedule (vercel.json:69): `*/15 * * * *` → `/api/reminder-cron`.
- Rewrites cover all clean URLs (`/portal`, `/proppass`, `/apartments`, …).

### Divergence locale ↔ production
- **UNVERIFIED**. The sprint branch is not main. There is no way to tell
  from this audit whether production was promoted to `e3cadf1` or is
  still on an older `main` commit. Run `vercel inspect <prod url>` or
  `vercel list` to confirm. Vercel CLI is not installed locally — see
  the session note at top of this turn.

### `/api/` surface as of this audit
```
api/
  _lib/firestore.js                 (NEW — Firestore REST helper, 6 May)
  concierge-event.js                (NEW — 7 May, public concierge writes)
  concierge-phrase.js               (NEW — 10 May, voice rephrasing layer)
  create-checkout.js                (Stripe Checkout dynamic session)
  generate-pass.js                  (Apple Wallet)
  listings-match.js                 (NEW — 6 May, concierge matching)
  listings-zones.js                 (NEW — 6 May, concierge zones)
  notify-viewing-created.js         (NEW — viewing form → admin EmailJS)
  parse-docs.js                     (Anthropic doc parser, admin-gated)
  recent-signed.js                  (NEW — concierge "peer proof" feed)
  reminder-cron.js                  (every 15 min)
  stripe-webhook.js                 (PFS payment confirm)
  vercel.json                       (function-local config)
  package.json
```
Removed since the old BOOM_STATUS.md: no `webhook-proxy.js` exists.

---

## OPEN BLOCKERS

### A) Ship Magic Sign with confidence (HIGHEST PRIORITY)

| # | Sev | Item | What to do |
|---|---|---|---|
| A1 | HIGH | `auth/captcha-check-failed` — code fix-pattern in place but UNVERIFIED on prod | Manual test matrix: iOS Safari (16+/17+), Android Chrome, desktop Chrome/Firefox. Verify SMS arrives, code accepted, both signatures land in Firestore, post-sign automation fires. |
| A2 | HIGH | OTP can be skipped (`otpSkipStep` `portal.html:1944`) — legal exposure if FES claim made (1973) | DECIDE: remove skip OR explicitly mark contract `phoneSkipped:true` and weaken the FES claim wording when skipped. |
| A3 | HIGH | Signed-at timestamps come from client clock | Switch `tenantSignedAt`/`landlordSignedAt` to `firebase.firestore.FieldValue.serverTimestamp()` at `portal.html:2048-2050`. Keep `tenantSignedIP/UA` placeholders the way they are or capture them server-side. |
| A4 | MED | Signature PNG dataURL stored inside the contract Firestore doc — bloat + 1MB doc limit risk | Move signatures to Firebase Storage under `contracts/{id}/signature_tenant.png` and store the URL only. |
| A5 | MED | CF validated by length only | Add the Codice Fiscale checksum check before allowing step 3. |
| A6 | LOW | `pdfRegeneratedAfterSign` flag failure path re-attempts regen each download | Acceptable; document. |

### B) Automate the funnel from an external source (e.g. Homie)

| # | Sev | Item | What to do |
|---|---|---|---|
| B1 | HIGH | **No endpoint exists that accepts an external lead.** "Incoming leads from Homie auto-responder" is a **comment only** at `portal.html:3183` and `5879`. Code reads `S.leads` from Firestore but nothing outside the portal writes there. | Add `api/intake-webhook.js` (or `api/homie-lead.js`) — POST handler, signed/idempotent, writes `leads/{auto}` with normalized shape `{name,email,phone,budget,arrivalDate,duration,zone,musthaves,source,createdAt}`. CORS-locked or token-locked. |
| B2 | HIGH | No identity reconciliation when an external lead matches an existing user/tenant | Inside the webhook, look up `users` by email; attach `userId` to the lead if matched, else leave null. |
| B3 | MED | Lead → contract bridge is button-click only | Optional: lead-stage automation hook — when admin moves a lead to `closing`, auto-open `createContractFromLead` in a draft state and notify admin. |
| B4 | MED | PFS activation path requires admin password re-prompt (`portal.html:10901`) | Replace the createUser-as-admin pattern with a Cloud Function or a secondary Firebase app instance to avoid signing out the current admin. |
| B5 | MED | No proposta-locazione → magic-sign continuity | Either drop the proposta step entirely (the contract is already legally binding once signed) or build the same magic-token + canvas flow for the proposta as a precursor. |
| B6 | LOW | EmailJS free tier limits the universal template usage — already followed (single `boom_notification` template, parametrized) | Watch the EmailJS quota when external leads start writing. |

### C) Atlas / multi-tenant readiness — context, not a launch blocker
- `writePendingMemory()` stub at `portal.html:12636` and Atlas hook at
  `portal.html:2127`. Today fires only on `magic_sign_success`.
- `src/schemas.md`, `src/email-templates.js`, `src/wa-templates.js`,
  `src/atlas-pending.js` were introduced in commits `791ea40` and
  `ae41469` as Phase-1 prep but call-sites in the portal still use
  inline templates. Migration is intentional and deferred. **No
  go-live blocker.**

---

## Quick-reference file map

| Concern | File | Lines |
|---|---|---|
| Sign-token entry | portal.html | 1601-1648 |
| OTP init/send/verify/skip | portal.html | 1798-1947 |
| Signature canvas | portal.html | 1949-2013 |
| Submit + post-sign automation | portal.html | 2015-2180 |
| Magic-link bootstrap | portal.html | 1558-1599 |
| Magic-link issuer | portal.html | 13606-13627 |
| Tenant welcome email | portal.html | 13569-13657 |
| Lead → contract bridge | portal.html | 2255-2307 |
| Admin user create | portal.html | 9784-9811 |
| PFS → tenant promotion | portal.html | 10850-10930 |
| Allegato B PDF | portal.html | 11853-12235 |
| Allegato C PDF | portal.html | 12241-12602 |
| Download contract PDF | portal.html | 13964-14029 |
| Regenerate + self-heal | portal.html | 14032-14094 |
| PropPass generation | portal.html | 13251 |
| writePendingMemory | portal.html | 12636-12655 |
| Proposta di locazione template | portal.html | 6438, 14438-14464, 15055+ |
