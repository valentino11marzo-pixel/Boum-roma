# BOOM Roma — Project Guide

Premium rental management platform for Rome's apartment market. Serves tenants, landlords, and admins with listings, contracts, document management, and Apple Wallet passes.

**Live site**: boomrome.com

## Tech Stack

- **Frontend**: Vanilla HTML/CSS/JS (no framework, no build step)
- **Database & Auth**: Firebase (Firestore + Firebase Auth)
- **Backend**: Vercel Serverless Functions (Node.js, CommonJS)
- **Hosting**: Vercel — static HTML served directly, no build pipeline
- **Apple Wallet**: passkit-generator v3.5.7
- **Email**: Nodemailer (Gmail) for backend, EmailJS for client-side
- **PDF/Charts**: jsPDF, html2canvas, PDF-lib, Chart.js (loaded via CDN)
- **AI**: Anthropic Claude API for document parsing (proxied through `/api/parse-docs.js`)

## File Structure

```
/                         All HTML pages served from root (56 files)
/api/                     Vercel serverless functions
  generate-pass.js        POST — creates Apple Wallet .pkpass files
  reminder-cron.js        Cron (*/15 * * * *) — Firebase sync + email reminders
  parse-docs.js           POST — Anthropic API proxy for document parsing
  /pfs/                   PFS radar: scan-inbox (email alerts via IMAP),
                          scan-market (portal scraping), sync-searches
                          (auto-search generation), _ingest (shared pipeline),
                          _health (heartbeats + Telegram alerts)
/js/
  firebase-config.js      Firebase SDK init (project: boom-property-dashboards)
  boom-portal.js          Shared client lib for the 3 portals (auth guard,
                          realtime listener, toast, loader, confirm, SW reg)
  taxpack-engine.js       Pure Italian rental-tax engine (checklist, totals,
                          cedolare calc, zip manifest). window.BOOM_TAXPACK
  fiscal-engine.js        Pure obligations engine: per-property/contract +
                          company (Egidi) fiscal deadlines + amounts.
                          window.BOOM_FISCAL
firestore.rules           Firestore security rules (role-based)
storage.rules             Storage security rules (role-based file access)
firebase.json             Firebase deploy config (firestore + storage rules)
/css/
  boom-core.css           Marketing site design system (used by index, etc.)
/pass-assets/             Apple Wallet pass resources (icons, logos, strips)
  viewing/  tenant/  referral/  landlord/
/public/
  deals_v2_commandcenter.html
```

## Key Files

| File | Purpose |
|---|---|
| `portal.html` | Main admin/user app (~21K lines). Single-page app with all CRUD, dashboards, analytics. **Read first.** |
| `proppass.html` | Apple Wallet pass generator UI. Four pass types: viewing, tenant, referral, landlord. |
| `pass-delivery.html` | Pass display page with animated gold-ring background and QR code. |
| `index.html` | Landing page / homepage. |
| `apartments.html` | Property listings page. |
| `apartment-detail.html` | Dynamic single-property page (loads from Firestore). |
| `boom_doc_parser.html` | AI document parser UI (uses Claude API). |
| `vercel.json` | Deployment config, rewrites, cron schedule. |
| `js/firebase-config.js` | Firebase project config (`boom-property-dashboards`). |
| `js/boom-portal.js` | Shared portal lib — `window.BoomPortal` API. |
| `owner-dashboard.html` | Landlord/owner SPA. Firestore-backed, filtered by `ownerId`. |
| `tenant.html` | Tenant SPA. Realtime property + maintenance feed. |
| `client-portal.html` | PFS client swipe app. Reads `pfsClients` collection. |
| `pfs-command.html` | PFS Command Center (admin). Radar feed, per-client match scores, outreach tracking, source health, search management. Backed by `api/pfs/*`. |
| `sw.js` | Service worker (network-first HTML, cache-first static). |

## Brand & Design

