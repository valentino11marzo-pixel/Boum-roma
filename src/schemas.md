# BOOM Firestore Schemas

> Single source of truth for collections introduced or extended in the **Master Sprint 2026-05-02**. Every new collection added during this sprint is documented here BEFORE first write. Phase 2 / Phase 5 collections are placeholder-documented; their writers ship post-launch as v1.1.

---

## Conventions

- **camelCase** field names. No snake_case, no kebab-case.
- **Timestamps**: Firestore `timestampValue` (server-side `firebase.firestore.FieldValue.serverTimestamp()` for `createdAt`/`updatedAt`; ISO-8601 strings only when the value originates outside Firestore — e.g. user-supplied dates).
- **Money fields use float euro** (e.g. `1450.00`) for v1.0 consistency with existing code (`contract.rent`, `c.deposit`, `payment.amount` are all float in `portal.html`). **Known floating-point precision risk on accumulation/aggregation operations.** Mercurio (Phase v1.2+) will introduce a dedicated `paymentsCents` mirror field on `rentPayments` and `paymentEvents` (integerValue cents) for accurate reconciliation against Stripe / bank statements / FattureInCloud. Until then, **all aggregations must use `Math.round(sum * 100) / 100`** to avoid drift.
- **Foreign keys**: store the document ID only (e.g. `tenantId: "uid_abc"`), never the path. Resolve via `db.collection(X).doc(id).get()`.
- **Atlas idempotency flags**: every write-hook event has its own per-type boolean on the source doc (e.g. `atlasContractSignedEmitted`, `atlasGradeEmitted`, `atlasResolvedEmitted`, `atlasLateEmitted`, `atlasDisputedEmitted`). NEVER a single `atlasEventEmitted` boolean — different event types must be emittable independently.
- **Soft delete**: prefer `deletedAt: timestamp | null` over hard delete for any doc that may have downstream references.
- **String enums**: documented as TypeScript-style union (`'a' | 'b'`) but stored as plain `stringValue`. No Firestore enum primitive.
- **Session-sliding magic tokens**: long-lived magic tokens (e.g. `maintenanceTickets.tenantMagicToken` and `landlordMagicToken`, TTL 30d) refresh on access. Each authenticated read of the token updates `<token>LastAccessedAt` to server time, and the effective expiry is `<token>LastAccessedAt + 30d` rather than `createdAt + 30d`. This keeps frequent users authenticated while letting abandoned sessions expire naturally. The 1-hour single-use Magic Sign token (post-firma `magicLinks` collection, pre-existing) does NOT use sliding — it's deliberately ephemeral.
- **Verification codes (deterministic, human-readable)**: `verificationCode` fields use **base32 Crockford** (charset `0123456789ABCDEFGHJKMNPQRSTVWXYZ`, i.e. digits 0-9 plus uppercase A-Z **excluding I, L, O, U** to remove visual/aural ambiguity). Algorithm: `SHA-256(input1 + input2 + ...)` → base32 Crockford encoding → take first 12 chars → prepend `BOOM-`. Example output: `BOOM-X7K2P9M4N5R8`. Rationale: dictatable over phone/WhatsApp without confusion, printable on receipts and PDFs without OCR risk.
- **Adding a new collection**: append a new H2 here, follow the same template (Purpose / Fields / Indices / Write paths / Lifecycle / Atlas hooks). Update the index list at the bottom.

---

## Phase 1 collections (live from launch)

### `maintenanceTickets`

**Purpose.** 3-sided ticketing replacing the legacy `maintenance` collection. Tenant opens via Magic Link; landlord receives notification + read+comment Magic Link; admin has full CRUD.

**Lifecycle.** `open → triaged → assigned → in_progress → resolved → closed`. Branch: `resolved → open` (tenant rejects fix, "reopen"). Branch: any → `disputed` when cost allocation conflicts.

**Fields.**

