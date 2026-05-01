# BOOM Master Sprint — 2026-05-02

> **Plan-mode artifact.** On approval & start of execution, the FIRST action of Phase 1 is to copy this file verbatim to `docs/master-plan-2026-05-02.md` (path the brief specified) and commit it as the sprint's source of truth.

---

## Context

Phase 3 (PWA + viewing polish + email unification + jsQR fallback) shipped to `main` on 2026-05-01. With production launch on **2026-06-01 (~30 days)**, this sprint builds the operational core BOOM needs to actually run a property-management business at scale: maintenance ticketing (3-sided), rent payment lifecycle, a unified telemetry cockpit, and the memory substrate (Atlas) that future AI agents will read from. Decisions confirmed by founder:
- **Refactor in place**: existing `Maintenance` tab → `Tickets`; existing `Payments` tab extended (no parallel tabs).
- **MVP by June 1**: Phases 1, 3, 4 + minimal polish ship before launch. Phases 2 (Atlas) and 5 (Lab) ship after launch as a v1.1 follow-up.
- **Atlas write-hook stubs ship in Phase 1, not deferred** (founder mandate, 2026-05-02). A single helper `writePendingMemory(type, content, metadata, source)` writes to a new `pendingMemories` collection. The helper is wired into existing flows (Magic Sign success, lead grading, contract creation) AND into the new flows shipped in Phases 3 and 4. Real Atlas API (`api/atlas-remember.js` + embeddings + recall) ships in v1.1; on first deploy it drains `pendingMemories` so the 30 days of post-launch ticket/payment/contract events are captured retroactively.
- **Phase 1 bug debt is non-negotiable** (founder mandate, 2026-05-02). All 5 items must be green and verified by smoke test before Phase 6.A pre-launch sign-off. None slips to v1.1.

---

## Inventory (baseline at 2026-05-02)

### Existing admin tabs (relevant subset)
| Tab | Route | Render fn | Line | Notes |
|---|---|---|---|---|
| Maintenance | `'maintenance'` | `maintenancePage()` | 4025 | **Refactor target → Tickets** |
| Payments | `'payments'` | `paymentsPage()` | 4024 | **Extend in place** |
| Clienti (CRM+PFS unified) | `'clienti'` | `clientiPage()` | 6009 | Already merged — no separate PFS tab needed |
| Activity Log | `'activity-log'` | `activityLogPage()` | 4028 | Lab tab will sit alongside |
| BOOM Tools | `'boom-tools'` | `boomToolsPage()` | 3946 | Lab will likely subsume or sit beside |
| Tenant: my-payments / my-maintenance | `'my-*'` | (tenant nav) | 3969-3970 | **Skeletons exist** — magic-link views plug in here |

### Existing Firestore collections in scope
`contracts`, `users`, `properties`, `payments` (legacy), `maintenance` (legacy), `viewingRequests`, `magicLinks`, `notifications`, `pfsClients`, `landlords`, `documents`, `leads`, `listings`, `activityLog`.

### Existing API routes
`api/generate-pass.js`, `api/parse-docs.js`, `api/reminder-cron.js`, `api/stripe-webhook.js`, `api/create-checkout.js`, `api/notify-viewing-created.js`, `api/package.json` (ESM marker).

### Existing EmailJS templates (only 2)
- `boom_notification` — universal template, used by ALL existing flows via `EMAILJS_CONFIG.templates.notification` (portal:806; also stripe-webhook + notify-viewing-created use it directly).
- `boom_signature_request` — Magic Sign emails.
- **Free-tier limit is 2 templates** (per BOOM_STATUS 22/04/2026). New rich emails MUST reuse `boom_notification` with parameterized fields, OR plan upgrades.

### Existing helpers worth reusing (line refs)
- `sendBoomEmail(templateId, toEmail, params)` — portal:12558
- `EMAILJS_CONFIG` — portal:806
- `COMPANY` (legal/IBAN/etc.) — portal:790
- `createNotification(userId, type, title, message, data)` — portal:3316
- `toast(type, title, msg)` — portal:15618
- `openModal(type, data)` / `closeModal()` — portal:9383/9397
- `logActivity(action, category, details)` — portal:3527
- `isAdmin()` — portal:1376 (`S.profile?.role === 'admin'`)
- `accessDenied()` fallback — portal:4133
- Magic Sign anon-auth bootstrap — portal:1552-1650 (clone for tickets/payments magic links)
- `_prefillContractFromViewing` pattern — portal:12932 (clone for missing Lead→Contract bridge)
- Storage upload pattern — portal:12152 / 14010 / 14019 (`firebase.storage().ref('...')`)
- Firebase REST helpers in `api/reminder-cron.js` (signInWithPassword + Firestore REST) — pattern for cron writes

