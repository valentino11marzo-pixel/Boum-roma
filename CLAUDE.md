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

# La Squadra (api/employees/*)
ACCOUNTING_EMAIL             # optional — recipient of the Contabile's monthly
                             # close email (falls back to GMAIL_USER)

# La Banca — open banking (api/banking/*)
GOCARDLESS_SECRET_ID         # GoCardless Bank Account Data (ex Nordigen).
GOCARDLESS_SECRET_KEY        # NOTE: GC closed NEW signups (2026) — only
                             # usable with a pre-existing account. Without
                             # them /banca works via the email statement
                             # scanner (scan-inbox) + manual CSV import.
BANK_MAIL_FROM               # optional — extra sender filters for the bank
                             # statement email scanner (comma-separated,
                             # e.g. "intesasanpaolo.com,fineco.it")

# Lo Smistatore (api/documents/_smista.js + scan-inbox)
DOC_MAIL_FROM                # optional — extra TRUSTED senders whose email
                             # attachments get auto-filed (comma-separated,
                             # e.g. "commercialista@studiorossi.it"). The
                             # operator's own addresses are always trusted.
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

### GET/POST `/api/wizard/health` (cron */10 min)
Watchdog for the Telegram listing wizard bot. The bot (via
`bot/wizard_heartbeat.py`, the launchd entry point on the Mac mini) writes
`heartbeat/listing-wizard` every 60s; this cron alerts the admin Telegram
chat when the heartbeat is >5 min stale (re-alert every 6h, one recovery
message when it returns; missing doc = wrapper not deployed → silent). Auth
like the PFS crons: Vercel cron Bearer `CRON_SECRET`, `X-Homie-Secret`, or
admin Firebase ID token.