| Field | Type | Notes |
|---|---|---|
| `id` | string (auto) | Firestore doc ID |
| `tenantId` | string | `users/{id}` — opener |
| `landlordId` | string | `users/{id}` — property owner |
| `propertyId` | string | `properties/{id}` |
| `contractId` | string \| null | `contracts/{id}` — optional traceability |
| `title` | string | ≤ 120 chars |
| `category` | string union | `'plumbing' \| 'electrical' \| 'appliance' \| 'structural' \| 'heating-ac' \| 'internet' \| 'other'` |
| `severity` | string union | `'low' \| 'medium' \| 'high' \| 'urgent'` |
| `description` | string | ≤ 5000 chars |
| `attachments` | array | `[{ path, contentType, size, uploadedAt }]` — Storage paths under `tickets/{ticketId}/` |
| `status` | string union | see Lifecycle above |
| `statusHistory` | array | `[{ from, to, at, by, note? }]` — append-only |
| `vendorName` | string \| null | assigned external technician |
| `vendorPhone` | string \| null | E.164 |
| `vendorEta` | timestamp \| null | scheduled visit |
| `costEstimate` | float \| null | EUR |
| `costFinal` | float \| null | EUR |
| `costAllocation` | string union | `'landlord' \| 'tenant' \| 'boom' \| 'split'` — default rule: structural/heating/appliance → landlord; consumables → tenant |
| `costSplitPct` | object \| null | `{ landlord: number, tenant: number, boom: number }` — only when allocation is `'split'`; sum must be 100 |
| `slaTargetAt` | timestamp | computed at create from severity (urgent=4h, high=24h, medium=72h, low=7d) |
| `slaBreached` | boolean | flipped to `true` by `reminder-cron.js` when `now > slaTargetAt && status not in [resolved, closed]` |
| `slaBreachedAt` | timestamp \| null | first time `slaBreached` flipped to true |
| `comments` | array | `[{ id, author: 'tenant'\|'landlord'\|'admin'\|'vendor', authorName, body, at, attachments? }]` |
| `tenantMagicToken` | string \| null | issued at create; **session-sliding 30d** (see Conventions) — refresh on access |
| `tenantMagicTokenLastAccessedAt` | timestamp \| null | server time of last authenticated read; effective expiry = this + 30d |
| `landlordMagicToken` | string \| null | issued at create; **session-sliding 30d** (see Conventions) — for read+comment |
| `landlordMagicTokenLastAccessedAt` | timestamp \| null | server time of last authenticated read; effective expiry = this + 30d |
| `tokenExpiresAt` | timestamp | hard cap (createdAt + 365d) regardless of sliding refresh — safety stop |
| `createdAt` | timestamp | server time |
| `createdBy` | string | userId or `'magic_link:tenant'` or `'admin:{uid}'` |
| `updatedAt` | timestamp | server time |
| `resolvedAt` | timestamp \| null | when status → `resolved` |
| `closedAt` | timestamp \| null | when status → `closed` |
| `atlasResolvedEmitted` | boolean | idempotency flag for `writePendingMemory('ticket_resolved', ...)` |

**Indices.**
- `status` ASC + `slaTargetAt` ASC (overdue queries)
- `landlordId` ASC + `status` ASC (landlord magic-link list)
- `propertyId` ASC + `status` ASC
- `tenantId` ASC + `createdAt` DESC

**Write paths.**
- Tenant Magic Link: create + append to `comments` + flip status `resolved → open` (reopen).
- Landlord Magic Link: append to `comments` only.
- Admin: full CRUD.

**Atlas hooks.** On status `resolved`: `writePendingMemory('ticket_resolved', summary, { propertyId, tenantId, landlordId, contractId, ticketId, tags: [category, severity] }, 'tickets')`. Set `atlasResolvedEmitted: true` in the same write.

---

### `rentPayments`

**Purpose.** Source of truth for rent payments. Generated at Magic Sign full-signature success (one doc per month of contract duration).

**Lifecycle.** `scheduled → paid | partial | late | disputed`. Plus orthogonal `forwardedToLandlord` boolean (BOOM may collect first, then forward net of commission).

**Fields.**

