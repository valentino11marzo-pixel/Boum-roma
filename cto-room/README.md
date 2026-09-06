# BOOM CTO ROOM

Working documents for the technical re-foundation of BOOM (Egidi Immobiliare S.r.l. → BOOM, Rome).
Written 2026-09-06 from a read-only audit of this repository at commit `aed13c8` (branch `main`,
PR #231) plus an anonymous probe of the production Firestore catalog. Nothing in the repository was
modified by the audit; this folder is documentation only.

| File | What it is |
|---|---|
| `01-DOSSIER-CURRENT-STATE.md` | **BOOM SYSTEM INTELLIGENCE DOSSIER — CURRENT STATE.** Reconstruction of what exists today: architecture, data, lifecycle, Homie, AI, money, documents, auth, deployment, observability, security, privacy, debt, duplicates, bottlenecks, what to keep/improve/replace, missing foundations. 28 sections. |
| `02-TARGET-ARCHITECTURE.md` | **BOOM GLOBAL SYSTEM — TARGET ARCHITECTURE.** The achievable evolution: modules and boundaries, the canonical transaction, BOOM PASS, event-driven concierge, global/Italy/Rome layering, business architecture, design direction, human+AI approval architecture, engineering principles, migration strategy. |
| `03-PRIORITIES-AND-HANDOFF.md` | **NOW / NEXT / LATER**, five things to stop, five levers, and the **HANDOFF TO BOOM CTO ROOM** package for any other engineer or model continuing the work. |

## Evidence discipline

Every material claim in these documents carries one of four labels:

- **VERIFIED** — read directly in code, configuration, tests, or observed in production data.
- **INFERRED** — strongly suggested by the code or by first-hand documents in the repo, not directly observed.
- **UNKNOWN** — cannot be determined from the repository or from the access available to the audit.
- **LEGACY** — present in the repository but unreferenced, superseded, or explicitly retired.

Citations use `path:line` against commit `aed13c8`. Where the audit relied on `CLAUDE.md` (the 268 KB
project guide written by previous AI sessions), the guide's statements were treated as claims and checked
against code; the dossier notes where the guide is stale.

## Access the audit had

- Full read access to the repository (shallow clone: 57 commits, 2026-08-20 → 2026-09-05, PRs #182–#231;
  earlier history exists on GitHub but was not fetched).
- Anonymous read of the public Firestore collections (`listings`, `publicGeo`) using the web API key already
  shipped in the site, exactly as a visitor's browser does. No credentials, no admin data, no Stripe, no
  Telegram, no Mac mini access. Anything about the runtime state of those systems is labelled UNKNOWN.

## How to use this folder

1. Read `01` § 1 (executive reconstruction) and § 25–28 (keep / improve / replace / missing) first.
2. Read `02` § 1–3 for the target module boundaries and the canonical transaction.
3. Read `03` for the order of work and the handoff facts.
4. Do not treat the target architecture as a rewrite plan. It is a strangler plan over the existing
   Firebase + Vercel estate; § 12 of `02` explains the sequence.