---

## Discrepancies between brief and codebase

1. **Brief assumes greenfield Tickets/Payments tabs.** They exist. → Refactor in place (confirmed).
2. **Brief references `docs/code-quality-audit-2026-04-30.md`** — does not exist. Only `docs/proppass-audit-2026-04-29.md` is on disk. → Skip wider audit; proceed with the brief's 5 explicit bug-debt items (which are already well-specified). If broader audit becomes needed, do it as a separate session.
3. **Brief references `api/webhook-proxy.js`** — does not exist. Actual file is `api/stripe-webhook.js`. → Treat as typo.
4. **Line numbers in brief are stale** (~9498, ~10043, ~1861). Real lines as of 2026-05-02: `generateContractPDF` 11785, `downloadContractPDF` 13861, `otpSkipStep` 1944, IP `'collected'` literal at 2048-2050.
5. **`isAdmin()` is Firestore-role-based, not Firebase custom claims.** Firestore Rules will enforce admin via `get(/databases/$(database)/documents/users/$(uid)).data.role == 'admin'` — costs 1 extra read per write but is correct. Custom claims migration deferred.
6. **PFS is already in `Clienti` tab** (line 6009) — not a missing piece. Brief implied it might be deferred; it isn't.

---

## Pre-existing bug debt (resolved in Phase 1)

| # | Bug | Lines | Fix approach |
|---|---|---|---|
| 1 | `generateContractPDF` ↔ `downloadContractPDF` divergence | 11785 / 13861 | Source of truth = base64 PDF in Firestore (or Storage URL when present). `downloadContractPDF` fetches that artifact; only regenerates when `hasSignatures && !pdfRegeneratedAfterSign`. Currently the wrapper exists but the source-of-truth contract is implicit. Make explicit + remove duplicated regeneration paths. |
| 2 | Lead → Contract bridge missing | (no fn) | Add `createContractFromLead(leadId)` mirroring `createContractFromViewing` (12932). Refactor `addContract` modal to read `window._prefillContractFromLead`. |
| 3 | Magic Sign IP hardcoded `'collected'` | 2048, 2055 | Move signing event write to a new endpoint `api/sign-event.js` that captures `x-forwarded-for`, computes the actual PDF SHA-256 (deterministic, not Date.now() concatenation), and writes a `signatureEvents` document. Portal calls fetch on submit. Existing in-portal write of `tenantSignedAt`/`landlordSignedAt` stays for UI; provenance moves server-side. |
| 4 | `otpSkipStep()` allows phone bypass | 1944 | Behind a flag: in dev, skip stays for testing (`window.DEV_MAGIC_SIGN_OTP_SKIP === true`). In prod the function refuses to advance. Investigate whether the skip path is actually invoked from a hidden UI button (suspect: yes, breaks OTP enforcement in prod). |
| 5 | Permissive Firestore rules | (rules file) | Write proper rules for: anon Magic Link (token match + own ticket/payment only); landlord magic link (only their property); admin (Firestore role check via `get()`). Test with Firebase emulator before deploy. |

---

## Cross-cutting requirements (built progressively, mostly Phase 1)

- **`pendingMemories` collection + `writePendingMemory(type, content, metadata, source)` helper** in portal.html and as a small REST writer for server-side flows. Fire-and-forget (non-blocking; failure logs to console only — never breaks the calling flow). Wired in Phase 1 to: Magic Sign success (portal:2073 area, post `postSignaturePassFlow`), lead grading (search for Greta call site / `gradeLead`), contract creation. Wired in Phases 3.6 and 4.6 to: `ticket_resolved`, `payment_late`, `payment_disputed`. v1.1 Atlas drains this collection on first deploy.
- **`whatsappQueue` collection** + Mac Mini drain script (`wa_queue_drain.py`). Server-side code never calls `wacli` directly; it writes to the queue. Twilio escape hatch interface built but disabled.
- **`src/email-templates.js` + `src/wa-templates.js`** — single source of templates. Migrate the 2 existing IDs; define skeletons for new templates (which will all reuse `boom_notification` until plan upgrades).
- **`src/schemas.md`** — terse schema spec for every new collection, with field types, indices, and write-paths.
- **Firestore Rules** — versioned in `firestore.rules`. Storage rules in `storage.rules`.
- **Lazy-load tab harness** — `lazyLoadTab(tabKey, loaderFn)` wrapping the new Tickets and Payments tabs. Phase 6 backports to top 3 heaviest existing tabs.
- **Brand bar**: Helvetica Neue 300, `#08080A`, `#D4AF37`. Legacy `#C9A96E` spots flagged but NOT refactored this sprint. New code uses `#D4AF37` only.
- **Performance**: skeleton states ≤200ms; mobile-first; no layout shift.