| Field | Type | Notes |
|---|---|---|
| `id` | string | auto |
| `contractId` | string | `contracts/{id}` |
| `tenantId` | string | `users/{id}` |
| `landlordId` | string | `users/{id}` |
| `propertyId` | string | `properties/{id}` |
| `period` | string | `'YYYY-MM'` (e.g. `'2026-06'`) |
| `dueDate` | timestamp | day of month from `contract.paymentDay` (default 5) |
| `amount` | float | EUR — equals `contract.rent` at generation time |
| `status` | string union | `'scheduled' \| 'paid' \| 'late' \| 'partial' \| 'disputed'` |
| `paidAt` | timestamp \| null | when admin marked paid |
| `paidAmount` | float \| null | for `partial`, the amount actually received |
| `paidMethod` | string union \| null | `'wire' \| 'cash' \| 'stripe' \| 'other'` |
| `paidRef` | string \| null | bank ref / Stripe ID / receipt-screenshot Storage path |
| `forwardedToLandlord` | boolean | default `false` |
| `forwardedAt` | timestamp \| null | when BOOM transferred to landlord |
| `forwardedAmount` | float \| null | net of commission |
| `forwardedRef` | string \| null | bank transfer reference |
| `boomCommission` | float \| null | EUR |
| `receiptPath` | string \| null | Storage `receipts/{paymentId}/receipt.pdf` (auto-generated on `paid`) |
| `reminderT5dSent` | boolean | T-5 days reminder fired |
| `reminderT0Sent` | boolean | due-date reminder fired |
| `reminderT3pSent` | boolean | T+3 overdue reminder fired |
| `reminderT7pSent` | boolean | T+7 admin escalation fired |
| `disputeNote` | string \| null | when status → `disputed` |
| `createdAt` | timestamp | server time |
| `createdBy` | string | `'magic_sign:hook'` or `'admin:{uid}'` or `'backfill:script'` |
| `updatedAt` | timestamp | server time |
| `atlasLateEmitted` | boolean | idempotency for `writePendingMemory('payment_late', ...)` |
| `atlasDisputedEmitted` | boolean | idempotency for `writePendingMemory('payment_disputed', ...)` |

**Indices.**
- `status` ASC + `dueDate` ASC (admin overdue queries; cron candidate selection)
- `tenantId` ASC + `period` DESC (tenant magic-link list)
- `landlordId` ASC + `period` DESC (landlord magic-link list + monthly statement)
- `propertyId` ASC + `period` DESC
- `forwardedToLandlord` ASC + `paidAt` DESC (admin "owed-to-landlord" view)

**Write paths.**
- Magic Sign success hook: bulk create N docs (one per month).
- `api/admin-backfill-payments.js`: bulk create for already-active contracts.
- Tenant Magic Link: read-only.
- Landlord Magic Link: read-only.
- Admin: mark paid/partial/disputed/forwarded; reminder flags flipped by cron.
- `reminder-cron.js`: flip reminder flags + status to `late` when due+3 still unpaid.

**Atlas hooks.**
- `payment_late`: when status flips to `late` and `atlasLateEmitted === false` → emit + flip flag.
- `payment_disputed`: when status flips to `disputed` and `atlasDisputedEmitted === false` → emit + flip flag.

---

### `paymentEvents`

**Purpose.** Append-only audit log for everything that happens to a `rentPayments` doc. Mercurio (v1.2+) reads this to reconcile against Stripe / bank statements.

**Lifecycle.** None — append-only, never updated, never deleted.

**Fields.**

| Field | Type | Notes |
|---|---|---|
| `id` | string | auto |
| `paymentId` | string | `rentPayments/{id}` |
| `contractId` | string | denormalized for log queries |
| `event` | string union | `'scheduled' \| 'reminder_t5' \| 'reminder_t0' \| 'reminder_t3' \| 'reminder_t7' \| 'marked_paid' \| 'marked_partial' \| 'marked_disputed' \| 'forwarded' \| 'reopened'` |
| `by` | string | userId or `'cron'` or `'magic_link:tenant'` or `'admin:{uid}'` or `'magic_sign:hook'` |
| `at` | timestamp | server time |
| `details` | object | event-specific (e.g. `{ amount, method, ref }` for `marked_paid`) |

**Indices.**
- `paymentId` ASC + `at` DESC (per-payment timeline)
- `contractId` ASC + `at` DESC (contract-wide timeline)