- **Primary background**: `#08080A` (near-black)
- **Accent gold**: `#D4AF37`
- **CSS variables** (defined in portal.html, reused across pages):
  ```css
  --gold: #D4AF37;
  --gold-light: rgba(212,175,55,0.15);
  --gold-dark: #B8960C;
  --bg: #000;
  --bg-card: #0A0A0A;
  --bg-elevated: #141414;
  --bg-input: #1A1A1A;
  --border: rgba(255,255,255,0.08);
  --text: #FFF;
  --text-secondary: #999;
  ```
- **Typography**: Helvetica Neue 300, Inter fallback. Wide letter-spacing (2-6px) for luxury feel.
- **Dark mode only** — all pages use dark backgrounds with gold accents.

## Deployment

- **Platform**: Vercel
- **Build**: None — static files served as-is
- **outputDirectory**: Must be `"."` (root), NOT `"public"`. All HTML lives in root.
- **Deploy**: `git push` to main triggers automatic Vercel deployment
- **Cron**: `reminder-cron.js` runs every 15 minutes (configured in vercel.json)
- **Functions timeout**: 60s max for reminder-cron

## Environment Variables (Vercel)

```
# Firebase (for reminder-cron.js server-side auth)
FIREBASE_API_KEY
FIREBASE_ADMIN_EMAIL
FIREBASE_ADMIN_PASS
FIREBASE_PROJECT_ID          # boom-property-dashboards

# Apple Wallet pass signing
PASS_CERT_BASE64
PASS_KEY_BASE64
PASS_KEY_PASSPHRASE

# Email (Nodemailer)
GMAIL_USER
GMAIL_APP_PASS

# AI document parsing
ANTHROPIC_API_KEY

# Cron auth
CRON_SECRET

# Homie Mac bridge (inbound webhooks)
HOMIE_SECRET                 # shared secret sent as X-Homie-Secret header

# Telegram listing wizard bot
WIZARD_SECRET                # shared secret sent as X-Wizard-Secret header
                             # (optional — falls back to HOMIE_SECRET)

# PFS radar (api/pfs/*)
PFS_IMAP_USER                # optional — alert mailbox if ≠ GMAIL_USER
PFS_IMAP_PASS                # optional — its app password (IMAP read)
TELEGRAM_BOT_TOKEN           # already used by api/telegram/*; pfs health alerts
TELEGRAM_CHAT_ID
```

## API Endpoints

### POST `/api/generate-pass`
Generates `.pkpass` files. Body: `{ passType, fields }` where passType is `viewing|tenant|referral|landlord`. Returns binary `.pkpass` data.

### POST `/api/parse-docs`
Proxies to Anthropic Claude API for document extraction. Accepts up to 20MB payload.

### GET `/api/reminder-cron`
Triggered by Vercel cron every 15 min. Authenticates with Firebase, queries pending reminders, sends emails via Nodemailer.

### POST `/api/homie/inbound`
Webhook called by the Mac-side Homie agent when it filters a new lead from Immobiliare/Idealista/WhatsApp/intake. Auth via `X-Homie-Secret` header. Writes to the `leads` collection. Same schema cockpit-preview.html + portal.html already read — no fork.

### POST `/api/homie/action`
Webhook for Homie's proposed actions (reply draft, schedule viewing, qualify, archive). Writes to `action_queue` collection. Supports idempotent retries via `contextHash` field and auto-apply for high-confidence tier-1 actions.

### POST `/api/wizard/publish`
Publish bridge for the Telegram listing wizard bot. Auth via `X-Wizard-Secret`
header (env `WIZARD_SECRET`, falls back to `HOMIE_SECRET` / `X-Homie-Secret`).
Accepts either the raw Firestore REST `{ fields: {...} }` payload the bot
already builds, or a plain JSON listing object. Optional `?id=<docId>` (or
`body.id`) makes it an upsert; otherwise Firestore auto-IDs. Writes to
`listings` under admin credentials — direct unauthenticated writes to
firestore.googleapis.com are denied by `firestore.rules` (admin-only).
Returns `{ ok, id, url }`.

