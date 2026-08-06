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
  dataops-engine.js       Pure engine behind Bonifica + Innesto: test-data
                          classifier (with the `protected` lock), orphan
                          detection, CF/IBAN validation, entity matching,
                          proposal normalization. window.BOOM_DATAOPS
  fiscal-engine.js        Pure obligations engine: per-property/contract +
                          company (Egidi) fiscal deadlines + amounts.
                          window.BOOM_FISCAL
  boom-geo.js             How true is this pin — exact (street+number) /
                          street / zone / none, read from listing.geo.
                          window.BOOM_GEO. See "Precisione dei pin".
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
OPENAI_API_KEY               # optional — Whisper transcription for the
                             # wizard bot's voice notes (/api/wizard/transcribe)

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

# Canone via BOOM + journey (api/payments/pay.js, api/journey/_run.js)
RENT_FEE_PCT                 # optional — service fee % on card rent payments
                             # (default 2.5)
RENT_FEE_MIN                 # optional — fee floor in EUR (only with RENT_FEE_PCT)
RENT_FEE_BUFFER              # optional — margine sopra il costo Stripe misurato,
                             # in euro (default 0 = si va a pari)
RENT_FEE_MAX_PCT             # optional — tetto di sicurezza in % (default 4)

# Canone automatico SEPA (api/payments/_sdd.js, sdd-setup.js)
SDD_FEE_EUR                  # optional — commissione flat forzata per addebito
SDD_FEE_BUFFER               # optional — margine BOOM sopra il costo medio
                             # misurato (default 1.50 — qui il default NON è
                             # zero: margine richiesto esplicitamente)
SDD_FEE_MAX_PCT              # optional — tetto in % della rata (default 1.5)
SDD_LEAD_DAYS                # optional — anticipo addebito sulla scadenza
                             # (default 7: SEPA regola in ~5 giorni lavorativi)
REVIEW_URL                   # the REAL Google review link (g.page/r/…) used
                             # by the journey's T+3 and exit emails; falls
                             # back to a Google search for the profile

# Lo Smistatore (api/documents/_smista.js + scan-inbox)
DOC_MAIL_FROM                # optional — extra TRUSTED senders whose email
                             # attachments get auto-filed (comma-separated,
                             # e.g. "commercialista@studiorossi.it"). The
                             # operator's own addresses are always trusted.
VIEWINGS_CALENDAR_EMAIL      # optional — where viewing calendar invites are
                             # sent (defaults to GMAIL_USER)
BUSY_ICS_URLS                # optional — ICS address(es) of the operator's
                             # REAL calendar (Google Workspace: Calendar →
                             # Settings → your calendar → Integrate calendar),
                             # comma-separated. Busy events remove slots from
                             # the public booking grid. Fail-open: an
                             # unreachable calendar never blocks bookings.
                             # NOTA: l'indirizzo SEGRETO non compare quando
                             # l'admin Workspace ha disattivato la condivisione
                             # esterna (Admin console → App → Google Workspace
                             # → Calendar → Impostazioni di condivisione). In
                             # quel caso o si riabilita, oppure si usa
                             # l'indirizzo PUBBLICO di un calendario condiviso
                             # in modalità "solo disponibilità" — dropBoomEchoes
                             # copre gli UID anonimizzati di quella modalità
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
unavailable — and that template now humanises the feature codes (it used to
join the raw DB keys, publishing "washing_machine, double_glazing" on the
listing page and inside `/llms-listings.txt`, i.e. straight to crawlers).

**Sweep** — `GET ?mode=sweep[&limit=N]` (cron 03:35 UTC, auth like the other
wizard crons: Bearer `CRON_SECRET`, `X-Homie-Secret`, or an admin ID token).
A listing page with no text is invisible to search and uncitable by AI answer
engines, which reward specific facts over filler. On 2026-07-28 the live
catalog had **10 empty descriptions and 10 carrying the bot's template**; the
sweep rewrites them nightly (6/run, time-boxed, ordered available-and-mute
first). **It never rewrites a human's words**: length is the wrong test — the
real catalog's human copy runs 66–203 chars while the template reaches 203, so
a "too short" rule would delete *"perfect for Luiss students"* and keep
*"Features include ac, balcony"*. Only EMPTY text and the template's own
signature qualify (`isBoilerplate` / `copyGap` / `copyOrder`, exported +
tested), and anything overwritten is preserved in `descriptionOriginal`.

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
✅ Conferma button and applies on tap.