---

## Dependency graph

```
Phase 0 (plan + approval)        ← NOW
        │
        ▼
Phase 1 (foundations + bug debt) ← prerequisites for everything
        │
        ├──► Phase 3 (Tickets)   ┐
        │                        ├─► Phase 6.A (pre-launch polish) ─► LAUNCH 2026-06-01
        └──► Phase 4 (Payments)  ┘
                                              │
                                              ▼ (post-launch)
                                       Phase 2 (Atlas + Agent Registry)
                                              │
                                              ▼
                                       Phase 5 (Lab Cockpit)
                                              │
                                              ▼
                                       Phase 6.B (final polish, audit, BOOM_STATUS)
```

Atlas write-hooks in Phases 3.6 and 4.6 are stubbed (console + holding queue document `pendingMemories`) so the call sites are wired; Phase 2 drains the queue retroactively.

---

## Phase plan

### Phase 0 — Plan + approval gate (this artifact)
Output: this file. On `approved`/`vai`, copy to `docs/master-plan-2026-05-02.md` and proceed.

### Phase 1 — Foundations & bug debt (target: 5-7 days, NON-NEGOTIABLE — no slip to v1.1)
- Branch `sprint/master-2026-05-02` from `main`. Open draft PR.
- **Resolve 5 bug-debt items above.** All five must be smoke-tested green before Phase 6.A sign-off; nothing slips.
- **Create `firestore.rules` + `storage.rules`** with rules for: anon Magic Link tenant on own ticket/payment; landlord magic link on own property; admin via Firestore role lookup. Emulator-tested before deploy.
- **Create empty collections (documented in `src/schemas.md`)**: `maintenanceTickets`, `rentPayments`, `paymentEvents`, `whatsappQueue`, `signatureEvents`, `pendingMemories`. Phase 2 will add `toolHeartbeats`, `toolJobs`, `agents`, `agentEvents`, `memories`.
- **Atlas write-hook stubs (LIVE from Phase 1):**
  - `writePendingMemory(type, content, metadata, source)` helper in portal.html (client) + a tiny REST writer pattern reusable from `api/*` (server-side; same Firebase REST pattern as `api/stripe-webhook.js`).
  - Wire into existing flows: Magic Sign success (portal post-firma async IIFE, ~line 2105), lead grade decided (locate Greta callsite / `gradeLead`), contract creation save handler. Each call is non-blocking and logs failure only.
  - The collection schema is final from day one (so v1.1 Atlas can drain without migration): `{ id, type, content, metadata: { propertyId?, tenantId?, landlordId?, contractId?, leadId?, ticketId?, paymentId?, tags[] }, source, createdAt, drained: false, drainedAt: null }`.
  - Phase 1 verification: a real Magic Sign in test mode produces ONE `pendingMemories` doc with `drained: false`.
- **Set up `src/email-templates.js` + `src/wa-templates.js`.** Migrate the 2 existing IDs; define skeletons.
- **Lazy-load harness** + apply to Tickets + Payments tabs as built.
- **Verify Firebase Storage is enabled** (already used by passes/contracts → assumed yes; confirm bucket name in env).
- Add new env vars to a Vercel checklist doc (`docs/vercel-env-checklist.md`): `VOYAGE_API_KEY`, `OPENAI_API_KEY` (Phase 2 only), `WA_VIA_TWILIO=false`, no secrets committed.
- **Smoke test**: portal loads, all existing tabs work, Magic Sign success path works end-to-end (with new IP capture from server) AND produces a `pendingMemories` doc.

**Halt. Report.**

### Phase 3 — Block A: Tickets (target: 7-10 days)
Refactor `maintenance` → `tickets`. Old `maintenance` docs read-migrated on first load (lazy back-fill on document open: read old shape, write new shape).