**Write paths.** Anywhere a `rentPayments` write happens, a `paymentEvents` write follows in the same logical operation. **Both writes succeed or neither** (use Firestore batched writes where possible).

---

### `whatsappQueue`

**Purpose.** Server-side code (Vercel functions, portal admin actions, cron) writes to this queue; Mac Mini drainer (`wa_queue_drain.py`) polls every ~30s, sends via `wacli`, updates status.

**Fields.**

| Field | Type | Notes |
|---|---|---|
| `id` | string | auto |
| `to` | string | JID — Italian format `+39NNNNNNNNNN@s.whatsapp.net` |
| `template` | string | key from `src/wa-templates.js` (e.g. `'ticketLandlordCreated'`) |
| `variables` | object | `Record<string, string>` — substitutions for the template body |
| `scheduledAt` | timestamp | usually `now`; can be future for delayed sends |
| `status` | string union | `'pending' \| 'sent' \| 'failed' \| 'skipped'` |
| `attempts` | integer | drainer increments on each try; max 3 |
| `lastError` | string \| null | error message from last failed attempt |
| `priority` | string union | `'low' \| 'normal' \| 'high'` — drainer processes high first |
| `createdAt` | timestamp | server time |
| `createdBy` | string | source: `'tickets'`, `'payments'`, `'viewings'`, etc. |
| `sentAt` | timestamp \| null | drainer sets on success |
| `drainedBy` | string \| null | `'mac-mini-OpenClaw'` or `'twilio-fallback'` (latter disabled in v1.0) |

**Indices.**
- `status` ASC + `priority` DESC + `scheduledAt` ASC (drainer query: pending where scheduledAt ≤ now, ordered)

**Write paths.** Server-side only. Tenant / landlord clients NEVER write here directly.

**Alerting.** When `count(status == 'pending') > 50` → admin email. Means Mac Mini is offline or wacli is hung.

---

### `signatureEvents`

**Purpose.** Append-only provenance record for every contract signature. Replaces the literal `'collected'` IP placeholder at `portal.html:2048,2055`. Captures real IP server-side from `x-forwarded-for`, computes real PDF SHA-256.

**Lifecycle.** None — append-only.

**Fields.**

| Field | Type | Notes |
|---|---|---|
| `id` | string | auto |
| `contractId` | string | `contracts/{id}` |
| `role` | string union | `'tenant' \| 'landlord'` |
| `signerUserId` | string \| null | `users/{id}` if known |
| `signerName` | string | from contract data |
| `signerEmail` | string | from contract data |
| `ipAddress` | string | server-captured from `x-forwarded-for` (first hop) |
| `userAgent` | string | client UA, ≤ 200 chars |
| `pdfHash` | string | hex SHA-256 of the actual signed PDF buffer |
| `signedAt` | timestamp | server time at endpoint receipt |
| `magicTokenConsumed` | boolean | always `true` (token itself is NOT stored) |
| `verificationCode` | string | `'BOOM-' + first 12 chars of base32-Crockford(SHA-256(contractId + signedAt + pdfHash))`. Charset `0123456789ABCDEFGHJKMNPQRSTVWXYZ` (no I/L/O/U). Example: `BOOM-X7K2P9M4N5R8`. Deterministic from inputs — re-derivable from the contract for receipt verification. See Conventions §Verification codes. |

**Indices.**
- `contractId` ASC + `signedAt` ASC

**Write paths.** Only `api/sign-event.js` writes here. Portal calls fetch on submit; the endpoint validates the magic token, computes hash, captures IP, writes the event, then patches the `contracts` doc with the in-portal signature blob unchanged.

---

### `pendingMemories`

**Purpose.** Atlas write-hook stub queue. Phase 1 wires existing flows (Magic Sign success, lead grading) to this collection so the 30 days of post-launch events are captured. Phase 2 (v1.1) drains via `api/atlas-drain.js` — embeds each entry, writes to `memories`, marks `drained: true`. Schema is **frozen day-one** — no breaking change between Phase 1 and Phase 2.

**Lifecycle.** `created (drained: false) → drained (drained: true)`. Optional cleanup after 30 days post-drain.