### POST `/api/wizard/interpret`
Natural-language listing edits for the wizard bot. Auth `X-Wizard-Secret`.
Body `{ text }` (operator message in Italian, e.g. "metti il deposito a due
mesi per Pigneto"). Reads the real catalog, asks Claude haiku for an update
plan, sanitizes against a field whitelist (an hallucinated field/id can never
pass), derives money fields (`depositMonths` → EUR `deposit`, price change →
deposit recompute, twins size/bedrooms) and returns
`{ action:'update', id, name, updates, summary[] }` or
`{ action:'none', note }`. Never writes — the bot shows the summary with a
✅ Conferma button and applies on tap. The bot falls back to a local regex
parser (deposito/prezzo/video/stato) when this endpoint is unavailable.

### GET/POST `/api/wizard/video-radar` (cron Monday 07:00 UTC)
Weekly video-coverage nudge. Lists AVAILABLE listings without `videoUrl`
and messages the admin Telegram chat with the `/video <id> <link>` command
for each. Silent at 100% coverage. Auth like `/api/wizard/health`.

### POST `/api/wizard/upload`
Photo-upload bridge for the Telegram wizard bot. Auth via `X-Wizard-Secret`
(same secret as `/api/wizard/publish`). Body `{ base64, path?, contentType? }`
(base64 may be a data: URI). Uploads to Firebase Storage under admin
credentials (forced under the `listings/` prefix) and returns
`{ ok, url, path }`. Lets the bot store photos without holding Firebase admin
creds; the bot falls back to a direct Storage upload if this is unavailable.

### POST `/api/apply-lead`
Public lead-capture for the apartment-detail APPLY/RESERVE/WAITLIST flow.
Fired (non-blocking) when a visitor passes the quick eligibility check. Body
`{ name, email, phone, listingId, listingName, listingPrice, zone, kind,
waitlist, income, guarantor, household(solo|couple|family|flatmates),
occupation(employed|self-employed|student|relocating), moveIn, durationMonths,
company(honeypot) }`. Same hardening as `/api/canone-lead` (honeypot, per-IP
rate limit, clip/num sanitizers). Writes to `leads` in the exact portal/
cockpit schema (`status:'new'`, `source:'web'`, `intent:apply|reserve|waitlist`,
qualification snapshot in `message` + `raw`) so every serious applicant lands
in the pipeline even if they never open Stripe. Returns `{ ok, id }`.

### POST `/api/service-checkout`
Public one-tap Stripe Checkout for the productised services (Services 2.0
pages). Server-side catalog decides price/copy — the client only names the
kind: `virtual-viewing` (€89), `deal-assistance` (€249),
`deposit-recovery` (€99 + 20% success fee, art. 1590 c.c.) or
`contract-check-express` (€49, credited on Deal Assistance). Body `{ kind,
name, email, phone, listing?, notes?, company(honeypot) }`, same hardening
as apply-lead. Returns `{ ok, url }` → Stripe. The webhook branch
`service:'SERVICE'` writes a paid lead (`leads/svc_<sessionId>`) and sends
admin + client confirmation emails. Property Finding (€350) keeps its own
`/api/create-checkout` (PFS metadata + webhook branch); Concierge is
WhatsApp-only. All four pages (`virtual-viewing`, `deal-assistance`,
`property-finding`, `concierge`) are standalone Services 2.0 product pages
(MATERIA ambient, pay-plate + checkout sheet, sticky mobile pay bar,
JSON-LD Service+Offer+FAQ).

### POST `/api/search/save`
Public save-search endpoint for the apartments discovery page. Body
`{ email, label?, criteria{q,budgetMax,moveIn,beds,baths,furnished,video,
zones[],feats[]}, resultCount?, company(honeypot) }`. Validates email,
honeypot + per-IP rate limit (same hardening as `/api/canone-lead`), writes
to the `savedSearches` collection under admin creds (`status:'active'`,
`lastNotified:null`). Returns `{ ok, id }`.

### GET `/api/search/matcher` (cron 3×/day)
The saved-search alert engine. Matches every active `savedSearches` doc
against rentable `listings` (mirrors the discovery page's pass()); first
run per search SEEDS silently (`notifiedIds`) so subscribers only hear
about listings that appear AFTER saving; later runs email a digest (max 6
homes) via Nodemailer with /listing/:id links + one-click unsubscribe
(`/api/search/unsub?id&e` → status:'unsubscribed'). `?dry=1` reports
without emailing. Auth: Vercel cron Bearer CRON_SECRET.

### Pre-agreement suite (`/api/preagreement/*` + `pre-agreement.html` + `pre-agreement-admin.html`)
Sendable RENTAL PROPOSAL / pre-agreement, modeled on the real BOOM document
(parties landlord⇄tenant, transitional lease L.431/98 art.5 c.1, fee % of
annual rent + VAT "due separately", conditions 5.1–5.7, Egidi footer).
- `POST /api/preagreement/create` — admin/owner/landlord (Bearer ID token).
  Deal fields (property, landlord, lease, money knobs: rent/energyCredit/
  depositMonths/depositSplitPct/feeMode(pct|months)/feePct/feeMonths/
  feeVatPct/feeDue(move-in|signing|separate)/dueAtSigning) → creates
  `preAgreements` doc with 32-hex token → `{ ok, id, token, url }`.
  All money derivations server-side via exported `deriveMoney()` (monthly
  total with energy credit, deposit split at-signing/at-move-in, fee as %
  of annual OR months of rent, endDate month-end clamp). The admin console
  mirrors the same math client-side for edit-in-place.
- `POST /api/preagreement/lookup` — public `{ token }` → sanitized doc
  (incl. `tenants[]`); audit-logs views; 410 when revoked.
- `POST /api/preagreement/submit` — public. Tenant self-fills identity
  (name/dob/birthplace/nationality/address/CF/ID/email/phone) + optional
  co-tenants (`tenants[]`, ≤6, each typed name = signature, joint & several
  liability clause auto-added) + consent → status `accepted`, quotable ref
  `BOOM-<base36>`, and when `money.dueAtSigning>0` returns a Stripe Checkout
  URL (acceptance is never voided by a failed checkout).
- `POST /api/preagreement/convert` — admin/owner/landlord. One tap from the
  console: accepted/paid PA → `contracts` doc (identity/lease/money carried
  over, tenant `users` profile bootstrapped by email match, Magic-Sign
  tokens minted, `signingOrder:'sequential'`). `delegate:true` (default)
  records `landlordDelegate` — the landlord-side sign link is returned to
  the ADMIN who countersigns per delega after the tenant signs (sign.html
  shows "signing as X on behalf of Y"; magic-sign submit stamps
  `landlordSignedByDelegate`). Idempotent via `pa.contractId`.
- `POST /api/preagreement/upload` — public, PA-token-scoped. The Verify
  step's ID/passport upload: base64 (client downscales photos to ~1800px
  JPEG) → Firebase Storage `preagreements/<paId>/…` under ADMIN creds
  (admin-only per storage.rules; tokenized URL kept on `pa.uploads[]`,
  never returned to the public page). Convert copies these onto the
  contract (`identityDocs`) + tenant user profile.
- `api/preagreement/_auto.js` — `maybeAutoConvert()`: when the PA carries
  `propertyId` + `autoConvert` (set from the console's "Portal property"
  picker), the contract creates ITSELF the moment the deal closes — from
  `submit.js` (acceptance with nothing due) or the Stripe webhook (paid).
  ADMIN-ONLY notification: the client's Magic-Sign email is a deliberate
  console decision, never automatic.
- `POST /api/preagreement/send-sign` — the console's 🖊 Magic Sign button.
  Admin auth. One tap: converts if needed (idempotent), emails the tenant
  their Magic-Sign link, patches `pa.signSentAt` + stores both sign URLs on
  the PA (admin-only) so the row offers WhatsApp share + delegate-link copy.
  Re-press = resend.
- `POST /api/preagreement/notify` — console "✉ Reinvia copia". Admin auth.
  Re-sends the accepted/paid document email to the client (recovery path
  for failed sends / "non l'ho ricevuta").
- **Email transport warning**: `nodemailer` and `pdf-lib` MUST be imported
  statically (top-level `import`). Lazy `await import('pkg')` is not traced
  by Vercel's bundler → "Cannot find package" at runtime in production
  (this silently killed all pre-agreement emails until 2026-07).
- `pre-agreement.html` — the public page, an Apple-style guided 4-step
  flow: **Review** (hero tiles: monthly all-in / due today / move-in /
  term, full terms, advisor card, trust chips) → **Details** (identity +
  "+ Add a co-tenant" blocks, draft autosaved) → **Verify** (optional ID
  upload per signer — skippable, GDPR note) → **Sign** (the assembled
  paper document with typed-calligraphy signatures + consent). Frosted
  segmented stepper, single bottom action bar, stamp ceremony, accepted
  view with "what happens next" timeline (payment → contract → sign →
  keys), Stripe resume, QR, WhatsApp copy, print = b/w paper replica.
  Custom `extras[]` money lines render in §4, `customClauses[]` in §5.
- `pre-agreement-admin.html` — generator + management console (BoomPortal
  auth, listing prefill, live fee math, WhatsApp share). Realtime list of all
  preAgreements with status chips (sent/viewed/accepted/paid/revoked): copy
  link, WhatsApp, **Edit terms** (patches the SAME doc/token — the client's
  existing link shows the new terms, status back to `sent`; only for
  sent/viewed/revoked), Duplicate (prefills a new one), Revoke/Reactivate.
- `api/preagreement/_notify.js` — b/w document email (modeled on the real
  proposal) + `sendPaEmails({event:'paid'|'accepted', notifyClient})`.
  Client gets the document + Stripe receipt link; admin
  (valentino@boom-rome.com) gets a copy + next-step nudge. Gmail/Nodemailer.
- `api/stripe-webhook.js` PREAGREEMENT branch — on checkout completed:
  doc → `status:'paid'` (+paidEur/paidAt/paidSessionId, idempotent on
  retries), fetches the Stripe receipt_url, sends both emails.
- `submit.js` also emails at acceptance: client copy only when nothing is
  due via Stripe (else it arrives after payment); admin always notified.

**Deal pipeline (protocol)**: lead (`/api/apply-lead` or portal) →
pre-agreement (console, with a Portal-property link → tokenized link →
client walks the 4-step flow: reviews, self-fills + co-tenants, uploads
ID, signs → Stripe if due>0 → confirmation emails + WhatsApp copy) →
contract creates AUTOMATICALLY on close (`_auto.js`; or manually via the
console's "→ Contract" / `/api/preagreement/convert`) with identity, ID
files and terms carried over → tenant gets the Magic-Sign link by email →
admin countersigns per delega on their own schedule → RLI registration →
tenant portal (payments/documents). Terms differ per deal: any money knob,
extra line items and custom clauses per PA; edit before acceptance (same
link); after acceptance/payment, Duplicate creates the new version.

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

## La Squadra (AI employees — api/employees/*)

Scheduled "employees" that run the back office autonomously. Same
infrastructure as the PFS radar: heartbeat per run (`teamHealth/<employee>`,
Telegram alert after 3 consecutive failures via `api/pfs/_health.js`), a
compact run report (`teamReports`), and — crucially — **no new approval
surface**: anything outbound (emails to tenants/leads) is PROPOSED into the
existing `action_queue`, pinged to Telegram within a minute by
`api/telegram/notify-pending.js`, and sent by `api/agent/execute.js` only
after a human tap. Shared plumbing in `api/employees/_lib.js`
(`proposeAction` is idempotent via `contextHash` — reruns never duplicate).

| Employee (cron) | Schedule (UTC) | What it does |
|---|---|---|
| `/api/employees/contabile` | daily 04:40 | Fiscal picture from live data: obligations due/overdue (`js/fiscal-engine.js`, landlord + company from paid `invoices` by quarter), commercialista document checklist per contract (`js/taxpack-engine.js`), collections YTD + late payments. Telegram only when actionable. On the 1st of the month emails a "chiusura mese" recap (`ACCOUNTING_EMAIL` env, falls back to `GMAIL_USER`). |
| `/api/employees/gestore` | daily 05:10 | Property manager: drafts payment-reminder emails (≥3gg late, re-proposes weekly via ISO-week contextHash) and signature nudges with the party's Magic-Sign link (`/sign?sign=<token>`) as approvable `action_queue` items; Telegram digest of renewals ≤90gg, compliance deadlines (`js/compliance-rules.js`), maintenance open >48h. |
| `/api/employees/commerciale` | every 2h, 06-18 | Lead responder: any lead still `new` after a 20-min human window gets a Claude-drafted first reply (same persona as `agent/ai.reply`) proposed for approval; still `new` after 48h (grade A/B or apply/reserve) gets one templated follow-up. Caps per run; dedupe before paying for the AI call. |

All three accept POST with Vercel cron secret, `X-Homie-Secret`, or an admin
Firebase ID token (see `api/pfs/_guard.js`); `?dry=1` computes without
writing/notifying; contabile also accepts `?monthly=1` to force the monthly
close email.

**Console**: `team.html` (`/team`, admin-only, noindex) — status dot + last
run per employee (the PFS radar appears as "Lo Scout" rolling up
`pfsRadarHealth`), pending proposals, latest reports, "Esegui ora" buttons.

## Lo Smistatore (document intake — api/documents/_smista.js)

"Mando qualsiasi cosa per il commercialista e si archivia da sola." One
shared pipeline (`smistaDocument`): Claude haiku classifies the file
(PDF/image) against the REAL property list, picks fiscal year + contract,
uploads to Storage and files it in `documents` with keyword-rich categories
that `taxpack-engine.docMatchesRequirement` already matches — so filing an
F24 IMU automatically ticks the pacchetto-commercialista checklist. Docs
with no confident property match get `needsFiling:true` (folder
99_DaSmistare), surfaced by the Contabile's morning report.

Two intakes:
- **Telegram** (`api/telegram/webhook.js`): send ANY photo/PDF to the bot
  (caption = optional hint, e.g. "F24 IMU via Cavour"); replies with what
  it understood and where it filed it. Authorized chat only.
- **Email** (`api/documents/scan-inbox.js`, cron daily 03:50): forward an
  email with attachments to the BOOM mailbox — processed ONLY from trusted
  senders (operator's own addresses + `DOC_MAIL_FROM`). Processed emails
  remembered in `docImports`; per-run AI budget; Telegram recap.

## La Banca (open banking — api/banking/* + banca.html)

PSD2 bank feed for the Contabile via **GoCardless Bank Account Data** (ex
Nordigen, free tier, covers Italian banks; consent renews every ~90 days —
BOOM never sees bank credentials). Collections: `bankAccounts` (linked
accounts + consent expiry + balance snapshot), `bankTransactions` (one doc
per movement, stable content-hash ids → every sync/import re-run is a
no-op), `bankRequisitions` (consent audit).

| Endpoint | What it does |
|---|---|
| `POST /api/banking/institutions` | bank picker (`{q}` search); `configured:false` when GC keys missing |
| `POST /api/banking/connect` | creates end-user agreement (max history the bank allows, up to 540gg) + requisition → `{link}` to the bank's consent page; redirect back to `/banca?ref=<id>` |
| `POST /api/banking/finalize` | stores authorized accounts after the redirect |
| `POST /api/banking/sync` | **cron daily 04:15** (before the Contabile). Pulls movements (first run backfills full history), dedupes via batchGet, categorizes (prima nota rules in `_lib.js`), reconciles credits against pending `payments`: exact amount + due-date window + unique candidate + (tenant-name or month or unique-amount) → payment marked paid (`paidVia:'bank'`); weaker matches → `matchSuggestions`, confirmed by one tap in /banca. Heartbeat `teamHealth/banca`; Telegram when a consent is ≤7gg from expiry. |
| `POST /api/banking/export` | estratto conto / prima nota CSV for the commercialista — Italian format (semicolon, DD/MM/YYYY, decimal comma, UTF-8 BOM); prima nota adds per-category period totals |
| `POST /api/banking/scan-inbox` | **cron daily 04:05 — the primary feed now that GoCardless is closed to new signups.** Reads the Gmail mailbox over IMAP (same infra as pfs/scan-inbox). Three tiers: (1) **movement-alert emails** ("Hai ricevuto un bonifico di €1.200 da…") — amounts live in the BODY, extracted via Claude haiku, but ONLY from recognized bank sender domains (`KNOWN_BANK_DOMAINS` + `BANK_MAIL_FROM`) so a tenant writing "ti ho fatto il bonifico" never becomes a transaction; (2) **statement attachments** — CSV parsed directly, PDF via Claude document block; (3) forwarded emails, same handling. "Statement available behind login" emails yield an empty extraction and are remembered so the AI call is never repeated. Processed emails → `bankImports`; tx-level dedupe makes re-runs no-ops; per-run AI budget. Telegram recap when something lands. Heartbeat `teamHealth/banca-mail`. Setup: attiva nell'home banking gli avvisi email di movimento (e, se disponibile, l'invio dell'estratto come allegato). |
| `POST /api/banking/import` | manual fallback: paste the home-banking CSV (column auto-detect for the common Italian exports), same dedupe+reconcile pipeline — works with zero API setup |
| `POST /api/accounting/scadenzario` | unified deadline book derived live: company (IVA/LIPE/CCIAA/Redditi from `invoices` by quarter) + one group per property owner (registro, IMU, cedolare, ISTAT + contract renewals ≤120gg). `format:'ics'` → calendar file (stable UIDs, re-import updates). |

All admin-gated via `api/pfs/_guard.js`. **Console**: `banca.html` (`/banca`,
admin-only, noindex) — linked accounts + consent status, recent movements
with one-tap match confirmation, CSV/ICS export, manual import. The
Contabile's morning report includes the bank picture (riconciliati/da
confermare/consensi scaduti).
### `/api/photos/enhance` — the unified photo brain
One pipeline, three doors:
1. **Console** (`photo-lab.html`, renders the catalog unauthenticated; auth on
   action): `POST { listingId, mode:'audit'|'apply' }` with a Firebase ID
   token (role admin/owner/landlord).
2. **Telegram wizard bot** (`bot/boom_listing_wizard.py` → `photos_enhance()`):
   same POST with `X-Wizard-Secret` (or `X-Homie-Secret`) — the SAME shared
   secret as every other wizard→server call; no Firebase login needed. The
   bot auto-applies after publish (≥2 photos), plus `/fotolab <ID>` and the
   NL "migliora le foto" intent.
3. **Nightly sweep cron** (03:20 UTC, `GET ?mode=sweep&limit=N` with Bearer
   CRON_SECRET): finds listings never curated OR whose curation was clobbered
   (a wizard re-publish replaces the whole `images` array) and re-applies, up
   to 3 per run, time-boxed — nothing stays raw forever.

`audit` = Claude Vision (haiku) classifies every photo (photo/render/
floorplan/document, room, needed rotation, quality, coverScore, watermark) →
plan: best real photo as cover, gallery reordered living→kitchen→bedrooms→
bath→exterior with floorplans last, exact duplicates dropped. Zero writes.
`apply` = sharp enhancement (EXIF+AI rotation, contrast stretch, per-photo
preset; floorplans never saturated), uploads to `listings/enhanced/<id>/`,
patches `image`/`images`/`photosEnhancedAt`/`photosEnhancedBy`.
**Re-publish healing**: the plan source is always `imagesOriginal` ∪ {current
photos that are neither enhanced outputs nor already tracked} — new raw
photos join additively, our own outputs never re-enter, and `imagesOriginal`
is updated to that union. Reversible; originals never deleted. Heuristic
fallback when ANTHROPIC_API_KEY is absent. sharp is a real dependency
(api/package.json); function has maxDuration 60 + 1769MB in vercel.json.

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

**Single auth surface**: `/login` (login.html) is the ONLY sign-in UI on the
site. portal.html, boom_doc_parser.html and the `BoomPortal.requireAuth` guard
all redirect unauthenticated users to `/login?next=<requested page>` and the
login page returns them there after sign-in. Never add a new inline login
form — redirect to `/login` with a `next` param instead. The login page also
pre-warms the portal.html shell via the service worker while the user types,
so the post-login load is instant. `sw.js` must NOT precache portal.html at
install time (the public site registers the same SW).

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
