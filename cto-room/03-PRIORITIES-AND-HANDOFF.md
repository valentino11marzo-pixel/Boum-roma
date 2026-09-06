# PRIORITIES AND HANDOFF

Companion to `01-DOSSIER-CURRENT-STATE.md` and `02-TARGET-ARCHITECTURE.md`. Written 2026-09-06 at commit `aed13c8`.
Nothing in this folder changes the running system; every item below is a proposal awaiting the founder's decision.

---

## 1. NOW — fix or clarify immediately (days, not weeks)

Ordered by damage-per-day. Each is small, reversible, and verifiable.

| # | Action | Why now | Verification |
|---|---|---|---|
| 1 | Create the `FIREBASE_SERVICE_ACCOUNT` secret and re-run the `deploy-rules` job; then run `node tests/regole/run.mjs` and a Storage probe | Rules have not deployed from CI since the token died; Storage matches for `backups/` and `rendiconti/` may be missing in production (CI run 33975271662, 2026-09-05) | job log shows "Deploy complete" |
| 2 | Make the repository private (or scrub it: remove `CLAUDE.md`, `docs/`, `tests/`, `bot/`, root studies from deployment via `.vercelignore`, remove personal emails and the chat id from source, rotate the value shown in `api/reminder-cron.js:11`) | The repository returns HTTP 200 unauthenticated; the tree contains internal audits, a personal email default, a numeric chat id and a plausible cron secret | `curl -sI https://github.com/valentino11marzo-pixel/Boum-roma` → 404 |
| 3 | Set `TELEGRAM_WEBHOOK_SECRET` in production and change `requireWebhookSecret` to fail closed | Any POST reaching the webhook with the chat id can approve and execute actions | webhook rejects a POST without the header |
| 4 | Add rules for `viewings` (or fix the three callers to read `viewingRequests`), and make `clientErrors`/`messageLog` writable by the server identity | Two features silently read nothing; the `/salute` error panel is permanently empty | `/salute` shows client errors after a forced browser error |
| 5 | Encrypt the Cassaforte ZIP before upload/email, stop emailing it, prune to 30 days, enable Firestore PITR | A plaintext copy of the whole database is emailed nightly with no retention | backup restored once into the staging project (see 7) |
| 6 | Escape `${m.title}` and the other unescaped dashboard interpolations; restrict `maintenance`/`documents`/`messages` create to non-anonymous users with a key whitelist | Stored XSS in the admin session reachable by anonymous visitors | rules emulator test + a manual XSS probe |
| 7 | Create a **staging** Firebase project and point preview deployments at it (env by `VERCEL_ENV`) | Every preview deployment runs 176 functions against production data with preview origins whitelisted | a preview write lands in staging |
| 8 | Remove the `'boom'`/`"fallback"` salt defaults: throw at module load when `HOMIE_SECRET`/`PASS_AUTH_SECRET` are missing | In any deployment without those env vars every client link is computable from public source | function returns 500 in a preview without the secret |
| 9 | Decide the commission definition once (terms §4.1 "whichever is lower" vs the code's 10 % of annual) and align `create.js`, `how-it-works`, `executive`, `llms.txt`, FAQ | Every pre-agreement issued today charges a fee the terms do not describe | one grep, one number |
| 10 | Fix the fiscal engines to read `cedolareSecca` as written, exclude rent receipts from company VAT, and stop the `autoInvoiceForPayment` rent-receipt invoices | The Contabile, scadenzario and taxpack are wrong for every contract | `tests/fiscal` extended with a `'si'` contract |
| 11 | Make `contacted` leads visible as hot in the portal and to the Commerciale/Brain filters | The hottest leads (anyone the operator replied to on WhatsApp) vanish from every list | portal lead list shows them |
| 12 | Make phone OTP mandatory on `/sign` (or email-link verification), print the delegate on the contract and certificate, store the byte hash of the shown PDF on the certificate | The signature copy overstates what is captured | `tests/firma` + a signed sample |
| 13 | Retire in one PR: `booking.html`, `deals.html` from the sitemap, `form-tenant/landlord`, `onboarding → registrations`, `api/apply.js`, `ask-listing.js`, the four `-classic` pages, `smartlink-fix.js`, `owner-dashboard` (both), `cockpit-preview`, `public/deals_v2_commandcenter.html`, `api/vercel.json`, the EmailJS server calls (move those four emails to Nodemailer), `geocode-all/bake` (or gate bake) | Indexed dead pages, public write endpoint, contradictory config | sitemap has no dead URLs; `tests/seo` |
| 14 | Add heartbeats to the six silent crons and a time budget to `reminder-cron` and `notify-pending` | Kills leave no trace; SEPA collection can starve | `/salute` shows all 28 |
| 15 | Rewrite `privacy.html` from the real processor list; add the consent line for digests; document the erasure runbook even if manual | The policy describes a different stack and promises MFA and retention that do not exist | policy reviewed by the operator's advisor |

None of these require the target architecture. Items 1–8 are security; 9–12 are money and legal truth; 13–15 are hygiene.

---

## 2. NEXT — foundations for the next ~90 days

In this order; each step deletes something (see `02` § 13).

1. **Server identity**: service account + Admin SDK in one module; nine sign-in copies removed; rules become browser-only.
2. **Schema + migrations tooling**: typed definitions, `validate()` at every door, `migrations/` with markers and dry-run, generated indexes. First migrations: `propertyId` on units, `cedolareSecca` normalised, `viewings` → `viewingRequests`, timestamps to one encoding.
3. **The DEALS entity and state machine** with dual-write and a nightly parity report; the Oggi queue and the Telegram cards read the deal. This is the first thing that makes "what is blocking this deal" answerable.
4. **One contract door** (creation + schedule + deadlines) called by portal, console, Innesto and auto-convert; delete in-portal signing/activation, the browser rules engine, browser dunning and boot-time emails.
5. **One availability writer + public projection + server-rendered `/apartments` and `/`**; retire the Python builders and the four duplicates; strip operator identity and contract ids from public documents; honour pin precision on the page.
6. **PARTIES** with verification levels and provenance; `users` becomes auth-only; the scheda/PA/sign flows write parties; dedupe report reviewed by the operator.
7. **MONEY truths**: commission receivable, landlord settlement statement (what was collected, what was remitted, when), invoice series decision (FatturaPA via the commercialista or in-product), double-charge detection on PREAGREEMENT/DEPOSIT, PA resume with add-ons, pay-link fee from measured stats, bank auto-match restricted to reference or counterparty matches.
8. **AI gateway + approval tiers**: `_core/ai.js` with tiers and budgets; the 24 sites migrated; prompt versions stamped; the nine no-tap paths downgraded to proposals or suggestions; stubbed-model tests for the five prompts that write.
9. **Event spine + observability**: `events` written by doors; the minute pump as dispatcher; mandatory heartbeats; error tracker; second alert sink; a Mac dead-man on the server.
10. **One Telegram bot**: the wizard's grammar server-side; crons stop emitting commands for another chat; conversation memory on the server.
11. **Design tokens**: one `tokens.css` with the two declared contexts, one nav include, one i18n helper with one key, one Solari module, one manifest; client surfaces moved to the client context.
12. **Privacy programme**: register of processing, retention job, erasure runbook rehearsed on staging, DPIA for lead scoring / recordings / ID OCR, consent for digests, encrypted backups.

Explicitly **not** in the 90 days: a second city, a new visual identity, a paid BOOM PASS tier, white-label, Réunion,
any new agent, any new console.

---

## 3. LATER — only with transaction volume and evidence

- **BOOM PASS as a product** (document vault, portability, per-purpose sharing, city history) — after PARTIES and DEALS exist and after ≥20 deals have run through the state machine.
- **Owner app + mandate + settlement** as recurring revenue — after the settlement statement is true for the existing owners.
- **Organisations / B2B framework agreements** — after two pilot accounts have signed on the existing rail.
- **Qualified signature or timestamp provider** — when a dispute or a corporate client requires it, or when the FES copy cannot be made honest otherwise.
- **Event-driven concierge with partners** — after the journey emails' offers show any acceptance; partner registry as data.
- **Second Telegram/WhatsApp surface for clients (Homie for tenants)** — after the operator's Homie answers deal questions reliably.
- **Second city pack** — only when `grep` for Rome literals in domain code returns nothing and Rome closes ≥10 deals/month.
- **Data products** (signed-rent index, absorption) — when zone samples pass thresholds without "measuring" labels.
- **White-label Magic Sign / canone-as-code** — after 50 closed deals on the rail.

---

## 4. Five things to STOP building

1. **New agents, radars, consoles and studies.** 26 registry agents, 28 crons, three command centres, four radars, three photo studios and seven studies in five weeks for ~30 payments. Freeze the registry; every new automation must retire one.
2. **Design directions.** Sixteen named directions, 37 preview pages, three background engines. Choose the 2026 site + SCALO as the public/client system and the portal OS as the operator system; delete the rest.
3. **Markets and segments before the rail works** — Réunion, Executive-as-a-product, kiosk, feed to portals that do not answer, Pubblicista automation of third-party back offices (ToS exposure with no evidence of value).
4. **AI where a rule suffices** — haiku on fixed-format portal emails and bank alerts, Opus on daily statistics, `canone-bot` next to a guided form, the concierge chat nobody calls, the Miniera/demand/voice trilogy over personal WhatsApp history.
5. **Documentation as a substitute for structure** — 977-word commit essays and a 268 KB guide that cannot be validated. Replace with ADRs, a generated changelog, and tests that assert behaviour instead of source text.

## 5. Five things that create disproportionate leverage

1. **The DEALS state machine with events.** It converts nine collections and a Telegram thread into one truth, makes Homie's "what is blocking this deal" a query, makes funnel metrics real, and is the precondition for BOOM PASS, settlements and the concierge.
2. **A service-account server identity + schema + doors.** One change removes an entire class of incidents (rules drift, ghost collections, browser-written business state, password-as-credential) and makes every later refactor safe.
3. **Owner-side truth: mandate + settlement statement.** Supply is the bottleneck every study names; a landlord who receives a monthly statement showing collected/remitted amounts with the signed-rent benchmark is the product owners will pay for, and it reuses the rendiconto, rent rails and the valuation engine already built.
4. **The AI gateway with tiers and the four approval tiers.** It ends Claude dependence structurally, cuts cost (Opus by default for one-line drafts), makes autonomy measurable from clean decision history, and turns the existing fiducia/Segretaria/postino work into one policy.
5. **Server-rendered public inventory from one projection.** It kills the Python snapshot, the stale meta, the leaks, the four renderers and the six Solari copies at once, and makes the site tell the truth the availability engine already knows.

---

## 6. HANDOFF TO BOOM CTO ROOM

Dense facts for any engineer or model continuing this work without conversational context. All at commit `aed13c8`.

### 6.1 Concise current architecture

- Static HTML (145 root pages, 69 public) on Vercel; 176 serverless functions + 73 helpers under `api/` (ESM); 28 crons; no build step; no framework.
- Firestore is the only database (~70 collections in rules, 3 more referenced by code); Firebase Auth (email/password, anonymous); Storage with tokenized URLs.
- **Every server function authenticates as an admin *user* (email/password) and uses Firestore REST**; rules apply to the server; no Admin SDK; no service account (`api/homie/_lib.js:27-47`).
- Operator console = `portal.html` + `js/portal-app.js` (28,356 lines) writing Firestore directly from the browser (~200 sites); tenant app `/casa` = `tenant.html`; client links = `/book`, `/viewing`, `/sign`, `/scheda`, `/pre-agreement`, `/client-portal`, `/pass-delivery`.
- Mac mini: Python listing wizard (second Telegram bot, polling), four deterministic bracci (scout, contatto, postino, publisher), an OpenClaw LLM agent with shell daemons; WhatsApp only through `wacli` on the Mac.
- Telegram operator bot (webhook) = alerts + approvals + viewings + tasks + document intake; `notify-pending` cron every minute is the pump.
- AI: 24 Anthropic call sites by raw `fetch` (haiku ×17 files; Opus 4.8 default in the shared client; sonnet-5 ×1; opus-5 ×1), 2 Whisper, ElevenLabs, OpenClaw.
- Money: Stripe Checkout + SEPA SDD + bank transfer with derived reference; webhook branches PFS/SERVICE/RESERVE/PREAGREEMENT/DEPOSIT/RENT/INVOICE/SDD; bank feed via IMAP/CSV; no landlord settlement logic.
- Documents: one shared jsPDF contract layout (browser + server), pdf-lib server documents, FES signing with freetsa timestamp, fiscal dossier/pack/ASPI, verbale, inventory.

### 6.2 Critical technical facts

1. Rules have not deployed from CI since the token expired; PR #231's service-account fix has no secret behind it (run 33975271662 failed 2026-09-05).
2. The repository is public; `.vercelignore` deploys docs, tests, studies and `bot/` as static files.
3. `HOMIE_SECRET` derives every client link and authenticates every machine; derivations fall back to `'boom'` when the env is missing; rotation has no grace window.
4. The Telegram webhook accepts any POST when `TELEGRAM_WEBHOOK_SECRET` is unset.
5. Three collections referenced by server code are unusable: `viewings` (no rule, no writer), `clientErrors` and `messageLog` (`write:false`).
6. `listings.propertyId` has no writer (0/26 live listings) → the signature-driven `rented` sync never fires; nothing resets availability at contract end.
7. `cedolareSecca` is stored as `'si'|'no'` and read as `=== true` by both fiscal engines → every contract computed as ordinary IRPEF.
8. Commission: terms say "one month or 10 % of annual, whichever is lower"; code defaults to 10 % of annual; `contract.agencyFee` is read by nothing; no PFS credit.
9. Rent receipts marked paid manually become `invoices` and inflate the company VAT estimate.
10. `contracts.status='active'` at creation; `expired` never automated; journey/gestore/relet reason on stale contracts.
11. Leads flipped to `contacted` by a manual WhatsApp reply are hidden by the portal and ignored by Brain/Commerciale/notify-pending.
12. Rent schedule generated in three places (`magic-sign/submit.js`, `portal-app.js:17866`, `portal-app.js:28112`), same ids by convention.
13. Magic Sign: OTP skippable (`otpRequired` has no writer), hashes not bound to bytes, TSA unverified, delegate not printed, client-side signature write path allowed by rules.
14. Nightly Cassaforte ZIP (26 collections, plaintext) stored with a bearer URL and emailed; no retention; no restore drill; ~20 collections not covered.
15. Previews deploy all functions against production Firebase; no staging; `VERCEL_ENV` unused.
16. `reminder-cron` runs 14 jobs with one time guard; 6 crons have no heartbeat; `notify-pending` has no overlap guard.
17. Stored XSS: anonymous sessions can create `maintenance` docs rendered unescaped in the admin dashboard (`portal-app.js:4933`).
18. Any landlord can read any user's Storage `documents/`, `maintenance/`, `payment-proofs/` folders.
19. Public listing documents carry operator email (`availabilityUpdatedBy`), contract ids, exact addresses regardless of pin precision; `wizard/publish` has no field whitelist.
20. The public site's `/apartments`, `/`, `/apartment-detail` are Python snapshots from 31 July with inputs (`foto-uri.json`, `live-rows.json`) not in the repo; the runtime overlay cannot remove deleted listings.
21. Five person collections + two `users` schemas; tenants created without Auth accounts cannot be authorised.
22. EmailJS is still used server-side in three files; `api/vercel.json` is a stale nested config; nine orphan `api/agent/*` tools; `tenant.html` posts maintenance to an endpoint that always returns 401.
23. Git: 1,158 commits since 2026-01-12, 231 PRs, ~3/day recently, all merged by the owner, authored largely by Claude; CI red on 9 of the last 12 `main` runs with no branch protection.

### 6.3 Unresolved questions (need the founder or access)

- Which Homie mandate is loaded on the Mac, and is the OpenClaw agent running at all? Which provider does it use?
- Are `TELEGRAM_WEBHOOK_SECRET`, `PASS_AUTH_SECRET`, `HOMIE_SECRET`, `CRON_SECRET` set in production and in previews? Was the Stripe webhook secret rotated after April?
- Do landlords receive rent from tenants directly, or does Egidi collect and remit? Under what mandate?
- Is the ElevenLabs receptionist live? Is the Immobiliare feed activated? Does GoCardless have an account?
- How many tenants log into `/portal` (the second tenant surface) vs `/casa`?
- Are there `users` with role `owner`? Do legacy listings carry `propertyId` anywhere?
- What is the Firestore region; is PITR enabled; what is the current size of `backups/`?
- Which of the 49 dormant Vercel projects hold crons or secrets?
- Is a natural-person *agente immobiliare* enrolment in place for the licensed activity; is there a written landlord delegation template behind `landlordDelegate`?
- Revenue since 2 August 2026 (the last audited figure); deals per month; time-to-keys.

### 6.4 Major product conclusions

- The rail (proposal → sign → pay → registered contract → tenant app) is real and rare; it is the product. Everything else is instrumentation or theatre until volume exists.
- Supply (owner mandates) is the constraint; the owner side is unbuilt while demand tooling multiplied.
- The deal has no system of record; the transaction must become the heart, with an explicit state machine and events.
- The founder's concept vocabulary is not implemented; the SCALO layer is, and it should become the status language over real states (customer words / operator codes / board glyphs), never stored strings.
- Autonomy policy is undecided; the four tiers in `02` § 9 replace three regimes that all default off.
- Consolidation must precede any new capability; the repo already contains the studies that say so.

### 6.5 Proposed architecture (one line each)

Eight domains (INVENTORY, PARTIES, DEALS, DOCUMENTS, MONEY, SERVICES, OPERATIONS, INTELLIGENCE) over one platform
runtime (service-account identity, schema + migrations, write doors, event spine, config/flags, observability, AI
gateway), rendered by five thin surfaces (public site, BOOM PASS, owner app, CONTROL, HOMIE). Global code, an Italy pack,
a Rome pack. Strangler in ten steps; each step deletes something. Full text: `02-TARGET-ARCHITECTURE.md`.

### 6.6 Immediate priorities

Section 1 (NOW) items 1–8 this week; 9–15 next; then NEXT step 1 (server identity) and step 3 (DEALS) as the first
foundations.

### 6.7 Relevant repository locations

| Topic | Files |
|---|---|
| Server identity / Firestore REST | `api/homie/_lib.js`, `api/_auth.js`, `api/pfs/_guard.js`, `api/agent/_lib.js` |
| Rules | `firestore.rules`, `storage.rules`, `tests/rules/`, `tests/regole/run.mjs`, `.github/workflows/ci.yml` |
| Deal rail | `api/apply-lead.js`, `api/leads/*`, `api/viewings/*` (`_apply.js`, `_avail.js`, `_moments.js`), `api/preagreement/*` (`_lock.js`, `_state.js`, `convert.js`, `submit.js`), `api/magic-sign/*`, `api/sign/_finalize.js`, `api/journey/_run.js` |
| Money | `api/stripe-webhook.js`, `api/payments/*`, `api/banking/*`, `api/_catalog.js`, `js/fiscal-engine.js`, `js/taxpack-engine.js`, `api/owners/rendiconto.js`, `api/employees/contabile.js` |
| Documents | `js/contract-pdf.js`, `api/sign/_contractpdf.js`, `api/sign/_pack.js`, `api/fiscal/*`, `api/contracts/*`, `api/_pdfbrand.js`, `api/documents/*` |
| Inventory | `js/dispo-engine.js`, `js/boom-geo.js`, `api/listing.js`, `api/listings-availability.js`, `api/wizard/*`, `api/photos/enhance.js`, `design/pages-deco/costruisci-*.py`, `apartments.html`, `board.html` |
| Homie / Telegram / Mac | `api/telegram/*`, `api/homie/*`, `api/agent/*`, `bot/*`, `homie-bridge/*` |
| AI | `api/agent/_claude.js`, `api/_modeljson.js`, `api/_budget.js`, the 23 files listed in `01` § 10 |
| Portal | `portal.html`, `js/portal-app.js`, `js/portal-actions.js`, `js/portal-mobile.js`, `js/portal-desktop.js`, `js/oggi-engine.js`, `css/portal*.css` |
| Ops | `vercel.json`, `api/reminder-cron.js`, `api/telegram/notify-pending.js`, `api/pfs/_health.js`, `api/employees/_lib.js`, `api/ops/cassaforte.js`, `salute.html`, `team.html`, `js/squadra-registry.js` |
| Studies worth reading | `AUDIT_BOOM_2026-08-18.md`, `STUDIO_ARSENALE_2026-08.md` (+II), `STUDIO_SCRIVANO.md`, `STUDIO_AVIATION_2026-08.md`, `docs/strategia-servizi-digitali.md`, `docs/audit-2026-08.md`, `STUDIO_ORGANICO_2026-08.md` |

### 6.8 What should NOT be changed

- The pure engines and their tests (`js/*-engine.js`, `api/viewings/_avail.js`) — extend, do not fork.
- The "one place a state changes" modules (`_apply.js`, `_lock.js`, `_state.js`, `magic-sign/submit.js`, `_finalize.js`) — the deal door should wrap them, not replace them.
- Idempotency conventions (deterministic ids, `fsCreate` 409, `contextHash`, marker docs).
- The approval rail's shape (`action_queue` → executor → outbox → postino stall card) — generalise it, do not rebuild it.
- The viewing lifecycle, Wallet passes and the PassKit web service.
- The legal templates (`reference/`) and their verbatim reproduction; `_pdfbrand` as the header standard.
- `laneCopy` as the single availability dictionary; `boom-geo` precision; the SSR design of `api/listing.js`.
- The testing instincts: handler-level tests over an in-memory store, mutation checks, the anonymous production probe, browser suites at 390/1440 px.
- The public/client visual identity of the 2026 site and the SCALO boundary rule (no aviation in contracts, money or legal copy).

### 6.9 Risks

- **Security exposure is live** (public repo, fail-open webhook, XSS path, plaintext backups, human credential as server identity). Treat NOW items 1–8 as an incident, not a backlog.
- **Legal/financial**: commission vs terms mismatch on every proposal; fiscal outputs wrong for every contract; funds handled with no settlement record; signature evidence weaker than the copy.
- **Operational**: one operator, one chat, one mailbox, one Mac, one password; the system cannot tell when it is broken.
- **Change risk**: any refactor of `portal-app.js` breaks source-pinning tests and DOM-scraping layers; the strangler must move logic to doors *before* touching the UI.
- **Process**: ~3 PRs/day merged with CI red and no branch protection; velocity without a changelog or ADRs; documentation that cannot be validated.
- **Product**: marketing claims without data on 12 live pages; two markets and one segment with no evidence; autonomy policy undecided.

### 6.10 Recommended first engineering task

**Land the service-account server identity and a rules/code contract test, in one PR, behind a flag.**

Scope: (1) `api/_core/db.js` exporting the existing `fsGet/fsList/fsCreate/fsPatch/fsDelete` signatures over the
Firebase Admin SDK, selected by `DB_MODE=sa` (default `user` until cut-over); (2) replace the nine `signInWithPassword`
copies with the one module; (3) `tests/contract/rules.mjs` that parses `firestore.rules`, greps every collection written
by `api/**`, and fails on any collection without a rule or with `write: if false` while the server writes it (today it
would fail on `viewings`, `clientErrors`, `messageLog`); (4) the `FIREBASE_SERVICE_ACCOUNT` secret in GitHub and Vercel;
(5) `deploy-rules` green with "Deploy complete".

Why first: it removes the largest single class of incidents in the repo's own history, it is the precondition for doors,
schema and staging, it is reversible by one flag, and it is validated by the existing suites over an in-memory Firestore
plus the anonymous production probe. Expected size: 2–3 days for one engineer. Deletes: eight duplicate sign-in helpers.
