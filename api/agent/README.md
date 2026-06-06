# BOOM Agent Layer — Tool Contract

The HTTP surface Homie (and any future agent) uses to act on the portal.

Two-tier model:

- **Tier 1** — Homie may call directly. Auto-applied, reversible.
- **Tier 2** — Homie proposes via `/api/homie/action` (status `pending`), the operator approves via `/api/agent/execute`. Email/WhatsApp/contracts/signatures live here.

All endpoints share one secret: `X-Homie-Secret: <HOMIE_SECRET>` header. Same value already used by `/api/homie/inbound` and `/api/homie/action`.

Base URL: `https://boomrome.com/api/agent`

## Discovery

```
GET /api/agent/spec
```

Public, returns the JSON manifest of every tool with its input/output shape and tier. Read it once at boot; cache for 60s.

## Tools

| Tool | Tier | Effect |
|---|---|---|
| `leads.create` | 1 | Add a lead (Immobiliare/Idealista/WhatsApp/etc.) |
| `leads.update` | 1 | Update status, notes, grade, qualification |
| `messages.send` | 2 | Send email (Gmail) and/or return WhatsApp deep-link |
| `viewings.schedule` | 2 | Propose viewing slots |
| `contracts.draft` | 2 | Pre-compile a contract document (status `draft`) |
| `documents.create` | 1 | Upload/index a document into the archive (`documents` collection) |
| `documents.list` | 1 | Find/browse archived documents (by client, property, contract, type…) |
| `documents.update` | 1 | Organize: rename, re-tag, share, pin, reorder, archive |
| `magicsign.create` | 2 | Create a signature request on a custom PDF |
| `radar.scan` | 1 | Scan saved Radar searches, emit lead diffs |
| `state.snapshot` | 1 | Read-only portal state for quick answers |
| `risk.scan` | 1 | At-risk list (expiries, unsigned, overdue, stale A-leads) |
| `digest` | 1 | Daily briefing (leads + risks), optional email send |
| `ai.reply` | 1 | Claude-drafted personalized lead reply (IT/EN), draft-only |
| `execute` | 2 | Run a previously-proposed action_queue item |
| `heartbeat` | 0 | Keep the Cockpit's live indicator green |

## Typical flows

### 1. New WhatsApp lead arrives on Homie

```
1. Mac classifies the message → tier 1, grade B
2. POST /api/agent/leads.create  → { id: "abc123" }
3. (optional) Tier-2 reply draft → POST /api/homie/action  with
   kind='reply', payload={draft, channel:'whatsapp', recipient:phone}
4. Operator approves via Telegram → bot POSTs
   /api/agent/execute  { id: "<action_id>" }
5. Executor calls messages.send → wa-link or email goes out
6. action_queue.status = 'executed', activityLog entry written
```

### 2. Homie spots a price drop in Radar

```
1. Cron on Mac (every N hours): POST /api/agent/radar.scan
2. Server fetches the search page + diffs against knownListings
3. Each new listing / drop is written as a lead with source='radar:<name>'
4. Portal Dashboard surfaces them in the "Lead & Pipeline" section
5. (optional) Mac asks: POST /api/agent/state.snapshot { scope: 'leads' }
   → reports back to Telegram: "3 nuovi annunci a Parioli oggi"
```

### 3. Lead → Contract → Signature, one Telegram message