**Il bot chiama questo endpoint per ULTIMO, non per primo** (wizard v3.1).
Ogni messaggio libero pagava un `claude-sonnet-5` con TUTTO il catalogo nel
prompt (~1.500 token di input a messaggio) — compresi "affittato Cavour" e
"quanto costa Pigneto?", che una regex risolve per zero; il parser locale
esisteva ma era solo il paracadute per quando l'endpoint era giù. Ora il
router in `_nl_process` è: **domanda** → risposta letta dal catalogo (prezzo,
deposito, interessati, video, foto, giorni sul mercato, indirizzo, stato,
"quali sono liberi") → **modifica piana** → regex (anche arredamento, mq,
camere, bagni, piano, date IT→ISO, commissione, più modifiche in una frase) →
**tutto il resto** sale qui, dove il modello serve davvero (refusi nei nomi,
case nuove dettate a voce, anafore). Nessuna capacità persa; su una giornata
tipo **85% dei messaggi costa zero**, e `/status` mostra lo split a runtime.
Due guardie, entrambe trovate dai test prima della produzione: una DOMANDA
non diventa mai una scrittura ("Levico è affittato?" contiene "affittato" e
avrebbe marcato l'immobile affittato per una domanda) e una CASA NUOVA non
diventa mai una modifica ("trilocale a Prati, 80mq" agganciava un
*Trilocale* esistente e gli riscriveva i metri).
Test: `python3 tests/wizard/local_brain.py`.

### GET/POST `/api/wizard/video-radar` (cron Monday 07:00 UTC)
Weekly LISTING QUALITY radar ("pagella"). Grades every AVAILABLE listing
0-10 (video 3, ≥8 photos 2, rich description 2, availableDate 1,
depositMonths 1, concordato known 1 — `gradeListing()` exported) and
messages the admin chat with each incomplete listing's score, gaps and the
bot command for the biggest one. Silent when the catalog is all 10/10.
Auth like `/api/wizard/health`.

### POST `/api/wizard/transcribe`
Voice-note transcription for the wizard bot (operator dictates a listing).
Auth `X-Wizard-Secret`. Body `{ base64, mimeType? }` (Telegram ogg/opus,
≤4MB) → `{ ok, text }` via OpenAI Whisper when `OPENAI_API_KEY` is set;
501 `transcribe_unconfigured` otherwise (the bot tells the operator voice
isn't set up — never a silent failure).

### POST `/api/wizard/upload`
Photo-upload bridge for the Telegram wizard bot. Auth via `X-Wizard-Secret`
(same secret as `/api/wizard/publish`). Body `{ base64, path?, contentType? }`
(base64 may be a data: URI). Uploads to Firebase Storage under admin
credentials (forced under the `listings/` prefix) and returns
`{ ok, url, path }`. Lets the bot store photos without holding Firebase admin
creds; the bot falls back to a direct Storage upload if this is unavailable.

### GET/POST `/api/leads/scan-inbox` (cron */10 min)
Server-side ear on the portals: reads the Gmail mailbox over IMAP for
Immobiliare/Idealista/Casa.it/Subito REQUEST emails ("hai ricevuto una
richiesta" — saved-search alerts stay with pfs/scan-inbox), extracts the
prospect via Claude haiku (never invents), matches the listing against the
real catalog, dedupes per email-message (memory doc `heartbeat/leads-inbox-memory`) AND per person
(same email/phone in 7 days — so Homie's Mac-side ingestion never
duplicates), and writes the same `leads` schema as `/api/homie/inbound`.
Heartbeat `pfsRadarHealth/leads-inbox`. Auth like the PFS crons; `?dry=1`.
Downstream: `api/telegram/notify-pending` (every minute) now ALSO pings
brand-new leads instantly — context card + one-tap "Apri WhatsApp" (wa.me)
when there's a phone — while the Commerciale's AI reply draft follows via
the usual approval card.

### Lingua delle risposte (`api/_lang.js`)
`replyLang(src)` decides IT vs EN from what the person ACTUALLY wrote
(Italian function words + accents vs English markers), falling back to an
explicit `language` flag and finally to **English** — BOOM's house language.
Used by the Telegram lead card's pre-filled WhatsApp message, the
Commerciale's drafts and its follow-up template. Fixes the bug where
`leads/scan-inbox` stored `language:'it'` by default, so every pre-filled
reply came out in Italian even for an English-speaking expat; the scanner now
stores `null` when the language is unknown.

### GET/POST `/api/leads/brain` (cron */10 min, offset :03)
IL LEAD BRAIN — server-side replacement for Homie's per-lead Sonnet grading
(~2k tok/lead + ~10k/day AI-blocking injections). Stage 0: free rules
(injection/newsletter regex → dead+archived, property-rented lookup,
deterministic score from phone/email/message depth/expat-EN/employment/
budget/move-in signals; confident highs and lows graded without AI — only
the ambiguous middle band proceeds). Stage 1: ONE batched haiku call per
run (≤20 leads/call, `stage0()` exported+tested, hard daily cap 12 calls in
`heartbeat/lead-brain-budget`). Never auto-archives a reachable human (unlike
Homie's score<45 rule): spam dies, thin-but-real stays C. Writes grade/
gradeReason/intent/confidence on the lead; dead → status archived (the
Commerciale never spends tokens on them). notify-pending shows 🔥A/🟢B/🟡C,
sorts A first, never pings dead. Heartbeat `teamHealth/lead-brain` (/team).

### GET `/api/feed/immobiliare.xml?k=<feedKey>[&gz=1][&core=1]`
Il catalogo BOOM nel formato feed di Immobiliare.it (specifiche raccolte in
`docs/feed-immobiliare.md` — la doc del portale tecnico è pubblica ma il
sandbox non raggiunge il dominio). Modello PULL: l'endpoint emette sempre il
feed fresco (`?gz=1` → `feed.xml.gz` pronto per l'FTP batch); a consegnarlo
è il Mac di Homie (Immobiliare vuole gli IP pubblici dei chiamanti e Vercel
non ne ha di fissi). Regole implementate: identità unique-id+email agenzia,
`date-updated` ISO (se la loro data è ≥ non aggiornano), transaction R/EUR,
ISTAT Roma 058091, e la precisione dei pin NON si spaccia (`map="exact"` e
indirizzo visibile solo su via+civico verificati da boom-geo). I nodi in
attesa dell'XSD completo (superficie, locali, descrizioni) stanno nel blocco
EXTENDED, escludibile con `?core=1`. `feedKey` derivato da HOMIE_SECRET.
Env: `FEED_AGENCY_EMAIL` (username agenzia sul portale). Attivazione: team
Support tecnico Immobiliare (FTP batch o credenziali REST + X-IMMO-SOURCE).
Test: `node tests/feed/run.mjs`.

### Il Pubblicista (`api/publisher/*` + `bot/PUBBLICISTA.md`)
Il binario di pubblicazione verso i portali INDIPENDENTE dalle loro
risposte: il feed Immobiliare è pronto ma l'attivazione dipende da un
Support che non risponde, e Idealista apre il real-time solo ai software
partner (Miogest/Gestim — nessuna spec pubblica; verificato 2026-08). Il
server pensa, il Mac di Homie esegue attraverso QUALUNQUE porta sia aperta:
- `api/publisher/_state.js` — motore puro esportato+testato. UNA funzione
  (`coreContent`) alimenta sia `publishHash` sia il payload, quindi hash e
  contenuto non possono divergere; i campi volatili non toccano l'hash e
  l'ordine foto sì (la prima è la copertina). `worklist(listings, pubs)`:
  **remove → create → update** (una casa affittata online genera lead da
  rifiutare: si toglie PRIMA di aggiungere), fallimenti ripetuti
  (3× sullo stesso hash) PARCHEGGIATI invece che ritentati a vuoto — e
  l'edit dell'operatore (hash nuovo) li sblocca da solo. `payloadFor`:
  feature umanizzate IT/EN (mai `washing_machine` grezzo — la lezione del
  template wizard), `showExactAddress` da boom-geo (il toggle del pannello
  segue la precisione VERA del pin), hints per portale (immobiliare:
  typologyId+ISTAT+`xmlNodePath` del nodo REST; idealista: vocabolario),
  MAI un campo inventato. `publishable` importata dal feed: vetrina, feed
  e Pubblicista non possono divergere.
- `GET/POST /api/publisher/queue` — auth come i cron PFS. GET `?portal=`
  → worklist con payload completi (kill switch `settings/publisher`,
  globale e per portale). POST rapporto → stato su
  `portalPubs/<portale>_<listingId>` (admin-only in firestore.rules — la
  lezione propertyLocks), l'hash registrato è quello ECHOED dall'azione
  (se l'operatore edita mentre il Mac lavora, il diff se ne accorge al
  giro dopo), heartbeat `pfsRadarHealth/publisher-<portale>` con la regola
  degli occhi di Homie: giro a vuoto = salute, `blocked:true` (login/
  captcha) = guasto → allerta Telegram esistente dopo 3 run. Recap
  Telegram solo quando qualcosa è cambiato davvero.
- **Le due porte** (`bot/PUBBLICISTA.md`, il mandato completo): Porta A =
  feed/REST quando il Support attiva (batch `?gz=1` via FTP, oppure PUT
  del nodo singolo `?id=<listingId>` sul feed — aggiunto apposta); Porta
  B = OGGI, Playwright sul Mac contro i pannelli agenzia PROPRI
  (Immobiliare/Getrix, Idealista pro) con profilo persistente: è
  l'automazione del proprio back office, la stessa cosa che fa un
  gestionale. Regole d'oro: mai inventare, ritmo umano, captcha/2FA =
  STOP e rapporto `blocked` (mai aggirare), ogni esito riferito.
  Cambiare porta = cambiare SOLO il trasporto: coda, stato e diff restano.
- **Il braccio sul Mac** (`bot/boom_publisher.py` + `com.boom.publisher.plist`):
  `--login` (una volta, profilo persistente), `--dry`, `--check` (launchd
  30′ → notifica macOS quando c'è lavoro; mai un browser senza operatore),
  `--assist` (la sessione di OGGI: campi pronti dal payload, l'operatore
  compila e conferma con l'URL pubblico → rapporto automatico),
  `--auto` riservato ai selettori mappati (oggi ricade su assist).
  Logica pura testata: `python3 tests/publisher/runner.py`.
  PREREQUISITO: rules con `portalPubs` deployate (FIREBASE_TOKEN o deploy
  manuale) — senza, il POST del rapporto non registra lo stato.
- Test: `node tests/publisher/run.mjs` (33 check — hash, worklist,
  parcheggio, payload onesto, verdetto, e il loop VERO GET→POST→GET su
  Firestore in memoria con lo stub PATCH che rifiuta `exists=false` sui
  doc esistenti, come il Firestore vero).

### Il ciclo visita (`/api/viewings/*` + `book.html` + Wallet pass)
A BOOM viewing behaves like a FLIGHT: confirmed → boarding pass + calendar,
then the system speaks at the crucial moments, then asks how it went. Two
modes, one pipeline: `mode:'person'` (address + one-tap directions +
geofenced Wallet pass) or `mode:'video'` (instant browser room, no app, no
account — `videoRoom()` derives an unguessable stable Jitsi URL from the
viewing id + server secret).
- `api/viewings/_lib.js` — pure helpers shared by every surface: video room,
  Google-Calendar URL, `.ics` (with a 3h VALARM), `primaryAction()` (join
  the call / open Maps), Rome-time formatting, pass URL.
- `api/viewings/_email.js` — the email family in the pre-agreement design
  system (black masthead, gold BOOM, one primary action): confirmation
  (ticket card + action + Google/Apple calendar + Wallet), the three
  reminders, the after-visit question (3 WhatsApp one-tap answers:
  interested / thinking / not the one), reschedule + cancel. IT/EN.
- `api/viewings/_moments.js` — THE COUNTDOWN, inside `reminder-cron` every
  run (not hourly — a 30-minute warning is worthless an hour late):
  **T-24h / T-3h / T-30m**, then **T+2h** "how did it go?" (also flips the
  viewing to `completed`). Each fires once (flags on the doc) inside a
  tolerant window; a missed run never skips, a double run never doubles.
  Also sends the confirmation **path-independently**: whoever set
  `status:'confirmed'` (this API, the portal's Viewings page, a hand edit),
  the client gets the kit exactly once (`confirmationSent`).
- `POST /api/viewings/confirm` — the operator's one move (admin/homie/cron
  auth): `{id, action:'confirm'|'reschedule'|'cancel', when, mode,
  durationMinutes, meetingPoint}`. Enriches from the listing, mints the
  video room, emails the client, pushes the Wallet pass. A reschedule
  re-opens the countdown (reminder flags reset).
- `GET /api/viewings/ics?id=` — public calendar file for Apple/Outlook.
- `GET /api/viewings/pass?id=` — the client's boarding pass, served for real:
  loads the LIVE viewing (address, coords, time, video room), signs it and
  streams `application/vnd.apple.pkpass`. `&meta=1` returns JSON for the
  delivery page's mockup. Replaces the old pass-delivery path, which POSTed
  hand-assembled URL params to `/api/generate-pass` (so the pass carried
  nothing) and then navigated to a `blob:` URL — which iOS Safari does not
  reliably hand to Wallet. pass-delivery.html now navigates to this URL for
  viewings, and its broken `<img>` logo (a file absent from the repo) is an
  inline SVG that cannot 404.
- **The operator's calendar fills itself** (`_ical.js` + `_invite.js`): every
  booking is emailed to `VIEWINGS_CALENDAR_EMAIL` (default `GMAIL_USER`) as a
  genuine iCalendar invitation — Gmail/Apple Mail/Outlook add it on their own,
  no OAuth, no API project, nothing to expire. Stable `UID` + growing
  `SEQUENCE` means a reschedule UPDATES that same event in place and
  `METHOD:CANCEL` deletes it; the client rides as ATTENDEE, video viewings
  carry `X-GOOGLE-CONFERENCE` so Google shows a join button, and two VALARMs
  (‑3h, ‑30m) ring on the operator's own devices. Wired into all three paths
  (self-booking, confirm/reschedule/cancel, path-independent confirmation).
- `GET /api/viewings/feed?key=` — **subscribe once, done forever**: a live
  calendar feed (`feedKey()` derived from `HOMIE_SECRET`, rotate to revoke) of
  every viewing from ‑30d to +120d, `REFRESH-INTERVAL:PT15M`. Google Calendar
  → "From URL", Apple Calendar → "New Calendar Subscription". Belt and
  braces with the invites: if a mail is ever missed, the feed still has it.
- Wallet: `buildViewingPass` gained `mode`/`videoUrl` — a video pass shows
  "VIDEO", leads with a **Entra nella call →** link and drops the geofence
  (a room has no address); an in-person pass keeps address, Maps link and
  the lock-screen trigger near the building. `_passkit.loadPassData` now
  reads `listings` before `properties` (book.html writes `listingId`) —
  previously book-created passes shipped with no address and no coords.
- `GET|POST /api/viewings/slots` — **real availability, instant
  confirmation** (the multinational leap: no more "propose a time and
  wait"). GET publishes bookable slots from `settings/viewingAvailability`
  (weekly Rome-time windows, per-mode duration person 45' / video 20',
  minimum notice, horizon, max/day) minus every live viewing plus a 15'
  gap. POST re-verifies the slot server-side (the grid can be seconds
  stale → 409 `slot_taken`), writes the viewing as **confirmed** — the
  slots ARE the operator's declared availability, so nothing is left to
  approve — mints the video room and sends the confirmation immediately
  (waiting for the cron would break the promise). Honeypot + email
  validation. `buildSlots()` exported and unit-tested.
- `book.html` — step 3 is now a real picker: **in person or video call**
  (video first-class, most clients are still abroad), day rail + time
  grid of genuinely free slots, "⚡ Instant confirmation", Rome time with
  the visitor's local offset. The confirmed screen leads with the one
  thing they'll tap on the day (directions / join call), then Wallet and
  calendar. No polling, no pending limbo.
- `api/viewings/_avail.js` — **the availability engine, one copy**. The
  public grid, the client's reschedule page and the operator's Telegram
  picker all read it, so they can never disagree about what's free.
  `loadConfig` / `busyBlocks(cfg, exceptId)` / `buildSlots` / `slotOffered`,
  plus the Rome-time helpers (offsets derived from `Intl`, no tz library).
  `exceptId` is what makes a reschedule possible at all — without it a
  viewing blocks itself and can never move by 30 minutes. Unit-tested
  (`node tests/viewings/avail.mjs`): step math, the 15' gap, notice,
  horizon, max/day, and the DST boundary.
- `api/viewings/_busyics.js` — **il calendario Workspace dentro la griglia**
  (la risposta a "non posso avere disponibilità istantanea costante su tutti
  gli appartamenti"): legge gli indirizzi ICS segreti (`BUSY_ICS_URLS` env
  e/o `busyIcs` sul doc `settings/viewingAvailability`) e ogni impegno REALE
  dell'operatore diventa un blocco per `busyBlocks()` — book.html, la pagina
  self-service del cliente e il picker Telegram smettono INSIEME di offrire
  quello slot. Bloccare l'instant booking per un pomeriggio = trascinare un
  evento in Google Calendar, nessuna UI BOOM. TRANSPARENT ("libero") e
  CANCELLED non bloccano; gli eventi BOOM stessi (UID
  `boom-viewing-*`/`viewing-*@boomrome.com` — inviti, .ics cliente, feed)
  sono filtrati, altrimenti la copia in calendario di una visita bloccherebbe
  il SUO stesso reschedule; **se il feed anonimizza gli UID** (calendario
  condiviso in modalità "solo disponibilità" — quello che resta quando
  l'admin Workspace disattiva la condivisione esterna dei dettagli, e in cui
  l'indirizzo *segreto* non compare affatto) subentra `dropBoomEchoes()`:
  un blocco esterno che inizia E finisce entro 2' da una visita viva è
  l'eco di quella visita, non un impegno diverso — scartarlo è sicuro anche
  se la stima sbaglia, perché la visita stessa è già nella lista occupati;
  ricorrenze espanse nell'orizzonte (DAILY/WEEKLY
  con BYDAY/INTERVAL/COUNT/UNTIL/EXDATE, istanze spostate via RECURRENCE-ID,
  MONTHLY/YEARLY semplici — l'esotico contribuisce solo la prima istanza);
  gli impegni esterni NON consumano `maxPerDay` (sono tempo occupato, non
  visite); fetch con cache 2' + stale 6h e SEMPRE fail-open: un calendario
  irraggiungibile non spegne mai le prenotazioni. È integrazione senza
  credenziali OAuth: l'URL segreto È la credenziale (rotarlo da Google lo
  revoca). Test: `node tests/viewings/busyics.mjs`.
- **`GET|POST /api/viewings/calendar-check` + `/calendario` sul bot** — il
  prezzo del fail-open è che il silenzio è ambiguo ("nessuno slot tolto" =
  collegato e libero, oppure non collegato?). Questa è la risposta esplicita:
  legge il calendario ADESSO (bypassa la cache), dice quante sorgenti, se
  rispondono, quanti eventi ha letto, quanti **occupano tempo** e quali sono
  i prossimi. Non mostra MAI l'URL (è la credenziale). **Trappola vera,
  incontrata in produzione**: gli eventi creati in automatico da Gmail
  (`eventType:FROM_GMAIL` — voli, hotel, conferme) nascono `TRANSPARENT`
  cioè "Libero", quindi NON bloccano; il verdetto lo dice esplicitamente
  invece di far concludere che l'integrazione è rotta. Per bloccare uno
  slot l'evento va segnato **"Impegnato"** in Google Calendar.
  **Nota Workspace**: se l'admin del dominio tiene "Opzioni di condivisione
  esterna per i calendari principali" su *"Solo informazioni sulla
  disponibilità"* o su *nessuna condivisione*, l'indirizzo **segreto** non
  compare affatto nel pannello del calendario — va portato a "Condividi
  tutte le informazioni" (è un permesso, non pubblica nulla), oppure si usa
  l'indirizzo pubblico in modalità disponibilità (lì entra in gioco
  `dropBoomEchoes`, perché quel feed anonimizza gli UID).
- **Annullamento admin dal portal**: la riga visita ha ✕ Cancel anche sulle
  CONFERMATE (le instant self-booked nascono confermate — prima il bottone
  esisteva solo sulle pending) e passa da `/api/viewings/confirm` →
  `_apply.js`: email di annullamento al cliente, METHOD:CANCEL che toglie
  l'evento dal calendario, Wallet pass aggiornato, countdown spento. Prima
  il portal scriveva solo `status:'cancelled'` su Firestore: il cliente non
  veniva avvisato e si presentava al portone. Aggiunti anche ↩ Reschedule
  sulle confermate, il filtro ✕ Cancelled, e i modal ora mostrano/prefillano
  l'orario reale anche per i doc self-booked (che hanno solo i campi ISO).
- **Il double confirm** (`requireApproval`, default **true** in
  `_avail.js` DEFAULTS + toggle nel modal ⚙️ Disponibilità): l'instant
  booking confermava da solo, ma una visita è un impegno su un immobile
  vero e l'operatore vuole filtrare chi entra. Ora il cliente sceglie
  comunque uno slot REALE (nessun ping-pong di date) e **quell'orario resta
  tenuto per lui** — `busyBlocks` conta già le pending — ma la visita nasce
  `status:'pending'`: niente campi `confirmed*`, niente pass, niente invito
  in calendario, niente countdown. Parte solo `sendRequested()` ("l'orario è
  tenuto, ti confermiamo entro poche ore"), e la card con ✅ Conferma arriva
  su Telegram da `notify-pending` entro un minuto; alla conferma il kit
  completo parte da `_apply.js`/`_moments.js` come sempre. La GET di
  `/api/viewings/slots` espone `requireApproval` e **book.html cambia le
  parole** (via `applyApprovalCopy()`: niente "⚡ Instant confirmation", il
  bottone diventa "Request this viewing", e la schermata *"Request sent"* —
  che esisteva già ed era irraggiungibile — diventa la sua strada). Test:
  il ramo è asserito sulla SORGENTE (`tests/viewings/availability-ui.mjs`):
  l'uscita anticipata deve precedere `sendConfirmation` e `inviteOperator`,
  perché un pass per una visita non confermata è una bugia al cliente e un
  evento fantasma nell'agenda dell'operatore.
- **⚙️ Disponibilità nel portal** (`js/viewing-availability.js`, UMD come
  boom-geo/canone-engine → `window.BOOM_AVAIL`, caricato da portal.html):
  fino al 2026-07 le finestre di prenotazione erano i **default hardcoded**
  di `_avail.js` (lun-ven 10-13 e 15-19, sab 10-13) — nessuna pagina le
  mostrava e **nessuna le poteva cambiare**: l'operatore poteva solo
  TOGLIERE tempo dal calendario, mai ridefinire l'orario di lavoro. Il
  bottone sulla pagina Viewings apre il modal che scrive
  `settings/viewingAvailability` (finestre per giorno in ora di Roma,
  durate persona/video, preavviso, orizzonte, max/giorno) con anteprima
  live di quante visite entrano davvero a settimana. **La divisione dei
  ruoli**: la REGOLA sta qui, le ECCEZIONI del singolo giorno restano un
  evento "Impegnato" in Google Calendar. `buildConfig` **rifiuta** un
  valore impossibile invece di aggiustarlo (una finestra scritta male non
  dà errore: dà una griglia vuota, e lo scopre il cliente). I default
  della console sono asseriti UGUALI a quelli del server nei test —
  divergere significherebbe far modificare all'operatore una regola che
  non è in vigore.
- **L'avviso quando forzi un orario** (`checkSlot`): dal portal Confirm e
  Reschedule accettano QUALSIASI data/ora (sei l'operatore, a volte devi
  forzare) — ma prima nessuno diceva che stavi sovrapponendo due clienti.
  Ora i modal mostrano in tempo reale ⚠️ sovrapposizione (col nome del
  cliente e l'ora), ℹ️ fuori finestra / giorno chiuso / passato, oppure
  ✓ libero. **Avverte, non blocca.** Test: `node tests/viewings/availability-ui.mjs`.
- **La geometria della giornata** (`travelGapMinutes` in `_avail.js`): il
  gap tra due impegni non è più un 15' piatto — Roma non è un punto. Visite
  IN PERSONA sullo stesso immobile si INCATENANO (gap 0: tre clienti, un
  viaggio — il grid offre lo slot adiacente); tra immobili geocodificati il
  gap è il viaggio vero (haversine + euristica Roma ~8'+3,2'/km, clamp
  15–45'); video = 15' piatto (nessun viaggio); tutto ciò che non si conosce
  (doc legacy senza coordinate, blocchi ICS esterni) = 15' identico a prima.
  Il contesto (l'immobile che si sta prenotando) arriva da book.html (che
  già mandava `listingId`), dalla pagina self-service del cliente e dal
  picker Telegram; `slots.js`/`_apply.js` stampano `lat`/`lng` sul doc
  visita alla creazione/conferma così `busyBlocks` non fa letture extra.
  Test: `node tests/viewings/gap.mjs`.

### Il Regista (`api/regista/*` — cron 05:30 UTC + Telegram)
Il quarto membro de La Squadra: dirige la GIORNATA dell'operatore.
- **Il Foglio di Chiamata** (`_brief.js`, deterministico — un call sheet
  deve essere GIUSTO, non eloquente: zero AI): ogni mattina alle 07:30 su
  Telegram la timeline delle visite di oggi coi viaggi reali tra una e
  l'altra (stessa euristica della griglia — foglio e grid non possono
  divergere), cosa è successo stanotte (prenotazioni self-service,
  spostamenti del cliente), le richieste da confermare → /visite, i task di
  oggi con bottoni ✓ Fatta / ⏰ +1g, e domani in una riga. Silenzioso a
  giornata vuota; `/giornata` lo manda on demand (anche vuoto).
- **La memoria task** (`_tasks.js`, collection `operatorTasks` admin-only in
  firestore.rules): l'operatore scrive al bot in linguaggio naturale
  ("ricordami di comprare le lampadine per Pigneto domani alle 15") →
  `parseTaskText`, parser REGEX a grammatica chiusa (mai un'allucinazione:
  oggi/stasera/domattina/domani/dopodomani/giorni della settimana — con
  lookaround espliciti, `\b` è cieco dopo "giovedì" — /task, DD/MM, "5
  settembre", "il 15", orari IT/EN am/pm; grammatica pinnata nei test).
  `/task` lista gli aperti. **Un task CON orario diventa un VERO evento nel
  calendario del telefono** (invito iCal UID `boom-task-<id>`, SEQUENCE
  crescente): ✓ Fatta → METHOD:CANCEL e l'evento sparisce da solo, ⏰ +1g →
  l'evento si sposta. `_busyics.js` filtra `boom-task-*` così un task non
  mangia mai uno slot prenotabile via round-trip ICS.
- **Task automatici** (nel run del cron, id deterministici
  `task_prep_<giorno>_<immobile>` / `task_esito_<viewingId>` — un rerun non
  duplica MAI, la data sta in testa all'id così la troncatura non la taglia):
  🔑 preparazione chiavi/accesso per ogni immobile con visite in persona
  oggi (l'orario della prima visita nel titolo; se le visite vengono
  annullate il prep task si auto-VOIDa), 📋 "esito visita" per ogni visita
  completata ieri — il follow-up che decide il fatturato, messo dove
  l'operatore lo vede.
- Heartbeat `teamHealth/regista` (card 🎬 in `/team`), alert Telegram dopo 3
  run falliti, `?dry=1` per l'anteprima. Callback `tkd:`/`tks:` ≤64 byte per
  costruzione. Test: `node tests/regista/run.mjs`.
- `api/viewings/_apply.js` — **the ONE place a viewing changes state**.
  Four surfaces confirm/move/cancel (the operator's API, their Telegram
  buttons, the client's own page, the portal); the side-effects — email,
  Wallet push, calendar invite in place, reminder-flag reset — live here
  once, so they cannot drift. `confirm.js` is now a thin auth wrapper.
- **The client owns their appointment** — `POST /api/viewings/manage` +
  `viewing.html` (`/viewing?t=<ref>`). No login: the link IS the
  credential (`manageToken` in `_lib.js` is *derived*, not stored, so
  every viewing ever created already has a valid one, no migration;
  rotating `HOMIE_SECRET` revokes them all). Ops: `lookup` (ticket +
  free slots), `slots` (the other mode's grid), `reschedule` (re-verified
  server-side → 409 `slot_taken`), `cancel` (allowed right up to the
  start). Every change runs through `_apply.js` **and pings the operator's
  Telegram immediately** — a client rescheduling themselves is never a
  silent surprise. The page is English-first with IT toggle, shows Rome
  time next to the visitor's own clock, and carries the day-of action,
  Wallet and .ics. Linked from the confirmation email, the T-24h reminder,
  the reschedule email and `book.html`'s confirmed screen.
- **Telegram: the agenda in your pocket** (`api/telegram/_viewings.js`).
  Every viewing request pings the admin chat (via `notify-pending`, every
  minute) as a card with the three moves — **✅ Conferma <l'orario
  proposto>** (one tap, no typing), **🔁 Sposta** (a real slot picker:
  day rail → times, mode switch person⇄video, re-verified before writing),
  **✖️ Annulla** (two steps, because it emails the client). Self-booked
  viewings arrive as a notification with Sposta/Annulla. `/visite [giorni]`
  prints the week grouped by day and re-sends an actionable card for
  anything still open. Callback data is capped at 64 bytes by Telegram —
  the encoding (`vok/vmv/vdy/vtm/vmo/vxq/vxx/vbk`, mode as one char, time
  as base36 epoch-minutes) is asserted in `node tests/viewings/telegram.mjs`
  along with HTML escaping, since one oversized button silently kills the
  whole keyboard.

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

### BOOM La Réunion (`/reunion` + `api/reunion-lead.js` + `api/_market.js`)
Il secondo mercato. Landing **francese** (toggle EN, `?lang=en`) che serve TRE
pubblici — propriétaires, locataires e **acheteurs** — con un selettore che
riscrive metà pagina senza ricaricare (`body[data-aud]`, CSS puro: si
NASCONDONO gli altri due, mai `display:revert`, che trasformerebbe un `.frow`
in blocco e romperebbe il form). Il francese **non** si deduce da
`navigator.language`: servire inglese sotto una canonical dichiarata `fr`
significa darlo anche al crawler. `?role=owner|tenant|buyer` apre già dal lato
giusto (per condividere un link mirato).
- **Il terzo binario (acquisto)** è l'unico dove la parte più preziosa è anche
  la più regolamentata: in Francia ricerca per conto dell'acquirente e
  trattativa sono **transaction** e richiedono la **carte T** (più severa
  della carte G della gestione). Quindi la pagina vende ciò che è davvero
  erogabile oggi — andare a VEDERE il bene che il cliente ha già trovato,
  visita video in diretta, compte rendu scritto, lettura di diagnostics e
  documenti di condominio — e la ricerca/negoziazione resta dentro `lg-*`,
  che compare solo cambiando `data-legal`. `budgetKind:'purchase'` distingue
  il budget d'acquisto dal canone: stampare "320 000 €/mese" sarebbe la
  prova, mandata al cliente, che nessuno ha capito la sua richiesta.
- `POST /api/reunion-lead` — pubblico, stesso irrigidimento di `canone-lead`
  (honeypot, rate limit per IP, campi clippati) e **stesso schema `leads`**:
  il lead sale nella macchina esistente (Lead Brain → notify-pending →
  Commerciale) senza costruire nulla di nuovo. `leadType` landlord|tenant è
  l'unica cosa che l'operatore legge prima di rispondere, quindi viene fissato
  alla porta E ripetuto in testa al riassunto (`PROPRIÉTAIRE —` / `LOCATAIRE —`).
  Marca `market:'reunion'`.
- **`api/_market.js` — la macchina romana tace invece di sbagliare.** Tutta
  l'automazione BOOM è tarata su Roma: il messaggio WhatsApp precompilato di
  `notify-pending` è firmato "BOOM Roma" e linka `/apartments`, il Commerciale
  scrive la prima risposta con un SYSTEM prompt che descrive il mercato romano
  e rilancia con "stai ancora cercando casa a Roma?". Senza guardia, il primo
  proprietario di Saint-Pierre riceve **una mail in inglese che gli propone una
  casa a Roma**. `isReunion()` (market | sourceRef | intent) è letta da
  `notify-pending` (card 🇷🇪 + messaggio già scritto **in francese** via
  `reunionReplyText`, mai una firma inventata) e da `commerciale.js`, che
  **esce prima di redigere**: un'automazione che sbaglia mercato è peggio di
  nessuna automazione, perché l'operatore ci mette la firma sotto.
- **L'interruttore loi Hoguet** (`<body data-legal="pending|card|partner">`):
  in Francia gestione locativa e transazione richiedono carta professionale +
  garanzia finanziaria. Finché lo status non è deciso la pagina **non rivendica
  nulla** e lo dice (che è vero, ed è coerente con il resto della pagina);
  quando la carta o il partner esistono si cambia UN attributo e compaiono le
  frasi giuste — FAQ e mentions légales insieme, invece di una caccia alle
  formulazioni nel file. I campi `[NUMÉRO]`/`[SIREN]`/`[PARTENAIRE]` vanno
  riempiti PRIMA di cambiare l'attributo.
- **Essere trovati e essere CITATI** (il giro SEO/GEO): immagine social
  dedicata `og-reunion.png` **generata dal repo** (card HTML → screenshot
  headless → crop PNG senza dipendenze, `tests/` ne asserisce i 1200×630 —
  prima la pagina condivideva su WhatsApp la card di Roma); title 51 car. e
  description 155; **quattro blocchi JSON-LD** (Organization, Breadcrumb,
  FAQPage, `@graph` con WebPage+speakable e i **tre Service** con
  `audience`/`areaServed`/`url` del proprio volet — è ciò che permette a un
  motore di rispondere "sì, anche per un acquirente"); il blocco **« en bref »**
  scritto per essere citato (fatti a plat, compresa la riga che dice cosa NON
  facciamo — una fonte che dichiara i propri limiti è una fonte che si cita);
  `llms.txt` con la sezione del secondo mercato, i tre `?role=` e la nota
  Hoguet, così un'AI non promette per noi più di quanto facciamo.
  **Invariante testata**: ogni domanda nel FAQPage deve esistere come
  `<summary>` VISIBILE (markup che afferma ciò che la pagina non mostra è
  contenuto nascosto: Google lo sanziona e un motore cita una frase
  introvabile), e i selettori `speakable` devono puntare a nodi reali.
- Test: `node tests/reunion/run.mjs` (117 check) — la porta (honeypot, rifiuti
  che non scrivono mai un lead a metà, limite per IP), il lato che non si perde
  mai, la lingua che non ricade sull'italiano, **il lead romano che non diventa
  réunionnais** (la regressione più cara: risposte in francese ai clienti di
  Roma) e le due guardie asserite sulla SORGENTE, perché conta l'ORDINE — la
  guardia deve stare prima della chiamata che spende e spedisce. Più il terzo
  binario: gli alias del ruolo, il budget d'acquisto che non diventa MAI un
  canone mensile, e la riserva carte T scritta invece che sottintesa.

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
  feeVatPct/feeDue(move-in|signing|separate)/dueAtSigning/
  **installmentMonths(1|2|3|6|12)** = rent cadence, monthly…annual) → creates
  `preAgreements` doc with 32-hex token → `{ ok, id, token, url }`.
  All money derivations server-side via exported `deriveMoney()` (monthly
  total with energy credit, deposit split at-signing/at-move-in, fee as %
  of annual OR months of rent, endDate month-end clamp). The admin console
  mirrors the same math client-side for edit-in-place.
- `POST /api/preagreement/lookup` — public `{ token }` → sanitized doc
  (incl. `tenants[]`); audit-logs views; 410 when revoked. Exports
  `paExpired()`: optional `validUntil` (YYYY-MM-DD, Rome calendar day)
  gates NEW acceptances only — lookup exposes `expired`, the page renders
  a branded "offer expired" view (WhatsApp refresh CTA), submit returns
  410 `expired`; accepted/paid deals are never touched, and the console's
  ✎ Edit extends the SAME link (row shows "⌛ OFFERTA SCADUTA").
- `POST /api/preagreement/submit` — public. Tenant self-fills identity
  (name/dob/birthplace/nationality/address/CF/ID/email/phone) + optional
  co-tenants (`tenants[]`, ≤6, each typed name = signature, joint & several
  liability clause auto-added) + consent → status `accepted`, quotable ref
  `BOOM-<base36>`, and when `money.dueAtSigning>0` returns a Stripe Checkout
  URL (acceptance is never voided by a failed checkout).
- `POST /api/preagreement/convert` — admin/owner/landlord. One tap from the
  console: accepted/paid PA → `contracts` doc (identity/lease/money carried
  over, tenant `users` profile bootstrapped by email match, Magic-Sign
  tokens minted, `signingOrder:'sequential'`). By DEFAULT the OWNER signs
  directly — the landlord-side link is shared with them from the console
  (WhatsApp one-tap when `landlord.phone` is set). `delegate:true` is the
  per-deal OPTION: records `landlordDelegate`, the link stays with the
  ADMIN who countersigns per delega after the tenant signs (sign.html
  shows "signing as X on behalf of Y"; magic-sign submit stamps
  `landlordSignedByDelegate`). The choice is echoed on `pa.delegated`.
  Idempotent via `pa.contractId`.
- `POST /api/preagreement/upload` — public, PA-token-scoped. The Verify
  step's ID/passport upload: base64 (client downscales photos to ~1800px
  JPEG) → Firebase Storage `preagreements/<paId>/…` under ADMIN creds
  (admin-only per storage.rules; tokenized URL kept on `pa.uploads[]`,
  never returned to the public page). Convert copies these onto the
  contract (`identityDocs`) + tenant user profile. `kind:'extra'` marks
  the optional SECOND requested document (`pa.extraDoc`, set from the
  console — e.g. proof of the transitional need): its own Verify slot,
  NEVER blocking, uploadable even after acceptance from the accepted page
  ("One more document" card until it arrives; lookup exposes
  `extraDoc`/`extraDocCount`).
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
- `pre-agreement-admin.html` — the console, rebuilt as a command deck
  (BoomPortal auth, Italian UI, brand gold #D4AF37, real BOOM mark).
  KPI strip (in corso / da chiudere / incassato € / contratti), tabs
  Nuovo⇄Deals, search + status filter chips with live counts. Form in
  numbered sections: immobile & proprietario (incl. owner email/WhatsApp
  for the sign link), lease, money (live riepilogo card), clausole,
  **documenti richiesti** (extraDoc with one-tap presets: esigenza
  transitoria / CF / buste paga), cliente. Rows: colored status edge, ONE
  gold primary action (🖊 Magic Sign / → Contratto), owner-sign WhatsApp
  share (non-delega + phone), extra-doc state (⏳ in attesa / ✓), uploads
  links, **Edit terms** (patches the SAME doc/token — the client's
  existing link shows the new terms, status back to `sent`; only for
  sent/viewed/revoked), Duplicate, Revoke/Reactivate. Convert modal:
  delegate checkbox OFF by default (owner signs directly).
- `api/preagreement/_notify.js` — one email design system for the whole
  suite: black masthead + gold BOOM wordmark, white paper card, document
  with gold N°/PAID chips and a gold "due at signing" band, gold primary
  CTA + quiet black secondary, Wallet badge.
  `sendPaEmails({event:'paid'|'accepted', notifyClient})`: client gets the
  document + Stripe receipt link + PDF attached; admin
  (valentino@boom-rome.com) gets a copy + next-step nudge + one-tap
  client-WhatsApp button. `sendContractSignEmail` adapts the landlord
  block: delega → the admin's countersign link; otherwise → "Firma
  proprietario" + WhatsApp-to-owner button when `landlord.phone` exists.
  Gmail/Nodemailer.
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

### Il bonifico gratuito + la commissione misurata (`api/payments/_ref.js`)
La carta costa a Stripe l'1,5% se europea e il **3,25% se extra-SEE** — e
l'inquilino BOOM è un expat. Una commissione fissa al 2,5% quindi guadagnava
sugli europei e **perdeva su ogni carta estera** (−€26,50 su un canone da
3.500). Due mosse:

- **Il bonifico, a zero.** In `/casa`, accanto al bottone carta: beneficiario,
  IBAN e **causale col codice della rata**, ognuno con copia. Costa zero a
  entrambi e la riconciliazione la fa già `/banca`. Compare SOLO se hai
  impostato `settings/payout` (`{iban, beneficiary}`) — mai un IBAN inventato.
- **`payRef(paymentId)`** → `BOOM-XXXXXX`, derivato (sha256, alfabeto senza
  I/O/0/1), quindi ogni rata esistente ne ha già uno: nessuna migrazione.
  `reconcile()` guadagna una **via esatta** prima delle euristiche: il
  movimento dice quale rata paga. Codice giusto + importo diverso (acconto,
  errore) → suggerimento, MAI un "pagato" falso.
  La funzione è duplicata in `/casa` (`payRefLocal`, crypto.subtle) perché la
  pagina deve mostrare la causale: `tests/bonifico/parity.mjs` gira quella del
  browser in un browser vero e la confronta col server — se divergono, il
  cliente copia una causale che nessuno riconosce.
- **La commissione si misura, non si indovina.** Il webhook salva su ogni rata
  il costo reale (`balance_transaction.fee`), il paese e il brand della carta,
  e alimenta `settings/rentFeeStats`. `rentFee(amount, stats)` = costo medio
  osservato + `RENT_FEE_BUFFER` (default **0 → si va a pari**), con tetto
  `RENT_FEE_MAX_PCT` (4) e forzatura `RENT_FEE_PCT`. Sotto 8 incassi usa il
  **caso peggiore** (3,3% + €0,30): partire sotto costo è il difetto che
  questa formula elimina. `/casa` mostra quel seed come **massimo**, così
  l'addebito reale può solo essere più basso.

### Il canone automatico SEPA (`api/payments/_sdd.js` + `sdd-setup.js` + webhook)
Il cerchio dei soldi chiuso: l'inquilino autorizza UNA volta e ogni rata
parte da sola. Capability `sepa_debit_payments` attivata sull'account
Stripe (Dashboard → Pagamenti → configurazione Default, 2026-08-05).
- **Mandato**: card in `/casa` → `POST /api/payments/sdd-setup` (Bearer
  tenant/admin; un tenant solo sul PROPRIO contratto) → Stripe Checkout
  `mode:'setup'` con `sepa_debit` — l'IBAN non tocca mai i server BOOM. Il
  webhook (`SDD_SETUP`) salva `contract.sdd` {customerId, paymentMethodId,
  mandateRef, ibanLast4, activatedAt} — via `fsPatch` di homie/_lib, NON il
  `patchDoc` locale del webhook che appiattisce le mappe a String(v) (e la
  RILETTURA con `fsGet`, non col `readDoc` locale che le appiattisce a
  null — due trappole vere trovate dai test). Il customer si persiste già
  alla creazione della sessione (riuso sui retry). `action:'cancel'` spegne
  e stacca il payment method.
- **Collector** (`collectSdd()` da reminder-cron, finestra oraria): rate
  `pending` dei contratti con mandato attivo, addebitate `SDD_LEAD_DAYS`
  (7) prima della scadenza — SEPA regola in ~5gg lavorativi, così i soldi
  arrivano intorno alla scadenza. UN addebito per rata PER COSTRUZIONE:
  idempotency key Stripe `sdd_<paymentId>` + guardia `sddPiId` sul doc.
  Solo canone (mai il saldo deposito), mai rate scadute PRIMA del mandato,
  un PI rifiutato scrive `sddInitError` e NON si ritenta da solo (un retry
  SEPA su fondi insufficienti brucia commissioni), Telegram avvisato.
- **Esiti** (webhook, `payment_intent.succeeded`/`payment_failed` filtrati
  su `metadata.service==='RENT_SDD'` — i PI delle Checkout carta passano
  oltre): succeeded → rata `paid · paidVia:'sepa'`, ricevuta EN al cliente,
  costo reale in `settings/sddFeeStats`; già pagata per altra via → MAI
  sovrascritta, allarme doppio incasso (stessa disciplina della carta);
  failed → `sddStatus:'failed'`, la rata RESTA pending e torna pagabile a
  mano, email "paga con carta o bonifico" + Telegram alta priorità.
- **La commissione col margine BOOM**: `sddFee()` = costo medio misurato
  PER ADDEBITO (il costo SEPA è flat, non proporzionale — media diversa da
  quella della carta) + `SDD_FEE_BUFFER` default **€1.50** (qui il margine
  di default NON è zero: richiesto esplicitamente), tetto
  `SDD_FEE_MAX_PCT` 1.5%, seed €0.50. Default ≈ €2/addebito contro ~€30
  di carta su un canone da 900 — l'argomento di vendita è il prezzo.
- **/casa**: terza corsia accanto a carta e bonifico — card 🏦 attiva/
  disattiva (IBAN ••••last4), banner "si sta incassando da sola" che
  SOSTITUISCE bottone carta e bonifico mentre l'addebito è in volo (due
  vie aperte insieme = invito al doppio pagamento), nota rossa se
  l'addebito è fallito, band `?sdd=ok` al ritorno da Stripe.
- Test: `node tests/sdd/run.mjs` (38 check — fee, eligibilità, collector
  idempotente, webhook setup/succeeded/failed/double, endpoint auth).

### Il lucchetto sull'immobile (`api/preagreement/_lock.js`)
Due candidati potevano accettare, pagare e generare **due contratti** sullo
stesso appartamento: `submit.js` controllava solo che *quella* proposta non
fosse già accettata. Ora un documento di lucchetto **per ogni mese** della
locazione, id deterministico, creato con `fsCreate(...,docId)` → Firestore
risponde 409 su documento esistente, quindi è un compare-and-set atomico e non
un "leggi poi scrivi". Un doc per mese perché due proposte sullo stesso
immobile per **periodi disgiunti sono legittime**: la sovrapposizione si
rileva da sé. Chiave a scaletta `propertyId → listingId → indirizzo
normalizzato`. Il secondo candidato **non viene respinto**: la proposta
diventa `status:'reserve'`, niente pagamento né contratto, ping Telegram
all'operatore, e la pagina dice la verità. Il lucchetto lo prende
l'accettazione ma **scade in 48h** se il dovuto non arriva (`confirmLock` dal
webhook lo rende definitivo). Spazzino `sweepLocks()` in `reminder-cron`
(oraria) perché la console revoca client-side e il lucchetto resterebbe
appeso. **`firestore.rules`: `propertyLocks` è admin-only — senza quella riga
cadeva nel default-deny e il lucchetto non funzionava affatto.**

### Rent cadence (mensile · bimestrale · trimestrale · semestrale · annuale)
`money.installmentMonths` (1|2|3|6|12) + derived `installmentAmount`
(= `chargedMonthly` × cadence) travel the whole chain. **`billEnergyCredit`**
(default true) decides whether the energy allowance is COLLECTED with the
rent (`chargedMonthly` = monthlyTotal) or settled apart against the real
bills (`chargedMonthly` = rent) — the console switch, the document clause,
the PDF, the email and the generated instalments all follow it:
console selector with live instalment preview → client document, PDF and
email ("Rent instalment · paid quarterly in advance") → `contracts.
installmentMonths/installmentAmount` (canone.installments stays the MONTH
count: portal.html validates monthly×installments===total and would
"auto-fix" it destructively) → the schedule generator.
**The schedule (api/magic-sign/submit.js step (e) and the portal's
`generateMonthlyPayments`, kept in sync) counts LEASE months, not calendar
months**: a lease starting on the 10th is billed in full from day one, the
due date never falls before the period starts, month-ends are clamped, the
last period is prorated to what the lease actually has left, and both
paths write the same deterministic id `pay_<contractId>_<YYYY-MM>` (plus
`coversTo`, `installmentMonths`) so they can never duplicate a schedule.
Legacy contracts with no cadence field behave exactly as before.

### GET/POST `/api/payments/recover-checkouts` (cron ogni 4h) — IL RECUPERO
I quasi-clienti di Stripe. Legge le checkout session SCADUTE degli ultimi 14
giorni: **PFS/SERVICE/RESERVE** (form completo, arrivati al pagamento, mai
pagato) → lead `strec_<sessione>` in `leads` (status `new`, source
`stripe-recovery`) e da lì la macchina ESISTENTE fa tutto da sola (Lead
Brain → notify-pending con bottone WhatsApp → Commerciale);
**PREAGREEMENT/DEPOSIT/RENT** scaduti → recap Telegram (il cliente è già
nel pipeline: ha accettato e non ha pagato, serve l'operatore, non un lead
doppio). Mai un falso positivo: email dell'operatore filtrate (i suoi
test), chi ha RIPROVATO e pagato viene saltato (check sessioni complete
per email), chi è già in `leads` viene saltato, id deterministico → un
rerun non duplica mai. La lingua del lead viene SOLO dalle parole verbatim
del cliente (mai dal riassunto italiano per l'operatore). Heartbeat
`teamHealth/recupero` (card ♻️ in `/team`). Auth come i cron PFS; `?dry=1`.
Test: `node tests/recovery/run.mjs`.

**`api/stripe-webhook.js` — soldi che tornano indietro, mai in silenzio**:
oltre a `checkout.session.completed` ora gestisce `charge.refunded`,
`charge.dispute.created` (alert Telegram ad alta priorità con la SCADENZA
per le prove — una dispute non risposta è persa) e `charge.dispute.closed`
(esito). Idempotente sui retry via `agentNotifications/stripe-<eventId>`.
I 4 eventi sono abilitati sull'endpoint live (`we_1TOvpx…`).

### One-tap buy from an email — `GET /api/services/buy`
`?kind=&e=&n=&ref=` → creates the Stripe session from the shared catalog
(`api/_catalog.js`, imported by both this and `service-checkout.js`; it
holds no Stripe client so a missing key can't crash the module) and 302s
into Checkout. Only `EMAIL_BUYABLE` kinds (movein-pack, cleaning-premium)
are sellable from a bare link — the others need their page's context. A
malformed `e` is dropped rather than shadowing what the buyer types on
Stripe (the webhook now prefers `session.customer_details.email`). The
journey emails carry it as the gold button with a WhatsApp line underneath,
and skip the pitch entirely for a product already bought (`leads` lookup,
one query per run).

### Tenant lifecycle — La tua casa BOOM + Canone via BOOM + journey + Fascicolo ARPE
- **`tenant.html` (served at `/casa`)** — REBUILT on real data (the old page
  was a stub with hardcoded payments). BoomPortal auth (role tenant), reads
  own `contracts`/`payments`/`maintenance` + property client-side (allowed
  by firestore.rules). **Casa 2.0: ENGLISH-FIRST** (the BOOM tenant is an
  expat) with IT toggle persisted (`STR` dict + `t()`). Sections: hero
  tiles, next payment (one-tap card pay), storico + ricevute, documenti,
  **Manuale della Casa** (renders `properties.manual`: Wi-Fi with copy
  button, heating, waste days, appliances, access, emergency, rules),
  **Quartiere** (`properties.neighborhood[]` with Maps links),
  manutenzione, Concierge (€149/€119/su misura — WhatsApp-first),
  **Welcome to Rome Kit** card (share), **referral con codice personale**
  (`BOOM-<uid6>`, navigator.share). Linked from Wallet passes + journey.
- **`welcome-to-rome.html` (`/welcome-to-rome`)** — public English expat
  survival guide (codice fiscale, home without horror stories, residency,
  tessera sanitaria, SIM, bank, ATAC) with BOOM tips + CTA + share bar.
  THE viral asset: indexed, og-tagged, made to be forwarded.
- **`manuale.html` (`/manuale`)** — admin editor of the home manual:
  property picker (✓ when filled), Wi-Fi/heating/trash/appliances/access/
  emergency/rules + neighborhood lines (`emoji · nome · nota`), saves to
  `properties.{manual,neighborhood}` client-side (admin rules).
- **`POST /api/payments/pay`** — Bearer ID token (tenant/admin). Body
  `{paymentId}`; a tenant can only pay their own docs. Stripe Checkout with
  TWO line items: the installment + "Commissione servizio BOOM"
  (`rentFee()` exported: RENT_FEE_PCT% of amount, min RENT_FEE_MIN — card
  costs ~1.5%+€0.25 so the default 2.5%/€9 keeps real margin at any rent).
  `service:'RENT'` metadata → webhook branch marks the payment
  `paid/paidVia:'stripe'/paidDate/receiptUrl/serviceFeeEur` (idempotent on
  stripeSessionId), receipt email to tenant + admin heads-up. The bank
  reconciliation path is untouched (a stripe-paid doc is no longer pending
  so batch matching skips it).
- **Saldo deposito** — `convert.js` now also creates
  `payments/depbal_<contractId>` (`type:'deposit-balance'`, due on
  startDate) whenever the PA split the deposit — payable from /casa,
  reminded by the journey's T-7 email.
- **`api/journey/_run.js`** (from reminder-cron, hourly window, once per
  step per contract via `contracts.journey.<step>` flags): T-30 welcome +
  Move-in Pack · T-14 documents/utilities nudge · T-7 Cleaning Premium +
  deposit balance · T-1 keys (INCLUDED, never sold) · T+3 review ask
  (REVIEW_URL) + casa intro · T-90 before end = renewal CONFIRMATION ONLY
  (no upsell; admin notified) · end+3 = thank-you + review + referral.
  Upsells are WhatsApp-first (prefilled wa.me), emails use the shared
  design system (`_notify.js` exports shell/btn/btn2/para/fine).
- **Fascicolo ARPE** — property dossier slots (visura/planimetria/APE/
  delega) uploaded once per property via `POST /api/properties/dossier`
  (admin; Storage `property-docs/<propId>/`, admin-only per storage.rules
  — REMEMBER `npx firebase-tools deploy --only storage`) and stored on
  `properties.dossier.<slot>`. Console rows with a contract get
  **📦 Fascicolo ARPE**: traffic-light checklist (contratto firmato, scheda
  2/B da generare, documenti conduttore, esigenza transitoria, 4 slot
  immobile con upload) + client-side ZIP (JSZip CDN) with INDICE.txt —
  ready to forward to ARPE for registrazione + asseverazione.

### Co-firma multi-conduttore (coTenants[])
Due o più conduttori firmano DAVVERO, ciascuno col proprio link. Token
DERIVATI (`cosignToken` in `api/magic-sign/_shared.js`:
sha256("cosign:<contractId>:<idx>:<HOMIE_SECRET>"), ref
`<contractId>.c<idx>.<token>` nello stesso `?sign=`): niente da coniare
né migrare — ogni contratto con `coTenants[]` ha già i suoi link;
ruotare il secret revoca tutto. lookup rende il co-conduttore come
tenant (prefill dalla SUA identità sul contratto; il ruolo vero si
rideriva dal token al submit); la firma vive DENTRO `coTenants[idx]`
(riscrittura dal dato fresco, protetta dalla precondizione updateTime);
`tenantSideComplete()` = principale + TUTTI i co-conduttori, ed è la
condizione che sblocca la controfirma del locatore (sequenziale) e il
"Tocca a Lei". send-link lato tenant invita anche i co-conduttori;
certificato FES e pagina firme mostrano i loro blocchi (fino a 2 in
pagina, hash del documento include le loro firme). Sorgenti dei
coTenants: conversione PA (tenants[] della proposta) e Deal Link con
`cofirma:true` (i conviventi del payload diventano co-firmatari, clausola
di co-intestazione automatica). Test: notify 60→68.

### POST `/api/magic-sign/lookup`
Public endpoint for the Magic-Sign UI. Body: `{ token }`. Looks up the
contract by `tenantSignToken` or `landlordSignToken`, returns sanitized
`{role, contract, property, signer, otherParty}`. Replaces the previous
flow which had the browser issue `db.collection('contracts').where(...)`
anonymously — denied by `firestore.rules`.

### POST `/api/magic-sign/submit`
Public endpoint that persists the contract signature on behalf of the
anonymous Magic-Sign user. Body includes the token, signature data URI,
identity payload (incl. `docIssuer`/`docIssueDate`), phone, consent record.
Runs every Firestore write under admin credentials (signature + identity +
landlord profile + RLI deadline + lead closure + property status + listing
sync + payment schedule + tenant user bootstrap). All those mutations are
admin-only per the rules. The user-profile sync writes BOTH users schemas
(sign `cf/dob/…` AND wizard `codiceFiscale/birthDate/…`) so the Allegato
generators and the RLI scheda always see identity collected at signing.

### Il Fascicolo Fiscale (`api/fiscal/fascicolo.js` + `js/canone-engine.js`)
UN PDF, tre pagine, generato DAL CONTRATTO alla firma completa (dentro
`_finalize.js`, best-effort) e rigenerabile dalla console (`POST
{contractId, zonaCod?, parIdx?, mag?, mq…}` — override PERSISTITI su
`contract.canoneScheda`, la rigenerazione è stabile). Storage
`contracts/<id>/fascicolo-fiscale.pdf` → `contract.fascicoloFiscaleUrl`,
linkato nell'email CAF.
1. **SCHEDA PER L'ATTESTAZIONE DI RISPONDENZA** (accordo Roma 25/07/2023 +
   DM 16/01/2017): parti, catasto, superficie convenzionale coi
   coefficienti ufficiali, i 20 parametri ARPE derivati dalle feature REALI
   di immobile/annuncio (mai inventati — la mappatura è dichiarata sul
   documento), maggiorazioni provate (transitorio +10, classe energetica,
   attico; ammobiliato solo se `settings/canoneAccordo.pArr` è calibrato) e
   il VERDETTO: il canone pattuito rientra nella fascia di oscillazione o
   sfora di quanto (mai nascosto).
2. **DATI REGISTRAZIONE RLI** — i quadri da ricopiare sul modello AdE.
3. **SCADENZARIO** del contratto (le deadline a sistema).
`js/canone-engine.js` è il motore PURO condiviso (75 zone dell'accordo con
fasce A/B/C €/mq/mese, soglie subfascia B≥3/C≥7, regola del cap: gli
aumenti non superano il max di fascia, le riduzioni sì; `matchZone` non
tira mai a indovinare — ambiguo → null). Stessa aritmetica di
`scheda-canone.html` (il calcolatore/preventivatore admin). Tutto testo
PDF passa da `wa()` (WinAnsi-safe — la lezione del certificato FES).
**In console**: la PA admin mostra il VERDETTO LIVE mentre scrivi il
canone (✓ in fascia / ⚠ fuori, col max asseverabile — serve una property
con mq selezionata) e la ⚙ calibra `settings/canoneAccordo` (pArr
ammobiliato, pDur 3+2) — UN doc letto da console E Fascicolo. Nel portal
ogni riga contratto ha **📑 Fascicolo** (genera/apre il PDF; se zona o mq
mancano li chiede e li persiste su `contract.canoneScheda`) e **✓ RLI
registrato** (stampa `rliRegisteredAt`, chiude la scadenza "Registrare
RLI", rigenera il fascicolo — il loop registrazione si chiude in un tap).

### Journey consapevole (contesto nel `_run.js`)
`steps()` riceve `missing`, `late` e `walletUrl`: il T-14 chiede PER NOME
ciò che manca (link `/scheda` derivato — anagrafica e/o foto documento)
invece del generico "se manca qualcosa"; con rate scadute (`late`, una
query payments per run) gli upsell TACCIONO su T-30/T-14/T-7 (non si
vende a chi ha un pagamento aperto) e gli avvisi T-90/uscita
all'operatore segnalano gli arretrati prima di rinnovo/restituzione
deposito. Il **Wallet pass della casa** (`tenantWalletUrl(contractId)` →
`/api/my-pass`, link derivato, pass ricostruito live) viaggia nel welcome
post-firma, nel T-30 e nel T-1 — sempre visibile dentro il journey.
Le visite dal portal (conferma/sposta) ora chiamano
`/api/viewings/confirm` — l'EmailJS browser-side del flusso visite è
stato rimosso: email, pass e inviti iCal partono sempre dal server.
`/scheda?demo=1` (form vuoto con OCR simulato), `?demo=known` (conferma
one-tap), `?demo=landlord` (locatore IT): walkthrough senza API né
contratti veri, come `/sign?demo=1`.

### Portal 2.0 — l'esecuzione dell'audit (2026-08, vedi `PORTAL_AUDIT_2026-08.md`)
Un giro solo, otto interventi, 33 suite verdi:
- **`POST /api/notify/send`** — il ponte email del portal. `sendBoomEmail()`
  (stessa firma, 16 chiamanti intatti) ora POSTa qui con Bearer admin/owner/
  landlord; il server veste il vecchio template "notification" nel design
  system condiviso e spedisce via Nodemailer. **EmailJS browser-side è
  RITIRATO**: SDK rimosso da portal.html e book.html, `emailjs.*` non esiste
  più nel portal. Rate 30/min/uid, escape HTML, time-box 12s.
- **M1 "Portal in tasca"** (blocco in coda a `css/portal.css`): safe-area
  ovunque (PWA standalone), header che non sfora più i 390px, footer modali
  a 2 colonne con target 44px, patch `repeat(5/6/7)` + `.stats-grid
  !important`, input 16px fino a 900px, colonna Azioni delle tabelle STICKY
  a destra, sidebar `100dvh`, scroll-lock modali (`body.modal-open`),
  bottone 🔍 che apre la ricerca globale come overlay (su mobile non
  esisteva affatto), `#boomBridge` largo `min(360px, 100vw-32px)`.
- **Dieta del boot** (portal-app): tetti su TUTTE le query nude (limit
  larghi, MAI orderBy+limit — un orderBy su campo assente nasconderebbe i
  doc legacy), i 7 step lazy in parallelo, rate scadute flippate SOLO in
  memoria (prima: N scritture Firestore a ogni apertura), listener
  contracts admin-only + limit, cache `boom_data_cache` estesa a tutto lo
  stato (badge giusti al boot da cache) con stringify in idle, Chart.js
  caricato solo sulla dashboard.
- **Navigabile**: gruppo "Console" in sidebar (La Squadra, Banca, PFS
  Command, Photo Lab, Manuale Casa, Salute) + Regole & Automazioni in nav.
- **Sicurezza**: `/api/generate-pass` è operator-only (X-Firebase-Token
  admin/owner/landlord o X-Homie-Secret — firmava .pkpass di produzione da
  anonimo; pass-delivery legacy mostra "link expired" invece di 401 nudo);
  `settings/company` (IBAN) escluso dalla lettura pubblica nelle rules;
  `canone-bot` con rate limit + cap sui messaggi; `notify-viewing-created`
  con honeypot + rate limit.
- **CI `deploy-rules`**: push su main → `firebase deploy --only
  firestore:rules,storage` (secret `FIREBASE_TOKEN`; senza secret il job
  avvisa e salta). Nato dal drift che teneva `propertyLocks` spento in
  produzione.
- **Tabella zone canone UNICA**: `scheda-canone.html` ora carica
  `js/canone-engine.js` e semina le zone dal motore (la copia inline che
  poteva divergere dal Fascicolo ARPE è stata rimossa; un edit manuale
  marca `zoneSrc='manual'` e da lì la copia salvata vince).

### Verbale di consegna chiavi (`POST /api/contracts/verbale` + `/verbale`)
Il contratto (Art. 3 di entrambi gli Allegati) rinvia a "quanto risulta dal
verbale di consegna" — questo lo genera davvero, SUL POSTO. `verbale.html`
(`/verbale?c=<contractId>`, admin/owner/landlord via BoomPortal, mobile-first,
no-store+noindex) il giorno delle chiavi: chiavi consegnate (stepper),
letture contatori (POD/PDR + foto opzionali, downscale client 1600px),
stato + note, poi le firme sullo schermo del telefono — conduttore
principale, co-conduttori presenti (checkbox "presente e firma"), operatore.
L'endpoint (Bearer; owner solo sui contratti dei PROPRI immobili) genera il
PDF (pdf-lib, `wa()` WinAnsi-safe, dichiarazione art. 1590 c.c., foto 2 per
riga, firme a 2 colonne), lo carica su `contracts/<id>/verbale-consegna_*.pdf`,
marca `contract.verbaleConsegna` (nomi firmatari, MAI i dataURI), lo archivia
in `documents` con categoria `verbale` (il taxpack la riconosce già → la
checklist commercialista si spunta da sola) e lo invia IN ALLEGATO:
conduttori+co-conduttori (EN), proprietario (IT), admin. Bottone 🔑 sulla
riga contratto del portal (✓ quando esiste). Le letture fanno fede per le
volture. Test: `node tests/verbale/run.mjs`.

### Rendiconto proprietario (`GET/POST /api/owners/rendiconto`, cron 1° del mese 06:10 UTC)
Il 1° del mese ogni proprietario riceve il rendiconto del mese CHIUSO:
per ogni suo immobile i canoni incassati (data + via), le rate del mese
aperte, gli ARRETRATI totali, le manutenzioni del periodo — PDF nel
design BOOM (pdf-lib, `wa()`) su Storage `rendiconti/<ownerId>/` + email
IT nel design system con PDF in allegato. Email risolta users →
landlords → contract.landlordEmail; senza email → segnalato nel recap
Telegram, MAI perso in silenzio; proprietario senza movimenti → salta.
Idempotente per (proprietario, mese) via `rendiconti/<ownerId>_<YYYY-MM>`
(fsCreate 409 → skip; collection admin-only in firestore.rules — la
lezione propertyLocks). `?dry=1`, `?month=YYYY-MM`, `?ownerId=`; auth
come i cron PFS. Heartbeat `teamHealth/rendiconto`.
Test: `node tests/rendiconto/run.mjs`.

### Conservazione (`GET/POST /api/ops/conservazione`, cron il 2 del mese 05:40 UTC)
L'archivio legale FUORI da Firebase, senza nuovi servizi: il 2 del mese i
contratti FINALIZZATI nel mese chiuso vengono raccolti (contratto firmato,
certificato FES, fascicolo fiscale, marca temporale .tsr, pack
registrazione), zippati (`api/_zip.js`, INDICE.txt in testa con l'elenco e
gli eventuali file irraggiungibili) e spediti IN ALLEGATO alla casella
operatore — Gmail è la copia fuori piattaforma. Volumi >20MB spezzati in
più email. Idempotente per mese via `heartbeat/conservazione-<YYYY-MM>`
(collection già admin-only nelle rules deployate — nessuna dipendenza da
un deploy futuro). `?dry=1`, `?month=YYYY-MM`; heartbeat
`teamHealth/conservazione`. Test: `node tests/conservazione/run.mjs`.

### Watchdog firme (reminder-cron)
Due guardie: firme PARZIALI ferme >48h → re-nudge automatico alla
controparte (max 3, cooldown 24h col promemoria manuale); inviti FREDDI
(`signatureStatus none`, invito inviato >72h, nessuna firma) → re-invito
"Reminder —" al conduttore (max 2, `inviteNudgeCount`;
`shouldReinvite()` esportato e testato). Un contratto MAI invitato non
viene toccato: resta una decisione umana.

### Il ciclo email del contratto (`api/sign/_notify.js` + `send-link`)
UN design system per ogni email della piattaforma
(`api/preagreement/_notify.js`: masthead nero col MARCHIO reale — PNG
hosted `android-chrome-192x192.png`, Gmail scarta data-URI e SVG — carta
bianca, pill oro, dark-mode aware; esporta `shell/btn/btn2/para/fine/row/
hero/tiles/timeline/includes/rule`). Lingua del lettore: inquilino EN,
locatore e operatore IT. Tutto server-side (Nodemailer), best-effort e
time-boxed — mai può bloccare una firma.
- `POST /api/sign/send-link` — admin/owner/landlord (Bearer; owner solo
  sui propri immobili). L'INVITO a firmare per QUALSIASI contratto:
  backfilla il token mancante (contratti legacy), invia nel design system,
  stampa `signInvite<Role>At`. Sequenziale: lato locatore su contratto non
  ancora firmato dall'inquilino → 409 `awaiting_tenant` (il suo link parte
  in automatico alla firma dell'inquilino). Sostituisce l'EmailJS
  `sendSignatureEmail` del portal (browser-only, rimosso): saveContract e
  il promemoria firme ora chiamano questo endpoint.
- `notifyPartialSignature` / `notifyAdminContractSigned` (chiamate da
  magic-sign/submit e reminder-cron): conferma al firmatario + "Tocca a
  Lei"/"your turn" alla controparte col suo link; milestone IT all'admin
  (`ADMIN_NOTIFY_EMAIL`, default valentino@boom-rome.com).
- **Il contratto firmato viaggia in ALLEGATO** (`_finalize.js
  buildSignedContract`): alla firma completa il server scarica
  `generatedPDF`, gli APPENDE la pagina delle firme (firme grafiche,
  nomi, data/ora, hash, rinvio al certificato) e salva
  `contracts/<id>/contratto-firmato.pdf` → `contract.signedPdfUrl`.
  Contratti legacy senza PDF sorgente: si salta senza rumore, alle email
  resta il certificato (mai bloccare una firma).
- `sendWelcomeEmails` (da `_finalize.js`): welcome tenant EN (portal
  magic-link, saldo deposito se pendente, timeline utenze/TARI/residenza)
  + landlord IT (passi fiscali per regime, cessione fabbricato se
  extra-UE) — entrambe con **contratto firmato + certificato FES in
  allegato PDF** (link nel corpo come rete di sicurezza; download
  time-boxed, un allegato fallito non ferma mai l'email).
- `sendCafDossier` (da `_finalize.js`, UNA volta — idempotente su
  `finalizedAt`): il fascicolo asseverazione/registrazione con anagrafica
  COMPLETA di entrambe le parti (post-firma lo è per costruzione), catasto,
  termini, link + **3 PDF in allegato (contratto firmato, certificato FES,
  Fascicolo Fiscale) — pronto da inoltrare ad ARPE/CAF così com'è** →
  `CAF_EMAIL` (default **valentino@boom-rome.com**). Prima viveva in
  portal-app.js via EmailJS e partiva SOLO dal vecchio flusso di firma nel
  portal — su /sign non partiva affatto.
- **Pack Registrazione** (`api/sign/_pack.js` + `api/_zip.js` ZIP writer
  STORE senza dipendenze npm): UN file
  `contracts/<id>/pack-registrazione.zip` con TUTTO ciò che servono RLI +
  asseverazione ARPE — contratto firmato, certificato FES, Fascicolo
  Fiscale, visura/planimetria/APE/delega dal dossier immobile
  (`properties.dossier.*`), documenti identità (`contract.identityDocs`,
  il `kind:'extra'` = attestazione esigenza ora sopravvive alla
  conversione PA→contratto), più `00_INDICE.txt` con anagrafica+CF,
  motivazione transitorietà e la CHECKLIST di cosa manca e dove
  caricarlo. Generato alla firma completa (budget rigido 25s dentro
  finalize — mai allunga la firma) e rigenerabile con **📦 Pack** sulla
  riga contratto (`POST /api/fiscal/pack`, admin, maxDuration 60). URL +
  mancanti persistiti (`registrationPackUrl/Missing/At`); l'email CAF
  porta il link ZIP e l'avviso "⚠ Nel pack mancano: …".
- **Journey gate firme** (`journeyEligible()` esportata+testata): un
  contratto invitato alla firma digitale ma non `complete` è nel funnel
  firma, NON nel ciclo casa — niente T-30 di benvenuto a chi non ha
  firmato. I legacy firmati su carta (nessun invito a sistema) restano
  dentro il journey.
- La Scheda completa manda al cliente una conferma one-shot
  (`scheda<Role>ConfirmedAt`) nel suo idioma (`api/profile/submit.js`).
- Due bug di produzione trovati dai test (pdf-lib REALE nella suite):
  il certificato FES falliva SEMPRE (freccia "→" non WinAnsi) e finalize
  leggeva `cedolareSecca === true` mentre i contratti reali portano 'si'
  → obbligazioni del regime sbagliato a scadenzario. Entrambi corretti.

### La Scheda (`/scheda` + `api/profile/*`) — anagrafica universale
"Compila la tua scheda in 2 minuti": ONE link that collects a party's
anagrafica (identity + ID upload) for ANY contract, decoupled from the
signature — the missing piece for clients not onboarded via pre-agreement
(the legacy `form-tenant/form-landlord` pages wrote anonymously to the
admin-only `contractRegistrations` collection and silently failed; the
Share Hub now hands out /scheda links instead). Study: `LA_SCHEDA_STUDY.md`.
- **Derived tokens, zero migration** (`api/profile/_scheda.js`, same
  pattern as the viewings' manageToken): `sha256("scheda:<role>:<id>:
  <HOMIE_SECRET>")` → URL blob `<contractId>.<t|l>.<token>`. Every
  contract ever created — signed ones included — already has a valid
  link; rotating `HOMIE_SECRET` revokes all; role lives INSIDE the
  derivation; a scheda link can never sign.
- `POST /api/profile/lookup` — public `{t}` → role, `locked`, property
  label, prefilled identity merged contract→sign-schema→wizard-schema.
- `POST /api/profile/submit` — public. Writes contract party fields
  (`tenantName/CF/Dob/Pob/Address/DocType/DocNum/DocIssuer/DocIssueDate/
  Nationality/Phone`) + users sync on BOTH schemas + `landlords/` for the
  landlord role. CF checksum-validated when present (optional — fresh
  expats). Re-editable until that party SIGNS, then 410 (identity of a
  signed act is frozen); pings the operator via `agentNotifications`.
- `POST /api/profile/upload` — public. ID document → Storage
  `contracts/<id>/identity/…` under admin creds (URL never returned to the
  page), appended to `contract.identityDocs` + the user profile. With
  `extract:true` the same bytes go through Claude haiku and the response
  carries the identity fields read off the document (**OCR-first UX**: the
  client photographs the ID and the form fills itself; never invents,
  never blocks the upload). Allowed even post-firma (the ID copy for the
  RLI dossier is additive).
- `POST /api/profile/link` — admin/owner/landlord (Bearer): returns the
  two derived /scheda URLs for a contract (the browser can't compute
  them). Owners only for their own property's contracts. Feeds the
  portal's Share Hub cards + `sendMissingInfoLink`.
- `scheda.html` (`/scheda?t=…`, cleanUrls; noindex + no-store in
  vercel.json): sign.html's design shell, EN-first with IT toggle
  (landlord defaults IT), Model-C staging (confirm when known / form when
  not), "⚡ compila con una foto" OCR shortcut, document step skippable,
  read-only view when locked. No Firebase on the page — same-origin API
  only.
- **Deal flow per i clienti legacy**: contratto minimo nel portal →
  Scheda (anagrafica + documento self-service) → 🔄 Rigenera PDF (ora
  completo) → Magic Sign. Per contratti già firmati su carta: solo
  Scheda (upload documento incluso) — nessuna firma fittizia.

### Contratto studenti — template associazione (accordo Roma 27/07/2023)
`_generateContractPDF_allegatoC` (js/portal-app.js) genera il contratto
tipo STUDENTI dell'associazione: accordo territoriale depositato presso il
Comune di Roma Capitale il 27.07.2023 **prot. RA/2023/0044852**, art. 5
comma 2 L.431/98 (fonte: `contratto_tipo_STUDENTI_Roma_2023.doc`, refusi
dell'originale normalizzati — il secondo "Articolo 13" è il 14, come da
clausola 1341/1342). Punti chiave: disdetta 3 mesi (art.1), natura
transitoria con protocollo nuovo (art.2), canone con cadenza rate reale
(`installmentMonths`, art.3), interessi deposito annuali + "altre forme di
garanzia" (art.4), art.6 **biforcato su `cedolareSecca`** (default: testo
cedolare del modello; 'no' → variante registro/bollo), conviventi da
`contract.cohabitants` (art.8), slot opzionali `garanzieAltre`/
`oneriQuota`/`subentroModalita`/`accessiModalita`/`consegnaStato`,
utenze private a carico conduttore nelle Altre clausole (art.16) +
`otherClauses` in coda. Both Allegato generators (B and C) read identity
through the fallback chain contract fields → users sign schema → users
wizard schema — a regenerated PDF never prints dots for data a party
already self-filled on /sign or /scheda.

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

### Link di pagamento Stripe (`/api/payments/link` + `link-for`)
Il portale può incassare QUALSIASI rata o fattura con carta, mandando un
link su WhatsApp. Il link **non è** una Checkout Session (quella scade in 30
minuti, per scelta): è un URL stabile di BOOM che a ogni apertura crea una
sessione fresca e ci reindirizza dentro — si manda oggi e si paga la
settimana prossima. Il token è **derivato** (`_token.js`, HMAC su
`HOMIE_SECRET`), quindi ogni rata e ogni fattura già esistente ha da subito
un link valido senza migrazioni, e ruotando il segreto si revocano tutti.
- `POST /api/payments/link-for` — admin/owner/landlord: `{kind:'pay'|'inv', id}`
  → `{url}`. Il calcolo del token resta server-side (se il segreto arrivasse
  al browser chiunque potrebbe generare link per qualsiasi documento). Un
  landlord ottiene link solo per i propri immobili; le fatture sono admin-only;
  documento inesistente 404, già pagato 409.
- `GET /api/payments/link?k&id&t` — pubblico, nessun login. Casi non-felici
  resi come **pagine HTML** in stile BOOM, mai come JSON (chi apre un link e
  vede `{"error":"not_found"}` pensa a una truffa): già pagato (con link alla
  ricevuta), link non valido, importo anomalo, pagamenti non configurati.
- La **commissione di servizio** si applica solo al canone (è il costo della
  carta, voce a sé come in `payments/pay.js`); su una fattura BOOM no —
  sarebbe farsi pagare due volte lo stesso servizio.
- Ramo webhook **INVOICE**: segna la fattura `paid/paidVia:'stripe'` con
  `receiptUrl`, scrive la notifica operativa e manda le ricevute. Stessa
  disciplina del canone: retry della stessa sessione → `duplicate`; una
  SECONDA sessione su un documento già saldato non sovrascrive mai nulla e
  fa scattare l'allarme **doppio incasso** (`agentNotifications`).
- UI: bottone 💳 sulle righe di Pagamenti e Fatture → pannello con link,
  copia, **WhatsApp col messaggio già scritto** (quando il numero è in
  archivio) e anteprima. `copyToClipboard()` ricade su `execCommand` e poi
  su `prompt()` — su Safari senza contesto sicuro `navigator.clipboard` non
  esiste e il tasto sembrerebbe rotto.
Coperto da `tests/money/run.mjs` (token stabile/non trasferibile fra tipi,
autorizzazioni di `link-for`, incasso fattura, idempotenza, doppio incasso).

### Dati: LA BONIFICA + L'INNESTO (`js/dataops-engine.js` + portal pages)
Two admin-only portal pages that keep the archive honest. All decision logic
lives in the pure, dependency-free `js/dataops-engine.js`
(`window.BOOM_DATAOPS`, 85 unit tests in `tests/dataops/test.mjs`) — it
decides what gets DELETED and what gets CREATED, so it is testable without a
browser or Firestore.
- **🧹 Bonifica** (`goTo('bonifica')`) — finds test data, stale notifications
  and broken references, then deletes ONLY what the operator ticks. Every
  item carries the reason it was flagged, in Italian. `isProtected()` locks
  anything with legal or monetary weight (paid payments, signed/registered
  contracts, documents with a file, admin users): shown, explained, never
  preselected, and skipped by "select all". Preselection is limited to
  severity `alta` + unprotected. Orphan hunting uses an index built ONLY
  from collections actually loaded — a missing key means "I didn't read it"
  and nothing is declared orphan (an empty in-memory array is treated as
  not-loaded, since the portal loads in two waves). Before any delete it
  downloads a JSON backup of exactly what is about to disappear (Firestore
  has no trash), then batches the deletes, prunes `S`, drops the data cache
  and writes an `activityLog` entry. Two-step arm on the button, with the
  cascade (payments of a deleted contract, contracts of a deleted property)
  surfaced BEFORE execution.
- **🌱 Innesto** (`goTo('innesto')`) — paste a contract / an owner's email /
  a WhatsApp message, or drop a PDF or photo, and get a proposal already in
  the portal's exact schema: landlord → property → tenant → contract →
  rent schedule. Each entity says whether it is NEW or matches an existing
  record and why (`findMatch`: same CF / email / IBAN / address / name, also
  reversed word order; below 70 it proposes nothing — a visible duplicate
  beats a contract attached to the wrong person). Real validation before
  anything is written: codice fiscale checksum (omocodia-aware), IBAN
  mod-97, date coherence, canone sanity — errors block, warnings don't. The
  schedule is generated by the SAME `generateMonthlyPayments()` used by
  magic-sign, so the two paths can never duplicate one.

### Dati aziendali (IBAN) fuori dal codice — `settings/company`
`COMPANY` in `portal-app.js` carried `iban: 'IT00X0000000000000000000000'` with
a never-actioned "⚠️ UPDATE WITH REAL IBAN" comment — and that placeholder was
printed in the **late-payment reminder** sent to tenants and in the generated
**invoice PDF**. Company data now lives in Firestore `settings/company`
(admin-write per the existing rules), is merged over the code defaults at boot
by `BOOM_DATAOPS.mergeCompany()` (field whitelist, values cleaned, empty never
overwrites a good default) and is edited from **Impostazioni → Dati aziendali**
— no deploy to change bank, PEC or address. `isPlaceholderIban()` treats
empty / old placeholder / mod-97 failure alike: while it holds, the reminder
**omits** the IBAN and the invoice prints "IBAN: da comunicare" (a wrong IBAN
is worse than none — the payer tries and the transfer never arrives), the
console shows a red card, and admins get a toast at boot. Saving re-validates
the IBAN before writing. `loadCompanySettings()` is fire-and-forget off the
boot path (Safari-audit rule: nothing awaited on boot).

### POST `/api/portal/ingest`
Admin/owner/landlord (Firebase ID token). Body `{ text?, base64?, mediaType?,
context:{ known:{ landlords[], properties[] } } }` → `{ ok, proposal, notes[],
confidence }`. Claude (haiku) extracts the four entities; the prompt forbids
inventing values (an empty field is correct, an invented one ends up in a
registered contract) and the response is field-whitelisted server-side to the
portal's schema. **Writes nothing** — creation happens client-side after the
operator reviews and confirms. `ANTHROPIC_API_KEY` stays server-side.

### POST `/api/homie/wa-outbox`
WhatsApp OUTBOX for the Mac-side Homie agent: approved WhatsApp replies go
out AUTOMATICALLY. Executor marks the action executed (wa.me link kept as
manual fallback); Homie polls `{op:'pull'}` (approved-and-unsent, executed
<48h, max 10/pull), sends via wacli/send_whatsapp.sh, then `{op:'ack',
actionId, ok, error?}` — delivery state lives on the action doc
(`waSentAt`/`waSendError`), nothing sends twice, failures visible. Auth
`X-Homie-Secret`.

### POST `/api/homie/message` — da WhatsApp a lead, senza far pensare nessuno
La CHIAVE DI VOLTA che permette a Homie di smettere di analizzare (mandato
completo + prompt da incollare: `bot/HOMIE.md`). Finché Homie leggeva ogni
messaggio con Sonnet era lui a decidere "questa è una persona che cerca
casa" e a creare il lead; senza quel pensiero, un WhatsApp da un numero
sconosciuto finiva in `conversations` e **basta** — il Lead Brain non lo
vedeva, `notify-pending` non lo mandava, il Commerciale non scriveva nulla
(tutti interrogano `leads`). Il cliente spariva dal telefono e sopravviveva
solo nell'Inbox del portale, che richiede un desktop.
`api/homie/_lead.js` rende la decisione **deterministica e gratis**:
- inbound da un numero che non è già un contatto BOOM → doc `leads` nello
  schema che leggono già `homie/inbound` e `leads/scan-inbox`, e da lì parte
  la macchina esistente (Brain in batch → ping Telegram → Commerciale);
- `isNoise()` scarta SOLO il non-messaggio (un 👍, un "ok") — allo spam pensa
  già `stage0` del Brain, gratis: qui non si giudica se la persona è seria;
- inquilini/proprietari/clienti PFS (risolti per telefono) **non** entrano in
  pipeline: scrivono per la caldaia, non per affittare;
- un lead che esiste si ARRICCHISCE invece di duplicarsi — `mergeMessage()`
  accumula i pezzi di una chat ("ciao" · "cercavo un bilocale" · "per
  settembre"), così `replyLang` vede la lingua vera e il Commerciale scrive
  sul contesto completo, non sul "ciao";
- **`direction:'out'` marca il lead `contacted`**: se l'operatore ha già
  risposto a mano, il Commerciale tace — due voci sulla stessa conversazione
  sono una figura che non si recupera;
- `phoneVariants()` — WhatsApp consegna SEMPRE l'internazionale
  (`+393334444444`), i portali salvano il nazionale (`3334444444`): cercare
  una forma sola sdoppiava la stessa persona in due lead con due risposte
  diverse. Ora la lettura prova tutte le forme e la scrittura normalizza
  ALLA PORTA (`buildLead` + `leads/scan-inbox`), così il problema smette di
  rigenerarsi.
`notify-pending` tratta i lead WhatsApp come **vivi**: niente grazia di 4
minuti per il grade (quella persona sta digitando adesso), header
"💬 ti ha scritto su WhatsApp", e il messaggio precompilato è una RISPOSTA,
non una presentazione — "Grazie per il tuo interesse" sotto il messaggio che
ti ha appena scritto legge come un contatto a freddo.
**`/api/homie/inbound` ora deduplica** (prima faceva `fsCreate` e basta:
andava bene finché Homie era l'unica fonte). Nella finestra in cui Homie
cambia mandato la stessa persona arriva da DUE porte — l'inoltro grezzo
parte all'istante, `inbound` dopo l'analisi, quindi il duplicato lo creava
proprio `inbound`. Deduplicando lì, **qualunque ordine** produce un lead solo
e i due lati non hanno bisogno di essere coordinati: si possono tenere accesi
insieme per giorni.
Test: `node tests/whatsapp/run.mjs` (Firestore finto in memoria, si guida il
handler vero; copre entrambi gli ordini della transizione, verificati per
mutazione).

### GET/POST `/api/leads/match-listing` — LA RICERCA ROVESCIATA
L'asimmetria che nessuno sfruttava: si pubblica un annuncio e si **aspetta**
che degli sconosciuti lo trovino, mentre in archivio ci sono persone che tre
settimane fa cercavano esattamente quello — e a cui non lo dice nessuno. BOOM
faceva marketing al traffico freddo avendo una lista calda. I lead sono un
asset che si raffredda; questo lo riscuote, a **costo zero** (nessun modello,
solo aritmetica su dati già presenti).
**Il trucco**: un lead non ha un modulo compilato, ma ha due segnali migliori
di qualunque form — (1) **la casa che ha chiesto È il suo briefing** (chi
scrive per un trilocale da €1.400 a Pigneto cerca quello: zona, taglia,
fascia ±15%), e (2) **le sue parole** ("bilocale a Trastevere sotto i 1200").
`leadCriteria()` li deriva; `scoreLeadForListing()` punteggia con la stessa
aritmetica di `homie/_match.js` (budget 50 · camere 30 · zona 20) così i due
motori non danno verdetti diversi sulla stessa casa.
**Tre mestieri tenuti separati** — mescolarli era il difetto trovato dai test:
il **veto** decide chi è eleggibile, la **soglia** se la casa gli calza (sul
punteggio BASE), la **freschezza** solo l'ordine. Moltiplicando tutto, un
match perfetto di due mesi fa spariva sotto soglia, indistinguibile da uno
mediocre.
**I veti** (più importanti del punteggio: la casa sbagliata alla persona
sbagliata costa la reputazione, non un'occasione, e parte dal TUO numero):
lead morto · già inquilino · senza recapito · **la casa che aveva già
chiesto** · già avvisato per questa casa (`notifiedListings`) · oltre
`MAX_AGE_DAYS` 120 (a Roma una ricerca di 4 mesi fa è finita) · fuori budget
oltre il 20%. Ogni veto **dice perché**: un'esclusione silenziosa è
indistinguibile da un bug.
Risposta: persone ordinate, col motivo, e **il messaggio già scritto nella
LORO lingua** (`replyLang`) che nomina la casa che avevano chiesto — la
differenza fra "abbiamo una novità" e "ti sei ricordato di me". POST
`{listingId, notify:[ids]}` segna chi hai contattato, altrimenti in due
giorni la funzione da utile diventa fastidiosa.
**Nel bot**: parte **da sola** dopo ogni pubblicazione (proattiva: non si
chiede, si dice quando serve), più `/chicerca <ID>` e la frase naturale "chi
cerca Pigneto?". La parola *interessati* NON è stata riusata — significa già
"chi ha scritto per questa casa" (`/interessati`), e ri-puntare una parola con
un significato consolidato è il modo più rapido per rendere inaffidabile uno
strumento; il confine è pinnato nei test da entrambi i lati.
Auth: `X-Wizard-Secret`/`X-Homie-Secret` (il bot) o Bearer admin.
Test: `node tests/reverse/run.mjs`.

### GET/POST `/api/homie/searches` — gli occhi di Homie sul radar PFS
Il problema sta scritto in `api/pfs/_fetch.js`: *"both portals run anti-bot
protection and may 403 datacenter IPs — the email-alert path is the
LOAD-BEARING source"*. Cioè il radar del servizio che i clienti **pagano**
(Property Finding, €350) scopre un immobile **quando il portale decide di
mandare l'email**, raggruppata e in ritardo — mentre a Roma un buon affitto
da privato raccoglie decine di contatti nelle prime ore. Il server non può
risolverlo per costruzione; il Mac di Homie (IP residenziale, browser vero,
sessioni autenticate) sì. **La pipeline esisteva già tutta**
(`/api/homie/property` → `pfs/_ingest.js`: dedupe → filtro agenzie →
punteggio su ogni cliente → push nel mazzo di swipe): mancava solo che Homie
sapesse COSA guardare.
- **GET** → la lista viva delle ricerche da aprire, da `radarSearches`
  (auto-generata da `pfs/sync-searches` dai criteri reali di ogni cliente
  attivo, quindi niente da hardcodare sul Mac). `urlOverride` batte sempre
  `searchUrl` — è la manopola manuale dell'operatore. `activeSearches()`
  esportata e testata: spente, senza URL o con URL rotto non entrano mai.
- **POST** `{ok, searches, found, ingested, blocked, error?}` → heartbeat
  `pfsRadarHealth/homie-eyes`, quindi l'allerta Telegram esistente (3
  fallimenti consecutivi) copre anche gli occhi di Homie.
- **`runVerdict()` — la regola che tiene in piedi il resto**: un radar
  CIECO non deve mai sembrare un mercato fermo. "Zero risultati" e "il
  portale mi ha sbattuto fuori" arrivano identici; solo il secondo è un
  guasto, e se non lo si distingue il radar muore in silenzio proprio
  mentre il cliente paga per essere il primo. Esportata e testata (anche
  per mutazione), non riscritta nei test.
Cadenza suggerita 10′. I duplicati sono gratis (dedupe `sha1(sourceUrl)`),
quindi il contratto col Mac è "nel dubbio manda". Test:
`node tests/pfs/eyes.mjs`. Mandato completo: `bot/HOMIE.md`.

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
(`api/pfs/_health.js`), recovery notified once.

**BLOCCATA ≠ GUASTA** (`alertDecision()`, esportata + testata). `scan-market`
aveva accumulato **1145 run falliti di fila** e un allarme ogni 6h per ~3
settimane: ~96 messaggi identici per una condizione che non può risolversi da
sola — i portali rifiutano gli IP dei datacenter, è documentato in `_fetch.js`.
Il danno non è il rumore: un promemoria non azionabile **abitua a scartare gli
allarmi del radar**, e il giorno in cui muore `scan-inbox` (la fonte PORTANTE)
quello verrebbe scartato con gli altri. Ora ci sono tre stati, non due:
`ok` · `error` (può risolversi → promemoria che si dirada 6h→24h→72h→settimana,
8 messaggi in 40 giorni invece di ~160) · **`blocked`** (non può funzionare da
qui → UN messaggio, che spiega, dice cosa continua a funzionare e dà la via
d'uscita — gli occhi di Homie — poi silenzio finché lo stato non cambia).
`pfs-command.html` smette di mostrarla rossa e lampeggiante: pallino spento,
"🚫 Bloccata all'origine" e la spiegazione al posto dell'errore urlato.
Test: `node tests/pfs/health.mjs`. Listings that could not be
auto-ingested (e.g. no price recoverable) land in
`pfsRadarHealth.needsAttention` — surfaced in `pfs-command.html`, never
silently dropped.

## Il Perito (market intelligence — js/market-engine.js + api/market/*)

Il "nostro Casafari" col dato che Casafari non ha (i canoni FIRMATI). Nato
dall'obiezione dell'operatore agli alert-only: un alert email racconta le
NASCITE degli annunci, mai le MORTI — e le morti sono metà del valore (un
annuncio sparito con prova = affitto concluso → giorni di assorbimento per
zona). Studio: `STUDIO_BOOM_AUTONOMA.md`. Architettura a ciclo di vita:
- **Nascite/vita**: ogni annuncio visto da QUALSIASI porta (pfs/_ingest tap,
  best-effort e DOPO la scrittura master — il radar non rompe mai il servizio
  pagato) alimenta `marketListings` via `api/market/_ledger.js` →
  `ME.observe()`: fold puro, storia prezzi solo sui cambi, rientri con vite
  archiviate (`pastLives`), MAI contatti del privato (il motore li scarta
  alla porta — GDPR per costruzione, testato per mutazione).
- **Morte**: verifiche attive via il Mac di Homie (`api/homie/market.js` —
  GET lotto secondo le manopole, POST esiti; mandato in `bot/HOMIE.md`).
  **Il verdetto lo dà IL SERVER** (`deathVerdict`): gone SOLO con prova
  (404/410, marker 'unavailable'/'search'); 403/429/timeout/200-ambiguo =
  unknown, MAI gone — un pomeriggio di blocchi non è "mezza Roma affittata".
  Heartbeat `pfsRadarHealth/perito-eyes` (allerta Telegram esistente).
- **Statistiche**: cron `api/market/pulse.js` (05:50 UTC) → un doc
  `marketStats/<zoneSlug>` per zona (il portal legge quello, mai il registro
  intero): mediana/p25/p75 €/mq, assorbimento (mediana giorni, SOLO morti
  provate), ribassi 30gg. **Sotto `minSample` non esce un numero** —
  "campione insufficiente", mai una mediana su 3 annunci. Verdetto esplicito
  su libro vuoto e backlog verifiche (la lezione runVerdict di pfs/eyes).
- Manopole nel registro squadra (deathcheckBatch/enrichBatch/minSample),
  rules `marketListings`+`marketStats` admin-only (lezione propertyLocks).
- Test: `node tests/market/engine.mjs` (18 check; mutazioni: 403→morte,
  contatti→dentro, campione piccolo→pubblica — tutte catturate) e
  `node tests/market/wiring.mjs` (giunzioni sulla sorgente: ordine del tap,
  verdetto solo server, rules, cron).

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
| `/api/employees/commerciale` | every 2h, 06-18 | Lead responder, property-aware: any lead still `new` after a 20-min human window gets a Claude-drafted first reply (same persona as `agent/ai.reply`) proposed for approval; still `new` after 48h (grade A/B or apply/reserve) gets one templated follow-up. Caps per run; dedupe before paying for the AI call. |

All three accept POST with Vercel cron secret, `X-Homie-Secret`, or an admin
Firebase ID token (see `api/pfs/_guard.js`); `?dry=1` computes without
writing/notifying; contabile also accepts `?monthly=1` to force the monthly
close email.

**Console**: `team.html` (`/team`, admin-only, noindex) — status dot + last
run per employee (the PFS radar appears as "Lo Scout" rolling up
`pfsRadarHealth`), pending proposals, latest reports, "Esegui ora" buttons.

### L'ORGANIGRAMMA (`js/squadra-registry.js` + `goTo('squadra')` nel portal)
I tre `api/employees/*` sono la punta: BOOM ha **23 cron** e ~19 processi che
agiscono da soli su dati, clienti e soldi veri. L'unico posto che li elencava
era una lista **scritta a mano** dentro `team.html`, ferma a **8 voci**:
mancavano — fra gli altri — il Selezionatore (archivia lead), il Fotografo
(alle 03:20 riscrive le foto degli annunci), il Copywriter (ne riscrive i
testi), il Rendiconto (il 1° del mese manda un PDF a ogni proprietario) e
l'Archivista (spedisce fuori piattaforma l'archivio legale). Nessuno se n'era
accorto perché **niente la confrontava con la realtà**.
- **La riga che mancava.** Di un dipendente non basta sapere se è vivo (il
  pallino verde): serve sapere **cosa fa da solo**. Letta sul codice la
  risposta è netta — **su ~19 agenti, DUE passano da approvazione umana** (il
  Gestore e il Commerciale, via `proposeAction` → `action_queue`). Journey,
  Segugio, Rendiconto e Contabile **mandano email a inquilini, iscritti e
  proprietari senza che nessuno tocchi niente**. Va benissimo che sia così —
  è il motivo per cui la macchina regge senza personale — ma dev'essere
  scritto, non una scoperta archeologica nel sorgente. Il desk lo mette in
  testa alla pagina: *"scrivono ai tuoi clienti senza chiedertelo"*.
- **La lettera di assunzione.** Ogni agente dichiara `hired` (perché esiste),
  `mandate[]`, e le tre liste che sono il suo contratto: `autonomy.solo` /
  `.porta` / `.mai`. Più `reach[]` — le chiavi che gli abbiamo dato (parla ai
  clienti · scrive a te · archivio · file · soldi · vetrina · AI) — e
  `approval` (`mai|sempre|parziale`). `attentionOf()` non misura
  l'importanza ma **quanto costa caro se sbaglia mentre nessuno guarda**.
- **Non può tornare alla deriva.** `driftVsCrons()` confronta il registro coi
  cron veri di `vercel.json`: un cron non dichiarato (*dipendente fantasma*)
  e un agente che punta a un cron inesistente sono **entrambi errori di CI**.
- **Una copia sola.** La sezione nel portal e `/team` leggono lo STESSO
  registro (stessa disciplina di `_avail.js`): non possono più divergere. La
  voce di menu 🤖 La Squadra era `window.open('/team','_blank')` — una scheda
  nuova — ed è ora una sezione del portale.
- **Si disegna senza Firestore.** Mansioni, autonomia e confini sono
  conoscenza statica: la pagina è intera prima che parta una lettura, e la
  salute arriva dopo in fire-and-forget (regola Safari — mai un await sul
  percorso di render). Il re-render dei pallini **salta se hai un fascicolo
  aperto**, altrimenti te lo richiuderebbe sotto gli occhi.
- **LA DIREZIONE** (`api/_squadra.js` + `settings/squadra`): vedere un
  dipendente e poter premere "esegui ora" non è dirigerlo. Le soglie erano
  costanti nel sorgente — `LATE_AFTER_DAYS = 3` in gestore.js,
  `HUMAN_WINDOW_MS = 20 min` in commerciale.js, `DAILY_AI_CALL_CAP = 12` in
  leads/brain.js — quindi "sollecita dopo 5 giorni invece di 3" voleva dire
  un deploy, cioè in pratica non si cambiava mai. Ora le 10 manopole dei tre
  agenti collegati si girano dal fascicolo; i **default e gli intervalli
  ammessi stanno nel registro**, letto sia dal browser sia dal server
  (`api/_squadra.js` importa `js/squadra-registry.js` — pattern già in uso da
  `compliance-rules`/`canone-engine`), così la console non può mostrare un
  valore diverso da quello in vigore.
  **Due severità di proposito**: alla PORTA `validateKnobs` **rifiuta** un
  valore impossibile invece di aggiustarlo (un valore corretto in silenzio è
  una regola che l'operatore crede di aver messo e non è quella applicata —
  la lezione di `buildConfig`); a RUNTIME `resolveKnobs` non esplode mai —
  torna al default e lo scrive nel report (`rejectedLine`), perché un cron
  che muore per un refuso in un campo è il modo peggiore di scoprirlo.
  Fail-open: Firestore irraggiungibile ⇒ default, gli stessi che vede la
  console.
- **Regola dura: solo manopole collegate.** Un campo che non fa niente è
  peggio di nessun campo — lo giri, non succede nulla, e da lì in poi non ti
  fidi più della pagina. Il test lo rende meccanico: ogni manopola dichiarata
  dev'essere **letta davvero** (`k.<chiave>`) nel sorgente del suo agente, e
  il browser verifica che chi non ha manopole non ne disegni.
- Test: `node tests/squadra/registry.mjs` (anti-deriva, lettera di assunzione,
  manopole non finte, e la **garanzia di non-regressione**: senza impostazioni
  salvate i default sono pinnati ai valori che le costanti avevano, così il
  deploy non cambia comportamento in silenzio su clienti veri — verificato per
  mutazione) e `node tests/squadra/desk.mjs` (monta la sezione in un
  **Chromium vero** con `window.db` inesistente e pretende tutti gli agenti, i
  tre elenchi su ogni scheda, i badge veri e i campi solo dove sono collegati;
  si auto-skippa senza playwright).

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
   to 3 per run, time-boxed — nothing stays raw forever. **Order = impact**
   (`sweepOrder()`, exported + tested): richest galleries first, ties keep the
   document order. `fsList` hands candidates over in document-ID order — pure
   alphabet — and on a one-photo listing the brain has nothing to decide (no
   cover to pick, no gallery to reorder, no duplicate to drop). With 3 slots a
   night that once left a 25-photo listing raw for three nights while three
   single-photo ones took the slots.

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

## Precisione dei pin + perché non c'è il 3D di Google (`js/boom-geo.js`)

**Google Photorealistic 3D Tiles non sono erogabili a questo account.** Dall'8
luglio 2025 i progetti Google Cloud con fatturazione **EEA** sono esclusi da
tile 3D e satellitari: `tile.googleapis.com` risponde `403 PERMISSION_DENIED`
("not available for your account and region"), con **e senza** Referer di
boomrome.com — verificato 2026-07-29. Egidi è italiana: non è una chiave da
sistemare. Il chip "◆ Photoreal 3D" compariva su ogni scheda con pin (la
chiave *esisteva*), scaricava ~3MB di Cesium e falliva **sempre**; lo Skyline
li scaricava a ogni apertura della mappa, anche a chi non toccava nulla.
Rimossi entrambi, insieme a `/api/maps-key`. `js/boom-photoreal.js` e
`tests/photoreal/` restano nel repo non referenziati: se la restrizione cade,
si riarma da lì — **ri-provare quel 403 prima di riesumarlo**.

**La precisione del pin è dedotta, non dichiarata.** Le pagine leggevano
`listing.geoZone`, campo che **nessun annuncio porta** (0 su 19), quindi
`exact = hasCo && !geoZone` era sempre vero: ogni pin si presentava come
indirizzo esatto, il prefisso `≈` non compariva mai e la legenda "≈ zone area"
dello Skyline era decorativa. Tre case del centro dichiaravano lo stesso
centroide (`41.8986, 12.4735` = il centroide `DZONES` di "centro storico") e la
scheda offriva "Street View · the exact entrance" su una via a caso vicino a
Navona. La provenienza però c'era già, in `listing.geo` (`src`, `q`), scritta
dal bake dei geocodici. `pinPrecision()` la legge:

| livello | condizione | cosa è concesso in pagina |
|---|---|---|
| `exact` | `q` con via **e** civico | chip coordinate, "Street View · the exact entrance", **sagoma d'oro** |
| `street` | `q` con via senza civico | "Street View · this street", nessun chip coordinate |
| `zone` | `src:'zone'`, oppure `q` del solo quartiere (`"Prati, Roma"`), oppure coordinate ≤4 decimali senza provenienza | solo "posizione approssimativa in <zona>" + Directions |
| `none` | nessuna lat/lng | nessun chip |

Un CAP a 5 cifre non è un civico. La **sagoma d'oro** si accende solo su
`exact`: su una via senza numero il palazzo sotto il pin è arbitrario, e
illuminarlo come "il tuo" è la stessa bugia in piccolo. `pinCopy()` tiene le
parole in un posto solo così Skyline e scheda non possono contraddirsi;
`pinAudit()` dà il quadro (oggi: 5 exact · 4 street · 7 zone · 3 none).

**Zoom dello Skyline**: con un solo risultato il bounds ha area zero e
`fitBounds` andava diretto a `maxZoom:15.5` — a quel punto, con `pitch:55` e le
etichette POI nascoste di proposito, si vedono i tetti e **tutte le ancore
finiscono fuori quadro**: la mappa si spegne proprio mentre guardi una casa.
Con ≤2 risultati il bounds si allarga fino all'ancora più vicina (Termini,
LUISS, …) e i fili d'oro si accendono da soli dopo 700ms — su una casa sola non
c'è nulla su cui passare col mouse, e su telefono l'hover non esiste.

**Ancora falso**: i tempi mostrati come "door-to-door" sono `km_in_linea_d_aria
× 4.2 + 10`, senza rete né orari (`apartment-detail.html`, `apartments.html`
`_dl()`). Sbagliati a caso — Roma è anisotropa, lungo la metro A voli e in
trasversale no. Da sostituire con tempi precalcolati sul GTFS di Roma Mobilità.

## Conventions

- **Serverless deps live in `api/package.json`** (the manifest the Vercel
  builder actually installs from — root `package.json` alone is NOT enough).
  When a new npm package is imported by any `api/**` file, add it to BOTH
  `api/package.json` and root `package.json` (kept mirrored) and regenerate
  `package-lock.json`. Getting this wrong ships functions without their
  dependencies: every endpoint importing a package 500s at module load
  (`ERR_MODULE_NOT_FOUND`) — this took the whole API down for ~2h on
  2026-07-22. `VERCEL_FORCE_NO_BUILD_CACHE=1` is set in the project env
  (build takes ~20s; a poisoned build cache can never recur).

- All pages are standalone HTML with inline `<style>` and `<script>` blocks — no bundler
- Firebase is loaded via CDN `<script>` tags, initialized per-page
- New pages should follow the dark theme with gold accents pattern
- Property-specific pages follow `apartment_[name].html` naming
- Blog posts follow `blog-[slug].html` naming
- **Tests**: `npm test` runs every suite (`tests/run-all.mjs`); `npm test -- money safari`
  runs a subset. No framework, no emulator — each suite drives the REAL handler
  and stubs only the network (`globalThis.fetch` over an in-memory Firestore) or
  the browser. A suite needing something absent (playwright-core) prints `SKIP:`
  and is reported as skipped, never as a failure.

  | Suite | Copre |
  |---|---|
  | `tests/money/run.mjs` | checkout, webhook Stripe idempotenti, conversione PA→contratto |
  | `tests/fiscal/test.mjs` | motore scadenze fiscali |
  | `tests/fiscal/canone.mjs` | canone concordato: superficie convenzionale (coefficienti e tetti), fascia dai parametri, regola del cap, match zona che non indovina, parametri solo da feature reali, verdetto fits/fuori |
  | `tests/taxpack/test.mjs` | pacchetto commercialista |
  | `tests/journey/steps.mjs` | **le regole commerciali dell'operatore**: quando parte ogni email e cosa NON deve contenere (T-90 e uscita non vendono, le chiavi non si vendono mai, un prodotto già comprato non si ripropone, il rinnovo non arriva prima del move-in su un transitorio breve) |
  | `tests/journey/review-url.mjs` | solo un vero link "scrivi recensione" (`g.page/r/<id>/review`) entra nelle email; un link Maps "Condividi" viene rifiutato con warning |
  | `tests/dossier/run.mjs` | fascicolo ARPE: un landlord non può scrivere nel fascicolo di un immobile altrui, path sotto `property-docs/<id>/`, slot già pieni non sovrascritti |
  | `tests/photos/sweep.mjs` | photo-lab: chi è candidato allo sweep, quali foto contano come sorgente (i nostri output enhanced mai), e l'ordine con cui le 3 notti si spendono — le gallerie vere prima degli annunci da una foto. Si auto-skippa senza `sharp` |
  | `tests/copy/run.mjs` | descrizioni: lo sweep riscrive i template del bot e le schede mute, ma **mai** le parole di un umano — verificato sulle stringhe vere del catalogo, dove il testo scritto a mano è più CORTO del template |
  | `tests/geo/run.mjs` | precisione dei pin (`js/boom-geo.js`): portone (via+civico), strada, quartiere o niente — sulle stringhe `geo.q` vere del catalogo, incluso il caso insidioso `src:'nominatim'` su `q:'Prati, Roma'` |
  | `tests/scheda/run.mjs` | La Scheda: token derivati (ruolo nella derivazione, timing-safe), precedenza prefill contratto→sign→wizard, lock post-firma, sync profilo su ENTRAMBI gli schemi users, upload con OCR che non blocca mai, /api/profile/link autorizzato |
  | `tests/notify/run.mjs` | ciclo email contratto (pdf-lib REALE, nodemailer mockato): fascicolo CAF a valentino@boom-rome.com esattamente una volta con anagrafica di entrambe le parti, welcome nella lingua del lettore, invito firma col link giusto e 409 sul locatore sequenziale, conferma scheda one-shot |
  | `tests/viewings/avail.mjs` | griglia slot: passi, gap 15', preavviso, orizzonte, maxPerDay, DST, token del link cliente |
  | `tests/viewings/telegram.mjs` | card Telegram visite: callback ≤64 byte, escaping HTML |
  | `tests/viewings/busyics.mjs` | il calendario Workspace nella griglia: impegni ICS bloccano gli slot (TZID, ricorrenze, EXDATE, RECURRENCE-ID, all-day busy/free), eventi BOOM filtrati, maxPerDay immune, cache + fail-open |
  | `tests/viewings/availability-ui.mjs` | la regola della disponibilità: parsing delle finestre (rifiuta 19:00-15:00, sovrapposte, "mattina"), default console == default server, anteprima che non promette slot inesistenti, avviso conflitti (sovrapposizione col nome, fuori finestra, giorno chiuso, non con sé stessa) |
  | `tests/viewings/gap.mjs` | la geometria della giornata: stesso immobile a catena (gap 0), viaggi reali tra zone (clamp 15–45'), video piatto, blocchi legacy identici a prima |
  | `tests/regista/run.mjs` | Il Regista: grammatica dei promemoria (IT/EN, accenti, "il 16/08", range che non sono date), id deterministici ≤64B, inviti calendario dei task, foglio di chiamata (escaping, viaggi, catene, giorno vuoto) |
  | `tests/recovery/run.mjs` | Il Recupero: chi diventa lead (PFS/SERVICE/RESERVE) e chi recap (PA/DEPOSIT/RENT), i test dell'operatore mai, id deterministico, lingua dalle parole del cliente |
  | `tests/reverse/run.mjs` | La ricerca rovesciata: legge budget/taglia/zona dalle parole vere e dalla casa richiesta, e soprattutto **chi non va MAI disturbato** — morti, inquilini, chi quella casa l'aveva già chiesta, chi era già stato avvisato, chi la troverebbe fuori budget |
  | `tests/pfs/health.mjs` | Allarmi del radar: una fonte BLOCCATA all'origine parla una volta sola (200 run → 1 messaggio), un guasto vero si dirada invece di gridare ogni 6h (40 giorni → 8 promemoria), i primi due intoppi non svegliano nessuno, e il ritorno si sente sempre |
  | `tests/pfs/eyes.mjs` | Gli occhi di Homie sul radar PFS: nella lista di lavoro non entrano ricerche spente o con URL rotti, la manopola manuale (`urlOverride`) vince sempre, e — la regola che conta — un radar CIECO (403/captcha su tutte le ricerche) non passa mai per un mercato fermo |
  | `tests/whatsapp/run.mjs` | Da WhatsApp a lead senza AI: il rumore resta fuori (👍, "ok") e la persona vera entra, l'inquilino che scrive per la caldaia non inquina la pipeline, un lead per persona anche col numero archiviato in formato diverso (nazionale vs internazionale), una risposta umana zittisce il Commerciale. Guida il handler VERO su un Firestore finto in memoria |
  | `tests/wizard/local_brain.py` | Il cervello gratis del bot wizard (`python3`): cosa capisce senza modello e — più importante — cosa deve rifiutarsi di capire. Una domanda ("Levico è affittato?") non può diventare una scrittura; un annuncio nuovo dettato non può diventare la modifica di uno esistente. Estrae le funzioni pure dal bot via AST: gira senza `.env`, senza Telegram, senza rete |
  | `tests/verbale/run.mjs` | verbale consegna chiavi: il PDF vero (WinAnsi-ostile compreso) viaggia in allegato a conduttori/co-conduttori/proprietario/admin, owner solo sui contratti dei propri immobili (403 = zero scritture), firme richieste per entrambi i lati, sul contratto restano solo i NOMI mai i dataURI |
  | `tests/sign/lang.mjs` | /sign bilingue guidata in un browser vero (demo mode): default per ruolo (locatore IT, inquilino EN), toggle che ridisegna lo step corrente in entrambe le direzioni, percorso intero tradotto, Skip OTP che non blocca, link WhatsApp presenti. Si auto-skippa senza playwright |
  | `tests/safari/boot.mjs` | nessuna superficie autenticata resta appesa su un loader |
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
  { loginUrl: '/login' }            // base only — never bake a ?next= in
);
```

**Safari desktop hardening** (a wedged WebKit used to leave the logged-in
pages on their loader with no signal at all):
- `js/firebase-config.js` — the 12 pages that load it used to call
  `enablePersistence({synchronizeTabs:true})` **synchronously on the boot
  path**. On WebKit that IndexedDB + WebLocks handshake stalls for seconds
  and the auth guard's first read looks hung. Now deferred to an idle
  callback, skipped on iOS, no `synchronizeTabs` on Safari, escape hatch
  `?nopersist=1` / `localStorage.boom_no_persist='1'` — the same treatment
  `js/portal-app.js` already applied to portal.html.
- `BoomPortal.withTimeout(promise, ms)` — a Firestore read that never
  settles is a loader that never leaves. `requireAuth` reads the profile
  under a 7s watchdog, retries `{source:'server'}`, then gives up loudly.
- `BoomPortal.showRecovery()` / `hardReset(signOut)` — instead of an
  eternal spinner: a branded panel with the two moves that actually fix a
  wedged browser (wipe SW caches + registrations + Firestore IndexedDB and
  reload with `?fresh=`, or sign out clean). Query params are preserved.
- `requireAuth` normalizes `loginUrl` (strips `.html` — `cleanUrls` makes
  it a 308 hop — and any pre-baked `?next=`, which used to duplicate the
  param and, on `wrong_role`, bounce straight back to the denied page in a
  loop) and tags the bounce with `?b=1`. `login.html` counts those: twice
  in a minute means the browser is not keeping the session (private mode /
  cookies blocked) and it says so instead of looping forever.
- Realtime lists carry a fallback: a Firestore `onSnapshot` whose channel
  never opens calls **neither** `onData` nor `onError`. `watchPAs()` in
  the console falls back to a one-shot `.get()` after 6s and renders a
  visible error with a recovery button instead of an empty page.
- `BoomPortal.registerServiceWorker()` calls `reg.update()` — Safari does
  not re-check `sw.js` as eagerly as Chrome, so a stale worker could serve
  an old shell for days. Cache version is `boom-v13`. portal.html's inline
  registration does the same.
- `vercel.json` now sends `private, no-store` + `noindex` on every
  logged-in surface (`casa`, `tenant`, `manuale`, `pre-agreement-admin`,
  `pfs-command`, `photo-lab`, `salute`, …), not just the portal group.
- `-webkit-backdrop-filter` is mandatory alongside every `backdrop-filter`
  (older WebKit ignores the unprefixed form and the frosted bars go flat).
- Google-Fonts stylesheets on logged-in pages load **async**
  (`media="print" onload` + `<noscript>` fallback): a synchronous
  stylesheet to fonts.googleapis.com blocks Safari's first paint — the
  spinner included — for the whole cold-connection round trip.
- `sw.js` portal shell fetch is network-first **with a 6s cap**: on a
  wedged Safari connection the fetch used to hang for minutes; now the
  cached copy (from a previous visit or the /login pre-warm) takes over
  while the network response still refreshes the cache in background.
- Login → portal handoff: login.html uses the same Firebase SDK 10.7.0 as
  the portal (HTTP-cache reuse), lands on `/portal` (never `/portal.html`,
  whose cleanUrls 308 also made the SW refuse to cache the pre-warm), and
  the boot never awaits writes (`lastLogin` is fire-and-forget — an
  awaited write on a stalled WebChannel used to hang the whole boot).
- Portal boot is stale-while-revalidate: a same-user `boom_data_cache`
  snapshot up to 24h old renders instantly while `loadDataFresh(true)`
  re-syncs in background (admin core reads run in ONE concurrent batch —
  the old sequential "batch 1/2/3" + 100ms Safari pauses are gone). The
  25s hard watchdog now enters the app shell when user+profile are
  already in hand instead of bouncing an authenticated user to login.

- **La scialuppa scattava sull'indizio sbagliato** (lo spinner infinito che
  l'operatore vedeva su Safari, agosto 2026). La via d'uscita a 15s di
  portal.html usciva subito se `window.__portalAppLoaded` era vero — ma quella
  sentinella è la **RIGA 1** di `portal-app.js`: si accende appena il file è
  parsato, prima che il boot faccia alcunché. Il watchdog interno dell'app
  nasce ~2.300 righe più in là, quindi QUALUNQUE eccezione in mezzo spegneva
  l'unica scialuppa armata e non ne creava nessun'altra: spinner per sempre,
  senza uscita. Che su WebKit quelle eccezioni esistano non è teoria — i log
  di `/api/log` ne portano due dai dispositivi dell'operatore
  (`Can't find variable: Notification`, e un rejection IndexedDB
  *"Attempt to get records from database without an in-progress transaction"*).
  Ora il watchdog scatta sul **SINTOMO** (il loader è ancora acceso), mai su un
  indizio: 15s se l'app non ha ancora armato la sua rete
  (`window.__portalBootArmed`, stampata subito dopo il watchdog dei 25s), 30s
  comunque, e un `window.onerror` mentre la rete non è armata accorcia
  l'attesa a 2,5s. Corretti insieme i difetti che ci arrivavano dentro:
  `Notification` letta senza guard (iOS non la espone fuori dalle PWA
  installate), `localStorage` non protetto in `startFirestorePersistence`
  (Safari privato LANCIA invece di restituire vuoto — `firebase-config.js` lo
  avvolgeva già, `portal-app.js` no) e `loadChartJS` che rigettava l'Event
  grezzo senza `.catch()` sul chiamante della dashboard: una CDN lenta
  produceva un rejection non gestito durante il boot, che in telemetria si
  legge `Event` e non dice nulla.
- **`/login`**: `signInWithEmailAndPassword` era atteso senza tetto — su WebKit
  incastrato il bottone girava all'infinito, senza messaggio. Ora c'è un limite
  di 20s con un messaggio che indica la via d'uscita; è sicuro perché
  `onAuthStateChanged` redirige comunque se il login arriva in ritardo. Stesso
  trattamento alle due letture Firestore di `boom_doc_parser.html` (il `catch`
  copriva il rifiuto, non il silenzio).

Regression suite: `node tests/safari/boot.mjs` — fakes Firebase and asserts
that a hung profile read, a mute realtime channel and a normal boot all end
in a usable page, never a spinner. Needs `playwright-core`
(`BOOM_PLAYWRIGHT=/path/to/index.js` if it lives outside the project).
**Copre anche portal.html** — la superficie più grande e l'unica con un boot
proprio invece di `BoomPortal.requireAuth`, che restava fuori mentre la suite
dichiarava "nessuna superficie autenticata resta appesa": verde e cieca sulla
pagina che si piantava davvero. Il caso *"lo script muore dopo la riga 1"*
riproduce lo spinner infinito e pretende la card di uscita.

**Nota**: `owner-dashboard.html` è oggi una pagina STATICA — non carica
Firebase né autentica nessuno, malgrado la tabella dei portali qui sopra lo
descriva come SPA Firestore filtrata per `ownerId`.

**Deal Link** (`/portal#deal=<base64url JSON>`): semina il wizard
"🚀 Nuovo cliente → contratto firmato" con un deal completo — `{tenant,
conviventi[], propertyMatch, landlordName, contract:{type, rent, startDate,
endDate, depositMonths, paymentDay, cohabitants, otherClauses,
transitionalReason, notes, tenantNationality}}`. Il payload viaggia nel
FRAMMENTO (mai al server/log), sopravvive al giro di login via
sessionStorage, ed è solo un PREFILL: nessuna scrittura finché l'admin non
preme 🚀 nel riepilogo. Il wizard ora è idempotente (riusa cliente per
email/CF e contratto per inquilino+immobile+decorrenza), crea le schede
cliente dei conviventi, tira l'anagrafica locatore da `landlords`, genera
scadenze + PDF come saveContract e manda l'invito firma via
`/api/sign/send-link` (sequenziale: il locatore riceve il suo link alla
firma dell'inquilino — prima spediva entrambi i link subito, fuori dal
design system).

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