- **3.1 Schema + Tickets tab.** Refactor `maintenancePage()` → `ticketsPage()`. Lifecycle `open → triaged → assigned → in_progress → resolved → closed` + `disputed` branch + reopen. Cost model: `costEstimate`, `costFinal`, `costAllocation ∈ {landlord, tenant, boom, split}`. Default-allocation rule (in code comments): structural/heating/appliance → landlord; consumables → tenant. SLA timers: urgent=4h, high=24h, medium=72h, low=7d. Overdue red strip at top. Manual create from admin.
- **3.2 Tenant Magic Link create flow.** `?ticket=new&token=...`. Anon-auth pattern from Magic Sign (portal:1552-1650). Multi-step form: title, category, severity, description, photos/video → Firebase Storage `tickets/{ticketId}/{file}`.
- **3.3 Landlord Magic Link read+comment.** `?landlord=TOKEN&ticket=ID`. Read-only ticket view + comment box → `tickets.{id}.comments[]` array.
- **3.4 Notifications matrix.** Email via `boom_notification` parameterized; WhatsApp via `whatsappQueue` writes. Matrix per brief.
- **3.5 SLA timers + overdue surfacing.** Server-evaluated in `reminder-cron.js` extension (every 15 min, marks `slaBreached: true` with `breachedAt`).
- **3.6 Atlas hook.** On `ticket_resolved`: call `writePendingMemory('ticket_resolved', content, metadata, 'tickets')` (helper from Phase 1). v1.1 Atlas drains.

**Halt at end of 3.1, 3.2, 3.3-3.4 combined, 3.5-3.6 combined.**

### Phase 4 — Block B: Payments (target: 7-10 days)
Extend existing `Payments` tab. Migrate any docs in legacy `payments` collection into `rentPayments` schema with sane defaults.

- **4.1 Schema + Magic Sign success hook.** New collection `rentPayments`. On Magic Sign full-signature success (portal:2073 area): generate N scheduled payment docs (one per month). Status lifecycle: `scheduled → paid | late | partial | disputed`. `forwardedToLandlord: bool`. Every write emits a `paymentEvents` log entry (Mercurio-ready).
- **Back-fill**: one-shot endpoint `api/admin-backfill-payments.js`, gated by `PARSE_DOCS_SECRET` pattern, generates rentPayments for already-active contracts in DB. Manual trigger.
- **4.2 Admin Payments tab.** Calendar/list view (default current + next month). Per-row actions: mark paid (date + method + ref/receipt upload), partial (received amount), disputed (note), forward to landlord. Filters: property/landlord/tenant/status. Top metrics: collected/pending/overdue this month + commission earned.
- **4.3 Tenant + Landlord Magic Link views.** `?tenant=TOKEN` → personal payment history + downloadable receipts (auto-PDF on mark-paid). `?landlord=TOKEN` → per-property monthly cashflow + pending forwards.
- **4.4 Reminder cron extension.** T-5 (tenant email + WA), T-0 (tenant email), T+3 (tenant email + WA + admin alert), T+7 (admin only — human takes over).
- **4.5 Monthly statement PDF.** jsPDF reuse. Cron on day 5 of month → `boom_landlord_monthly_statement` (parameterized via `boom_notification`). Auto-email to landlords with PDF attachment.
- **4.6 Atlas hook.** On `payment_late` and `payment_disputed`: call `writePendingMemory('payment_late' | 'payment_disputed', content, metadata, 'payments')`. v1.1 Atlas drains.

**Halt at end of 4.1-4.2 combined, 4.3, 4.4-4.5 combined, 4.6.**

### Phase 6.A — Pre-launch polish (target: 3-4 days)
- Backport lazy-load to top 3 heaviest existing tabs (Properties, Contracts, Documents).
- Lighthouse pass on staging deployment. Target: ≥85 mobile / ≥95 desktop. If miss: identify top 3 blockers and ship fixes.
- Final smoke pass: every admin tab, every Magic Link entry, Magic Sign happy path, ticket lifecycle E2E, payment lifecycle E2E.
- Update `BOOM_STATUS.md` with launch state.
- Migration note `docs/migrations/2026-05-02.md` documenting any backfill ops the founder must run on prod data.
- Merge `sprint/master-2026-05-02` → `main`. **LAUNCH 2026-06-01.**

