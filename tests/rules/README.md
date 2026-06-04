# Firestore Rules — automated tests

Proves `firestore.rules` behaves correctly **before** you deploy it to the
live Firebase project. Runs against the local Firestore emulator; touches
nothing in production.

## What it checks (39 assertions)

- **Admin** can read/write everything (contracts, leads, pfsClients, config).
- **Tenant A** reads only their own contract / payment / maintenance / user
  doc and the property they rent — and is **denied** tenant B's data, the
  lead pool, pfsClients, the parse-docs bearer, and other users.
- **Tenant** self-service still works: create maintenance (own userId),
  flag a payment reported (allowed fields only), sign their own contract
  (signature fields only) — and is blocked from changing amount, rent, or
  their own role.
- **Landlord A** reads only their own properties + the contracts/payments on
  them; denied landlord B's data and the lead pool; cannot write properties.
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
Result: 39 passed, 0 failed
All rules behave as intended.
```

The `PERMISSION_DENIED` lines printed mid-run are **expected** — they are the
emulator logging the operations the tests intentionally assert are blocked.

## When to run

Any time you edit `firestore.rules`. Re-run before every `firebase deploy
--only firestore:rules`.