### POST `/api/wizard/describe`
AI listing-copy for the Telegram wizard bot. Auth via `X-Wizard-Secret`
(same secret as `/api/wizard/publish`). Body is the structured listing
(`type, zone, sqm, floor, beds, bathrooms, furnished, price, features[], …`);
returns `{ ok, en, it }` — a polished bilingual description from Claude
(`claude-haiku-4-5-20251001`). The `ANTHROPIC_API_KEY` stays server-side; the
bot can't call Claude directly. Bot falls back to a template if this is
unavailable.

### POST `/api/wizard/upload`
Photo-upload bridge for the Telegram wizard bot. Auth via `X-Wizard-Secret`
(same secret as `/api/wizard/publish`). Body `{ base64, path?, contentType? }`
(base64 may be a data: URI). Uploads to Firebase Storage under admin
credentials (forced under the `listings/` prefix) and returns
`{ ok, url, path }`. Lets the bot store photos without holding Firebase admin
creds; the bot falls back to a direct Storage upload if this is unavailable.

### POST `/api/magic-sign/lookup`
Public endpoint for the Magic-Sign UI. Body: `{ token }`. Looks up the
contract by `tenantSignToken` or `landlordSignToken`, returns sanitized
`{role, contract, property, signer, otherParty}`. Replaces the previous
flow which had the browser issue `db.collection('contracts').where(...)`
anonymously — denied by `firestore.rules`.

### POST `/api/magic-sign/submit`
Public endpoint that persists the contract signature on behalf of the
anonymous Magic-Sign user. Body includes the token, signature data URI,
identity payload, phone, consent record. Runs every Firestore write under
admin credentials (signature + identity + landlord profile + RLI deadline
+ lead closure + property status + listing sync + payment schedule +
tenant user bootstrap). All those mutations are admin-only per the rules.

### POST `/api/documents/share`
Admin/landlord (Firebase ID token via `api/_auth.js`). Creates a
`documentShares` doc (token, ownerId, docIds, recipientName, watermark,
expiresAt, views[]) and returns a `/share.html?t=<token>` link for the
commercialista. Landlords can only share their own bundle.

### POST `/api/share/lookup`
Public, no login. Body `{ token }`. Resolves the share under admin creds,
enforces expiry/revocation, returns the listed documents (sanitized) and
audit-logs every view (ip/ua/time) to the share's `views[]` + activityLog.
Backs `share.html`.

### POST `/api/documents/ocr`
Admin/landlord (Firebase ID token). Body `{ fileUrl }` or `{ base64,
mediaType }`. Fetches the file server-side, sends to Claude (haiku), returns
`{ category, text, entities:{ dates, amounts, codiceFiscale, iban,
partitaIva, fiscalYear } }`. Anthropic key stays server-side.