**Fields.**

| Field | Type | Notes |
|---|---|---|
| `id` | string | auto |
| `type` | string union | `'magic_sign_success' \| 'lead_graded' \| 'ticket_resolved' \| 'payment_late' \| 'payment_disputed'` (Phase 1 set; v1.1+ may extend with `'viewing_completed'`, `'pfs_paid'`, etc.) |
| `content` | string | free-form text — what would be embedded by Atlas. Must include enough context to be useful in a recall (names, addresses, amounts, dates). ≤ 4000 chars. |
| `metadata` | object | see below |
| `metadata.propertyId` | string \| null | |
| `metadata.tenantId` | string \| null | |
| `metadata.landlordId` | string \| null | |
| `metadata.contractId` | string \| null | |
| `metadata.leadId` | string \| null | |
| `metadata.ticketId` | string \| null | |
| `metadata.paymentId` | string \| null | |
| `metadata.viewingId` | string \| null | |
| `metadata.pfsClientId` | string \| null | |
| `metadata.tags` | array | `string[]` — free-form labels |
| `source` | string | originating subsystem: `'magic-sign'`, `'leads'`, `'tickets'`, `'payments'`, `'viewings'`, `'pfs'` |
| `createdAt` | timestamp | server time |
| `drained` | boolean | default `false`; v1.1 Atlas drain endpoint flips to `true` |
| `drainedAt` | timestamp \| null | set on drain |
| `embedded` | object \| null | populated on drain: `{ provider: 'voyage'\|'openai', model: string, dim: integer }` |
| `memoryId` | string \| null | `memories/{id}` reference, set on drain |

**Indices.**
- `drained` ASC + `createdAt` ASC (drainer query: oldest undrained first)

**Write paths.**
- `writePendingMemory(type, content, metadata, source)` helper — called fire-and-forget from portal client (Magic Sign success, lead grading) AND from server functions (future hooks).
- `api/atlas-drain.js` (v1.1): patches `drained`, `drainedAt`, `embedded`, `memoryId`.

**Idempotency contract.** Every Phase 1 write-hook call MUST first check the source-doc flag (e.g. `contracts.atlasContractSignedEmitted`). If `false`, write to `pendingMemories` AND set the flag in the same logical operation. If `true`, no-op. This prevents duplicate memories on retry / rerun.

---

## v1.1+ collections (placeholder)

These ship in Phase 2 (Atlas full activation) and Phase 5 (Lab Cockpit). Documented now so consumers (e.g. `agents` registry referenced from Lab) can be wired without surprise.

### `agents` (Phase 2)

Registry of Pantheon members. Seeded with 9 docs at Phase 2 start.

| Field | Type |
|---|---|
| `id` | string (matches name slug, e.g. `'greta'`) |
| `name` | string |
| `role` | string |
| `tier` | integer (1, 2, 3) |
| `status` | `'active' \| 'dormant' \| 'draft' \| 'planned'` |
| `lastHeartbeat` | timestamp \| null |
| `capabilities` | string[] |
| `dependsOn` | string[] (other agent IDs) |
| `createdAt` | timestamp |
| `updatedAt` | timestamp |

### `agentEvents` (Phase 2)

Per-action log. Append-only.

| Field | Type |
|---|---|
| `agentId` | string |
| `timestamp` | timestamp |
| `action` | string |
| `input` | object (sanitized) |
| `output` | object |
| `escalatedToHuman` | boolean |
| `decisionOutcome` | string \| null (filled when human decision lands) |

### `memories` (Phase 2)

Atlas's main store after embedding.

| Field | Type |
|---|---|
| `type` | string union (matches `pendingMemories.type` plus future) |
| `content` | string |
| `embedding` | array (float[]) — vector |
| `metadata` | object (mirrors `pendingMemories.metadata`) |
| `source` | string |
| `originalPendingId` | string \| null (link back to source pending doc if drained) |
| `createdAt` | timestamp |

### `toolHeartbeats` (Phase 5)

Per-tool last-run record.