### Phase 2 — Atlas + Agent Registry (post-launch, target: 5-7 days)
- Seed 9 `agents` documents (Homie, Greta, Argo, Atlas, Vesta, Marco, Claudius, Mercurio, Seneca). Status = active/dormant/draft/planned per current reality.
- `agentEvents` collection.
- `memories` collection.
- `api/atlas-remember.js` — embeds via Voyage (`voyage-3`), fallback OpenAI (`text-embedding-3-small`).
- `api/atlas-recall.js` — O(n) cosine over memories. Code comment: migrate to pgvector when n > 50k.
- **Drain `pendingMemories` queue on first deploy.** One-shot endpoint `api/atlas-drain.js` (admin-gated) iterates `pendingMemories` where `drained: false`, embeds each, writes to `memories`, marks `drained: true` + `drainedAt`. Captures the 30 days of post-launch data the Phase 1 stubs collected.
- **Switch `writePendingMemory` to dual-write**: writes to `pendingMemories` (kept for ~7 days as audit trail) AND directly calls `api/atlas-remember.js` for live embedding. Remove dual-write after 30 days of stable operation.
- Admin debug page `?admin=atlas` — visible only when `isAdmin() === true`.

### Phase 5 — Lab Cockpit (post-launch, target: 5-7 days)
- `toolHeartbeats` writers in: `reminder-cron.js`, Magic Sign route, `generate-pass.js`, `parse-docs.js`, all Mac Mini scripts (Listing Scout, Tag Engine, Listing Wizard) via Firebase REST.
- Lab tab UI: cards per tool, last run, key metrics, GitHub Actions auto-disable countdown for Listing Scout.
- `toolJobs` trigger pattern (whitelisted parameterless operations only).
- Agents sub-section reads `agents` registry.

### Phase 6.B — Final polish (post-launch)
- Address any audit findings surfaced by post-launch real traffic.
- Final BOOM_STATUS update.
- Open PR for review (if sprint branch was kept open).

---

## Risk register

| # | Risk | Probability | Mitigation |
|---|---|---|---|
| 1 | Phase 1+3+4 don't fit in 30 days → launch slip | Medium | Hard-cut scope inside Phase 3 / Phase 4 sub-phases ONLY (defer SLA red strip, defer back-fill endpoint UI, defer landlord magic-link comment thread). **Phase 1 cannot be cut** — bug debt + Atlas stubs are non-negotiable. If pressure hits, slip Phase 4.5 (monthly statement PDF) or Phase 6.A polish, never Phase 1. |
| 2 | Firestore Rules complexity breaks existing flows (Magic Sign, viewing book) | Medium | Write rules incrementally with emulator tests. Deploy in shadow mode (rules deployed but backed by `allow if true` in prod) for 24h, then flip. |
| 3 | EmailJS 2-template free-tier limit blocks new emails | High | All new emails use `boom_notification` with rich parameters (already the pattern in `stripe-webhook.js`). If founder upgrades plan, swap in dedicated templates as a 1-line change per call site. |
| 4 | wacli on Mac Mini offline → WhatsApp queue stalls silently | Low-Medium | Queue depth alert: if `whatsappQueue.where('status','==','pending').count > 50` → admin email. Fallback: Twilio escape hatch built but disabled (env flag). |
| 5 | `portal.html` 22K-line file becomes unmaintainable | Medium | Lazy-load buys runtime perf. Source readability is a separate problem; full module split is out of scope this sprint but flagged for post-launch v1.2. |
| 6 | Real prod data has shapes the schema doesn't expect (legacy maintenance, payments) | Medium | Lazy back-fill on first read, not bulk migration. Old shape is read-tolerant. Migration note documents anything that needs manual cleanup. |

---

## Open questions (resolve before Phase 1 starts)

1. **Voyage AI API key ready?** Phase 2 blocker (post-launch). Fallback OpenAI key on hand?
2. **`wacli` on Mac Mini** installed and tested? Phase 3.4 / 4.4 blocker for WhatsApp delivery. Need: install command verified, JID format confirmed for Italian numbers.
3. **EmailJS plan upgrade?** Stay free-tier (everything via `boom_notification`) or upgrade now to ship dedicated templates? Affects Phase 1 template setup.
4. **Firestore rules deployment cadence**: shadow mode for 24h, then flip — OK?
5. **`portal.html` file split**: explicitly out of scope per brief — confirm no objection.
6. **PR strategy**: single sprint PR (draft, kept open the whole sprint) or per-phase PRs? Brief says single draft PR — confirming.

---

## Verification plan (per phase + final)