### POST `/api/homie/property`
Homie → PFS bridge. Homie scrapes a property (Immobiliare/Idealista/etc.), calls this with the listing data. Validates, then delegates to the shared ingestion pipeline `api/pfs/_ingest.js` (dedupe on `pfsProperties/<sha1(sourceUrl)>`, agency filter, scoring via `api/homie/_match.js`, push score ≥ 60 into each active client's `portalProperties` swipe deck). Client-portal.html already listens and triggers a "New Property!" alert on the client's phone. Auth via `X-Homie-Secret`. See file header for payload schema.

## PFS Radar (automated market scan — api/pfs/*)

The PFS pipeline finds rental listings for paying search clients with no
manual monitoring. One shared ingestion path (`api/pfs/_ingest.js`):
dedupe → advertiser policy (agency listings stored but NEVER pushed) →
score every active `pfsClients` doc (`api/homie/_match.js`, both client
schemas supported) → push into swipe decks → `matchSummary` persisted on
the `pfsProperties` doc for the command center.

| Endpoint (cron) | Schedule | What it does |
|---|---|---|
| `/api/pfs/scan-inbox` | */15 min | **Load-bearing source.** Reads Idealista/Immobiliare search-alert emails from the Gmail mailbox over IMAP (imapflow), reconstructs canonical listing URLs from tracking links (`api/pfs/_alertparse.js`), enriches from the detail page when possible, ingests. Stateless: re-scans a 3-day window, dedupe makes reruns no-ops. |
| `/api/pfs/scan-market` | 2×/hour | Best-effort scraper of the auto-generated searches in `radarSearches` (portals 403 datacenter IPs at will — failures are expected and tracked). |
| `/api/pfs/sync-searches` | daily | Auto-(re)generates one `radarSearches` doc per active client per portal from their stored criteria (`api/pfs/_searchurls.js`). Manual knobs `enabled`/`urlOverride` are never clobbered. Clients gone inactive → searches disabled. |
| `/api/pfs/brief` | daily 06:00 UTC | AI daily briefing: compacts the last 48h (annunci, match, outreach, feedback clienti, salute fonti) and asks Claude (`claude-opus-4-8`, raw-fetch pattern) for an Italian operational brief. Cron → delivered to Telegram; command-center button → returned as JSON `{ ok, brief, stats }`. |

All three accept POST with Vercel cron secret, `X-Homie-Secret`, or an
admin Firebase ID token (the command center's "Scansiona ora" buttons) —
see `api/pfs/_guard.js`. Every run writes a heartbeat to
`pfsRadarHealth/<source>`; 3+ consecutive failures → Telegram alert
(`api/pfs/_health.js`), recovery notified once. Listings that could not be
auto-ingested (e.g. no price recoverable) land in
`pfsRadarHealth.needsAttention` — surfaced in `pfs-command.html`, never
silently dropped.

### POST `/api/admin/match-test`
Admin test harness + manual-ingest endpoint (Firebase ID token, role
admin/owner/landlord). `dryRun:true` scores a hypothetical listing against
every active client without writing; `dryRun:false` ingests + pushes for
real. Backs the "Aggiungi annuncio" modal in `pfs-command.html`.

## Conventions

- All pages are standalone HTML with inline `<style>` and `<script>` blocks — no bundler
- Firebase is loaded via CDN `<script>` tags, initialized per-page
- New pages should follow the dark theme with gold accents pattern
- Property-specific pages follow `apartment_[name].html` naming
- Blog posts follow `blog-[slug].html` naming
- No automated tests exist in this project
- PWA support via `manifest.json` and `sw.js` service worker — registered on
  the 3 portals via `BoomPortal.registerServiceWorker()`

## Portals (logged-in surfaces)

Three role-scoped SPAs sit on top of the same Firestore project. All three
load `/js/boom-portal.js` for shared utilities (auth, realtime, toast,
loader, confirm dialog) — see `BoomPortal.*` API.

| Portal | Role(s) accepted | Collections read/written |
|---|---|---|
| `owner-dashboard.html` | `owner`, `landlord`, `admin` | reads/writes `properties` filtered by `ownerId` |
| `tenant.html` | `tenant` | reads `properties` (own), writes `maintenance` |
| `client-portal.html` | access code on `pfsClients` doc | reads/writes `pfsClients.portalProperties` |

Auth gate pattern (use this for any new portal page):

```js
const { user, profile } = await BoomPortal.requireAuth(
  ['owner', 'landlord', 'admin'],   // allowed roles, or null to skip
  { loginUrl: '/login.html' }
);
```

Firestore listeners with auto-retry / exponential backoff:

```js
const unsub = BoomPortal.listen(
  db.collection('properties').where('ownerId', '==', user.uid),
  (snap) => { /* render */ },
  (err) => { /* optional error handler */ }
);
```

## Common Tasks

**Add a new apartment page**: Copy an existing `apartment_*.html`, update content and Firestore document ID.

**Add a new API endpoint**: Create a file in `/api/`, export a default handler `(req, res) => {}`. It auto-deploys as a serverless function.

**Modify pass design**: Edit pass type config in `/api/generate-pass.js`. Assets in `/pass-assets/[type]/`.
