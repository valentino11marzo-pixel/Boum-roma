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
- **Sign tokens** (`signTokens/*`) are admin-only: neither party can read the
  other's Magic-Sign credential, and no one (admin included) can add or change
  `tenantSignToken`/`landlordSignToken` on a contract — removing them (the
  migration) is allowed.
- **Default-deny** catch-all blocks any undeclared collection.
- **Palazzo — le porte del ruolo landlord** (12/10/2026): le manopole interne
  di `settings` (registrazione, ai, costi carta/SEPA, calendario, agenti) sono
  solo dell'admin, `company` e `canoneAccordo` solo per account veri,
  `video` resta pubblico;
  un guasto si apre solo sul proprio interno (mai anonimo, mai `reporter`/
  `source` dal browser) e solo col contratto VIVO: l'ex inquilino (stato
  chiuso subito; fine o chiusura anticipata passate da oltre 60 giorni) non
  apre più guasti sull'interno che ha lasciato, la seconda stanza attiva sì,
  e un contratto rimasto «active» da poco oltre la fine sì (13/10/2026:
  mutazione — con la regola di prima cadono 7 controlli); la proprietaria non legge Inbox,
  note interne né analisi AI; il suo loader a blocchi di 9 interni passa, un
  blocco con un immobile non suo no; `paymentCosts` admin-only (la
  collection è pronta: i campi di costo li sposta lì il webhook, filone soldi).

### Storage (`storage.mjs`)

Le regole Storage leggono il ruolo da Firestore, quindi girano con DUE
emulatori (`--only firestore,storage`). Provano che la proprietaria non
elenca né scarica le cartelle degli altri (documents/, payment-proofs/,
maintenance/ — il difetto `|| isLandlord()`), che il titolare e l'admin
leggono le proprie, e che l'admin carica il contratto su carta in
`contracts/<id>/contratto-carta-<ts>.pdf`. `run-tests.sh` copia
`storage.rules` per la durata della prova e la cancella all'uscita.
Mutazione verificata: con le regole precedenti cadono 11 controlli su 23.

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
Result: 167 passed, 0 failed
All rules behave as intended.
```

The `PERMISSION_DENIED` lines printed mid-run are **expected** — they are the
emulator logging the operations the tests intentionally assert are blocked.

## When to run

Any time you edit `firestore.rules`. Re-run before every `firebase deploy
--only firestore:rules`.