| Field | Type |
|---|---|
| `toolId` | string (e.g. `'listing-scout'`) |
| `lastRunAt` | timestamp |
| `lastRunStatus` | `'ok' \| 'partial' \| 'error'` |
| `metrics` | object (tool-specific KPIs) |
| `runner` | string (`'mac-mini-OpenClaw'` \| `'vercel-cron'`) |

### `toolJobs` (Phase 5)

Whitelisted manual triggers from Lab.

| Field | Type |
|---|---|
| `toolId` | string |
| `requestedBy` | string (admin uid) |
| `requestedAt` | timestamp |
| `status` | `'queued' \| 'running' \| 'done' \| 'failed'` |
| `result` | object \| null |

---

## Existing collections touched this sprint

These already exist in production. Listing only the **new fields** added by this sprint — no schema redoc.

### `contracts` (additions)
| Field | Type | Phase | Notes |
|---|---|---|---|
| `atlasContractSignedEmitted` | boolean | 1 | Idempotency for `writePendingMemory('magic_sign_success', ...)` on full-signature completion |
| `pdfRegeneratedAfterSign` | boolean | 1 | Already referenced in code; formalize as part of bug-debt #1 |

### `leads` (additions)
| Field | Type | Phase | Notes |
|---|---|---|---|
| `atlasGradeEmitted` | boolean | 1 | Idempotency for `writePendingMemory('lead_graded', ...)` |

---

## Indices to create in Firebase Console (before deploy)

Run before merging Phase 1 to main. List for the founder to copy into Firestore Console → Indexes:

| Collection | Fields | Order |
|---|---|---|
| `maintenanceTickets` | `status`, `slaTargetAt` | ASC, ASC |
| `maintenanceTickets` | `landlordId`, `status` | ASC, ASC |
| `maintenanceTickets` | `propertyId`, `status` | ASC, ASC |
| `maintenanceTickets` | `tenantId`, `createdAt` | ASC, DESC |
| `rentPayments` | `status`, `dueDate` | ASC, ASC |
| `rentPayments` | `tenantId`, `period` | ASC, DESC |
| `rentPayments` | `landlordId`, `period` | ASC, DESC |
| `rentPayments` | `propertyId`, `period` | ASC, DESC |
| `rentPayments` | `forwardedToLandlord`, `paidAt` | ASC, DESC |
| `paymentEvents` | `paymentId`, `at` | ASC, DESC |
| `paymentEvents` | `contractId`, `at` | ASC, DESC |
| `whatsappQueue` | `status`, `priority`, `scheduledAt` | ASC, DESC, ASC |
| `signatureEvents` | `contractId`, `signedAt` | ASC, ASC |
| `pendingMemories` | `drained`, `createdAt` | ASC, ASC |

---

## Storage paths

All new sprint paths under bucket `boom-property-dashboards.appspot.com` (or whichever the env confirms in Phase 1).

| Path pattern | Owner | Read | Write |
|---|---|---|---|
| `tickets/{ticketId}/{file}` | tenant who created ticket | tenant (own ticket via magic link), landlord (own property via magic link), admin | tenant (create), admin |
| `receipts/{paymentId}/receipt.pdf` | system (auto-generated on `marked_paid`) | tenant (own payment), landlord (own property), admin | system only (`api/*` write via REST) |
| `statements/{landlordId}/{period}/statement.pdf` | system (monthly cron day 5) | landlord (own statement via magic link), admin | system only |

Storage rules implementing the access matrix above are written in `storage.rules` (Phase 1.9).

---

## Index of collections covered

**Phase 1 (live from launch):**
1. `maintenanceTickets`
2. `rentPayments`
3. `paymentEvents`
4. `whatsappQueue`
5. `signatureEvents`
6. `pendingMemories`

**Phase 2 (v1.1):**
7. `agents`
8. `agentEvents`
9. `memories`

**Phase 5 (v1.1):**
10. `toolHeartbeats`
11. `toolJobs`

**Existing, extended:**
- `contracts` (`atlasContractSignedEmitted`, `pdfRegeneratedAfterSign`)
- `leads` (`atlasGradeEmitted`)

Last updated: 2026-05-03 (Phase 1 of Master Sprint 2026-05-02).