```
User on Telegram: "@homie chiudi il deal di Anna B. con Trastevere 4B,
                   €1200/mese, transitorio, parte il 1 luglio"

Homie does:
  POST /api/agent/contracts.draft {
    type: 'transitorio',
    propertyId: '<resolved>',
    tenantId: '<resolved>',
    startDate: '2026-07-01',
    rent: 1200,
    linkedLeadId: '<Anna's lead id>',
  }
  → { id: 'ctr-xyz', status: 'draft', ... }

  Then (after operator opens the contract once to generate the Allegato B PDF):
  POST /api/agent/magicsign.create {
    title: 'Contratto Trastevere 4B — Anna B.',
    pdfUrl: 'https://.../allegato-b.pdf',
    pageCount: 6,
    fields: [
      { page: 6, kind: 'signature', role: 'tenant',   xr: 0.55, yr: 0.78, wr: 0.30, hr: 0.06 },
      { page: 6, kind: 'signature', role: 'landlord', xr: 0.55, yr: 0.87, wr: 0.30, hr: 0.06 },
      { page: 6, kind: 'date',      role: 'tenant',   xr: 0.55, yr: 0.74, wr: 0.20, hr: 0.03 },
    ],
    signers: {
      tenant:   { name: 'Anna Bianchi', email: 'anna@...' },
      landlord: { name: 'Valentino',    email: 'valentino@...' },
    },
    contractId: 'ctr-xyz',
  }
  → { id: 'sr-abc', signLinks: { tenant: '…', landlord: '…' } }

Homie replies on Telegram:
  "Bozza creata + 2 link di firma pronti. Approva?  /approva ctr-xyz"
```

### 4. Homie files a document into the archive

```
Homie produces (or receives) a PDF — a signed contract copy, an ID scan,
a receipt — and files it where the operator and the counterparty can find it:

POST /api/agent/documents.create {
  name: 'Contratto firmato — Anna B.',
  fileUrl: 'https://.../signed.pdf',     // or fileBase64 for raw bytes
  type: 'contract',
  category: 'locazione',
  tenantId: '<Anna>',  landlordId: '<Valentino>',  propertyId: '<Trastevere 4B>',
  contractId: 'ctr-xyz',
  tags: ['2026', 'transitorio'],
  externalId: 'homie:signed:ctr-xyz',    // idempotent — safe to retry
}
→ { id: 'doc-123', fileUrl: '…', archived: true }

It then appears in the portal's "Archivio Documentale" (source 🤖 Homie) and,
because a tenant + landlord were linked, in their own portals (getMyDocuments).

Find + organize later:
POST /api/agent/documents.list   { propertyId: '<Trastevere 4B>', type: 'contract' }
POST /api/agent/documents.update { id: 'doc-123', pinned: true, tags: ['2026','firmato'] }
```

### 5. Heartbeat

```
Every ~30s OR after every tool call:
POST /api/agent/heartbeat { status: 'live', activeTool: 'leads.create', queueLen: 2 }
```

The cockpit's top-bar dot reflects time-since-lastSeenAt:
- < 2 min → green
- 2–5 min → yellow
- 5–15 min → red
- > 15 min → grey "offline"

## Idempotency rules

- `execute` is fully idempotent: re-calling on an already-executed action returns the cached result.
- `magicsign.create` is NOT idempotent — pass a stable `contextHash` via the Homie-action layer instead if you need dedup.
- `leads.create` is NOT idempotent — use `sourceRef` when re-emitting from upstream pollers.
- `documents.create` IS idempotent when given `externalId` — a repeat call with the same key patches the existing doc instead of creating a duplicate.

## Error shape

Every endpoint returns `{ ok: true, ... }` on success or `{ ok: false, error: '<code>', details?: any }` on failure. HTTP codes:

| Code | Meaning |
|---|---|
| 200 | OK (`ok: true`) |
| 400 | Validation / missing required field |
| 401 | Bad or missing `X-Homie-Secret` |
| 404 | Resource not found (lead, contract, action) |
| 405 | Wrong HTTP method |
| 422 | Action kind has no executor mapping |
| 500 | Server error |
| 502 | Downstream tool failed (during execute) |

## Activity log

Every tool writes one entry to the `activityLog` collection:

```
{ action: 'Lead creato (agent)', category: 'lead', actor: 'homie',
  details: { leadId, ... }, createdAt: <ts> }
```

So nothing Homie does is invisible — operators can audit everything from the portal's Activity Log page or from a future cockpit timeline.