### Per-phase smoke gate
- Branch is green (no syntax errors via `node -c` for API files; inline-script `new Function()` parse for portal.html).
- Existing portal still loads on Vercel preview deployment.
- All current admin tabs still render without console errors.
- Affected Magic Link entry points still work end-to-end.
- New collection writes are visible in Firebase console with expected shape.

### Phase-specific gates
- **Phase 1**: Magic Sign full happy-path with the new server-side IP capture; OTP enforcement in prod (skip refused).
- **Phase 3**: tenant creates ticket via magic link → landlord email + admin email + admin WhatsApp queued → admin assigns vendor → tenant gets status update email + WA → tenant marks resolved confirmation. Photos visible in Storage.
- **Phase 4**: contract Magic Sign success → 12 `rentPayments` generated → admin marks one paid → tenant receipt PDF generated → landlord magic link shows it. Cron fires T-5 reminder for next-month payment.
- **Phase 6.A**: Lighthouse mobile ≥85, desktop ≥95.
- **Phase 2**: Magic Sign success writes a `memories` doc with a non-zero embedding; `atlas-recall` of contract details returns top match with cosine ≥0.7.
- **Phase 5**: Lab tab shows last heartbeat from each tool within last 24h; trigger button writes a `toolJobs` doc that the runner picks up.

### Final launch checklist (pre-2026-06-01)
- [ ] **All 5 bug-debt items green** (non-negotiable; no slip to v1.1).
- [ ] **Atlas write-hooks live** on Magic Sign success, lead grading, contract creation, ticket_resolved, payment_late/disputed — verified by inspecting `pendingMemories` has growing docs in test traffic.
- [ ] All Phase 1, 3, 4 sub-phases green.
- [ ] Phase 6.A passed Lighthouse targets (or top blockers documented).
- [ ] Firestore rules live in prod, no `allow if true` left.
- [ ] Storage rules live in prod.
- [ ] All new env vars set in Vercel production.
- [ ] `BOOM_STATUS.md` updated.
- [ ] Migration note exists for any data backfill required.
- [ ] Smoke pass on real prod URL: every admin tab, ticket E2E, payment E2E, viewing E2E.
- [ ] Phase 2 + 5 placeholders in code (`pendingMemories` writes live, `agents` seed file ready) ready to be activated post-launch.

---

## Critical files (quick reference)

| Path | Lines | Role this sprint |
|---|---|---|
| `portal.html` | 22398 | Refactored Maintenance + Payments tabs; 5 bug fixes; new tenant/landlord magic-link views; lazy-load harness |
| `api/reminder-cron.js` | 161 | Extended for SLA breach + payment reminders T-5/T-0/T+3/T+7 |
| `api/sign-event.js` | NEW | Server-side IP capture + PDF SHA-256 for signature provenance |
| `api/admin-backfill-payments.js` | NEW | One-shot rentPayments back-fill |
| `api/atlas-remember.js` | NEW (Phase 2) | Memory write |
| `api/atlas-recall.js` | NEW (Phase 2) | Memory query |
| `firestore.rules` | NEW | Magic-link + admin gating rules |
| `storage.rules` | NEW | tickets/, receipts/, statements/ paths |
| `src/email-templates.js` | NEW | Single source of EmailJS template params |
| `src/wa-templates.js` | NEW | Single source of WhatsApp templates |
| `src/schemas.md` | NEW | All new-collection schemas |
| `docs/master-plan-2026-05-02.md` | NEW | Copy of this file (created in Phase 1) |
| `docs/migrations/2026-05-02.md` | NEW | Backfill instructions for prod data |
| `docs/vercel-env-checklist.md` | NEW | Env vars to add to Vercel dashboard |
| `wa_queue_drain.py` | NEW | Mac Mini WhatsApp queue drainer |
| `docs/wa-queue-setup.md` | NEW | Mac Mini install instructions |

---

## Out of scope (resist scope creep)

- Building Vesta, Mercurio, Marco, Claudius, Seneca agents (only registry placeholders + Atlas substrate).
- Stripe ↔ bank ↔ FattureInCloud reconciliation (Mercurio's job, future sprint).
- `portal.html` multi-file modular split.
- BOOM Shield landing page.
- Any change to public marketing site outside the portal.
- Any brand identity / color tokens beyond converging on `#D4AF37` for new code.
- Custom claims migration for admin role (defer; Firestore role-lookup pattern works).
- Wider code-quality audit (the brief's 5 explicit bugs are the scope).
