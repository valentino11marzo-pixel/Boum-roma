# Firestore Rules — automated tests

Proves `firestore.rules` behaves correctly **before** you deploy it to the
live Firebase project. Runs against the local Firestore emulator; touches
nothing in production.

## What it checks (90 assertions)

- **Admin** can read/write everything (contracts, leads, pfsClients, config).
- **Tenant A** reads only their own contract / payment / maintenance / user
  doc and the property they rent — and is **denied** tenant B's data, the
  lead pool, pfsClients, the parse-docs bearer, and other users.
- **Tenant** self-service still works: create maintenance (own userId),
  flag a payment reported (allowed fields only), sign their own contract
  (signature fields only) — and is blocked from changing amount, rent, or
  their own role.
- **Landlord A** reads NOTHING operational from the browser (since
  22/09/2026 the owner reads only through `/api/owner/*`, a clean server-side
  projection): denied its own property, contracts, payments, maintenance,
  shared documents, documents carrying its own `userId` (the activation copy
  of an unsigned PDF), and conversations/messages assigned to it. It still
  reads its own `users` doc, its own `invoices` (`recipientId`), its own
  `documentShares` and `taxPacks`; cannot write properties or read the lead
  pool, and cannot create, update or delete a `documents` record either (a
  `shared` document created by a landlord would reach that home's tenant
  as a BOOM-branded link to anywhere). The tenant keeps its own documents and the shared ones of the
  property it rents.
- **Own `users` doc** (since 23/09/2026): a landlord or tenant still writes
  its own name, phone, `lastLogin`, onboarding, push and identity fields, but
  is **denied** `role`, `email`, `authUid`, `ownerAliases` and the owner
  invite stamps (`ownerInvitedAt/By`, `ownerInviteSentAt`,
  `ownerPortalFirstAt`) and the admin's vouching stamps (`accountConfirmedAt/By`) — also when slipped in next to an allowed field.
  A self-written `ownerAliases` let a landlord read another owner's
  statements and documents through `/api/owner/*`; a self-written `email`
  let the owner invite pick the wrong account.
- **Anonymous** is denied all private reads but can POST a viewingRequest
  (public booking form).
- **Default-deny** catch-all blocks any undeclared collection.

## Run

```bash
cd tests/rules
npm install          # first time only (firebase-tools is global; see below)
./run-tests.sh
```

`run-tests.sh` copies the canonical `../../firestore.rules` into this folder
(the emulator only reads rules inside its project dir), boots the Firestore
emulator on a throwaway `demo-` project (no Firebase login required), runs
`runner.mjs`, and tears the emulator down.

Requires: Node 18+, Java 17+ (for the emulator), and `firebase-tools`
(`npm i -g firebase-tools`).

Expected output ends with:

```
Result: 90 passed, 0 failed
All rules behave as intended.
```

The `PERMISSION_DENIED` lines printed mid-run are **expected** — they are the
emulator logging the operations the tests intentionally assert are blocked.

## When to run

Any time you edit `firestore.rules`. Re-run before every `firebase deploy
--only firestore:rules`.
