# LA SCHEDA — Anagrafica cliente universale

> **STATO**: Fase 1 IMPLEMENTATA (api/profile/* + scheda.html + swap Share
> Hub + fix fallback Allegato B/C + doppio schema users in magic-sign) e
> in più il generatore Allegato C ora monta il contratto tipo
> dell'associazione (accordo Roma 27.07.2023, prot. RA/2023/0044852).
> Suite `tests/scheda/run.mjs` (36 check) verde. Vedi CLAUDE.md → "La
> Scheda" per il riferimento operativo.

**Data**: Luglio 2026
**Domanda dell'operatore**: "Per i clienti che non ho onboardato con la pre-agreement page mi ritrovo senza anagrafica e la devo reinserire io. Serve un modo più universale e moderno. La devo sempre fare col Magic Sign o no?"
**Metodo**: lettura completa del codice (sign.html, api/magic-sign/*, api/preagreement/*, js/portal-app.js, firestore.rules), zero inferenze.

---

## 1. Come l'anagrafica entra nel sistema OGGI — la mappa reale

Quattro porte, di cui una rotta:

### A. Pre-agreement page ✅ (il gold standard)
Il cliente si auto-compila tutto: identità completa + co-inquilini (≤6) +
upload documento + firma tipizzata (`api/preagreement/submit.js`,
`upload.js`). `convert.js:77-116` fa il bootstrap del profilo `users` (con
vero uid Firebase Auth) e porta identità + documenti sul contratto
(`identityDocs`, `convert.js:177`). Zero lavoro per l'operatore. È il motivo
per cui la PA "prende subito l'anagrafica del cliente".

### B. Magic Sign — /sign, step 2 "Identity" ✅ (già più capace di quanto sembri)
La pagina di firma è già **progressiva** (sign.html:491-523, "Model C"):
- anagrafica completa nel profilo → schermata "Confirm your details", un tap;
- anagrafica assente/incompleta → **form completo** (nome, nascita, CF con
  checksum, residenza, documento, nazionalità) che il FIRMATARIO compila da sé.

`api/magic-sign/lookup.js:117-127` restituisce l'identità del firmatario per
il prefill (normalizzata sui due schemi users in circolazione);
`submit.js:129-152` scrive l'identità sul contratto e `submit.js:246-286` la
sincronizza su `users` (e `landlords` per il locatore).

**Quindi: per un cliente legacy con una firma in arrivo, l'anagrafica la
raccoglie già Magic Sign.** Non la devi reinserire tu.

Cosa gli manca rispetto alla PA:
1. **Nessun upload documento** (la PA ce l'ha; serve per RLI e per la
   cessione di fabbricato extra-UE).
2. **Niente co-inquilini** (flusso a 2 firmatari fissi).
3. Arriva solo **al momento della firma** — se la firma non c'è (o c'è già
   stata su carta), questa porta non esiste.

### C. "📋 Compila i tuoi dati" — form-tenant/form-landlord ❌ ROTTO
Lo Share Hub del portal offre ancora il link anagrafica
(`js/portal-app.js:21394-21405` inquilino, `:21445-21456` locatore;
`sendMissingInfoLink` `:21312`). Ma quelle pagine scrivono **da browser,
senza alcuna auth** (`form-tenant.html:637`, `form-landlord.html:1469`) su
`contractRegistrations` — che dal lockdown delle rules è **admin-only**
(`firestore.rules:234`). Il cliente compila, preme invia → **permission
denied**. I dati non arrivano mai.

**Questa è la radice del problema percepito**: il vecchio canale universale
esiste ancora nella UI ma è morto in produzione — la stessa malattia che
aveva Magic Sign prima della API-ficazione (scritture anonime dal browser,
chiuse dalle rules), curata per /sign e mai per i form anagrafica.

### D. Inserimento manuale nel portal 😩 (il fallback attuale)
Form contratto con select "-- Inserisci --" e campi a mano
(`js/portal-app.js:19590-19593`, `saveContract:14332`). È quello che stai
facendo tu oggi.

### Bug collaterale trovato: l'Allegato B non vede l'anagrafica di Magic Sign
Il generatore della scrittura privata legge SOLO lo schema "wizard" del
profilo (`tenant.codiceFiscale/birthDate/birthPlace/idDocType` —
`js/portal-app.js:17060-17067`), senza fallback né sui campi contratto
(`tenantCF`, `tenantDob`…) né sullo schema "sign" (`cf/dob/pob/docNum`) che
`magic-sign/submit` scrive su `users`. Risultato: anche DOPO che il cliente
ha compilato l'identità su /sign, "🔄 Rigenera PDF" ristampa i puntini.
(La scheda RLI invece legge entrambi: `portal-app.js:1832-1838`.)

---

## 2. Risposta alla domanda: "sempre col Magic Sign o meno?"

Separare tre cose che oggi viaggiano incollate:

| Layer | Strumento | Quando |
|---|---|---|
| **Proposta / deal** | Pre-agreement | Solo deal NUOVI con accettazione/soldi alla firma. Mai per regolarizzare un cliente esistente (genererebbe accettazioni fittizie). |
| **Anagrafica** | oggi: PA o /sign — domani: **La Scheda** | In qualsiasi momento, **senza dipendere dalla firma**. |
| **Firma** | **sempre e solo Magic Sign** (standard o Custom) | È l'unico layer di prova FES (consenso pinnato, IP, certificato, cascata post-firma). Non va mai duplicato. |

Decisione per caso concreto:

| Caso | Percorso |
|---|---|
| Deal nuovo da chiudere | PA → auto-convert → Magic Sign (già così, non si tocca) |
| Cliente legacy, contratto **da firmare** | Contratto minimo nel portal → **Scheda** (o direttamente Magic Sign: l'identità la compila lui allo step 2) → rigenera PDF → Magic Sign |
| Cliente legacy, contratto **già firmato su carta** | **NO Magic Sign** — solo Scheda (+ eventuale Magic Sign Custom per far controfirmare/archiviare la scansione) |
| Documento su misura (addendum, disdetta…) | Magic Sign Custom (esiste già) |

Quindi: la firma sì, sempre Magic Sign. L'anagrafica no — e il pezzo che
manca è esattamente uno solo: **l'anagrafica senza firma**.

---

## 3. La proposta: LA SCHEDA (`/scheda`)

Un link, per qualsiasi cliente, in qualsiasi momento: "compila la tua scheda
in 2 minuti". Ricostruito sull'architettura che ha già vinto (Magic Sign +
pattern token delle visite), non un altro sistema.

### 3.1 Token DERIVATO — zero migrazione, come le visite
Il pattern di `api/viewings/_lib.js:128-146` (`manageToken`): il token non è
salvato, è `sha256("scheda:<role>:<contractId>:<HOMIE_SECRET>")` → blob
`<id>.<token>` in URL, verifica `timingSafeEqual`.

- **Ogni contratto mai creato ha già il suo link** — anche quelli firmati nel
  2025, anche quelli con `tenantSignToken` ormai nullato dalla firma.
- Ruolo dentro la derivazione (tenant/landlord = link diversi), non un
  param modificabile.
- Rotazione `HOMIE_SECRET` = revoca globale.
- Niente backfill, niente Share-Hub che scrive token al volo.

### 3.2 Endpoints `api/profile/` (specchio di magic-sign)
- **`lookup.js`** — POST `{t}` → valida il token derivato, ritorna identità
  prefillata (stessa shape di `magic-sign/lookup` `signerIdentity`), label
  immobile, stato documenti. Contratto già firmato → scheda in sola lettura
  ("per modifiche contatta BOOM": mai mutare l'identità di un atto firmato —
  coerente con il finding F5 dell'audit).
- **`submit.js`** — POST `{t, identity, phone?}` → scrive i campi
  `tenant*`/`landlord*` sul contratto + sync `users` (**su ENTRAMBI gli
  schemi**, chiudendo il bug §1) + `landlords`; `logActivity`; ping Telegram
  via `agentNotifications` (stessa infra di magic-sign/submit). Riaggiornabile
  finché non si firma.
- **`upload.js`** — POST `{t, base64, kind}` → Storage
  `contracts/<id>/identity/…` sotto credenziali admin (specchio di
  `preagreement/upload.js`), append su `contract.identityDocs` +
  `users.identityDocs`.
- Riuso di `_shared.js`: `setCors`, `rateOk`, `commitWrites`.

### 3.3 Il tocco moderno: OCR-first
Il cliente **fotografa il documento** → `upload.js` con `extract:true` passa
il file alla stessa estrazione di `api/documents/ocr` (endpoint già
esistente, entities: CF, date…) → il form si auto-compila → il cliente
controlla e conferma. 60 secondi, zero digitazione — per lui e per te.
(L'endpoint ocr attuale richiede ID token admin: l'estrazione va richiamata
server-side dentro upload, la chiave Anthropic non si muove.)

### 3.4 La pagina `scheda.html` (`/scheda?t=…`)
Shell di sign.html (dome, card, progress — il design language nuovo), 3 step:
1. **Chi sei** — prefill/confirm se noto, form se no (stessa logica Model C);
2. **Documento** — upload con OCR, skippabile;
3. **Fatto** — "cosa succede ora" (ti arriverà il link di firma / sei a posto).

EN-first con toggle IT per il tenant (expat), IT-first per il landlord.
`noindex` + `private, no-store` in vercel.json come le altre superfici.

### 3.5 Distribuzione — dove già vivi
- **Share Hub**: la card "📋 Compila i tuoi dati" punta a `/scheda?t=…`
  invece dei form morti (`portal-app.js:21394-21405`, `:21445-21456`,
  `sendMissingInfoLink:21320`). Testi WhatsApp già pronti, restano.
- I vecchi `form-tenant/form-landlord` → 301 su `/scheda` (o dismessi).

### 3.6 Effetto a valle
- **/sign arriva "ready to sign"**: con la Scheda fatta prima, il firmatario
  vede il one-tap confirm (sign.html:500) — il Magic Sign diventa la
  cerimonia di 30 secondi che deve essere. E resta la rete di sicurezza per
  chi ignora la scheda.
- **Il cliente firma un documento completo**: ordine giusto = scheda →
  rigenera Allegato B (col fix schema §1) → Magic Sign. Niente più `………`
  nella scrittura, niente rigenerazioni post-firma.

---

## 4. Alternative considerate e scartate

| Alternativa | Perché no |
|---|---|
| Far passare i legacy dalla PA | Semanticamente una proposta commerciale: accettazione, ref BOOM-, eventuale Stripe — tutto fittizio per un deal già chiuso. |
| Riaprire le rules per i vecchi form | È esattamente l'anti-pattern che l'audit Magic Sign ha eliminato (scritture anonime dal browser). |
| Solo Magic Sign per tutto | Non copre i contratti già firmati su carta, non ha upload documento, e obbliga a inventare una firma dove non serve. |
| Punto la vecchia collection `registrations` (create aperto) | Tiene in vita il doppio pipeline review-poi-applica; la Scheda scrive diretto come già fa magic-sign/submit, con audit. |

---

## 5. Rollout

**Fase 1 — il core (una giornata concentrata)**
`api/profile/_token.js` (~20 righe, specchio manageToken) +
`lookup/submit/upload.js` (~350 righe totali, tutti pattern esistenti) +
`scheda.html` (~700 righe, shell di sign.html) + rewrite/headers in
vercel.json + swap dei 3 punti nello Share Hub.
Test: `tests/scheda/run.mjs` sullo stile di `tests/money` (handler reali,
Firestore in-memory): token sbagliato respinto, ruolo giusto, contratto
firmato = read-only, sync su entrambi gli schemi users.

**Fase 2 — qualità del documento**
Fix fallback Allegato B (`portal-app.js:17060`: `contract.tenantCF ||
tenant.cf || tenant.codiceFiscale`…) + prompt "anagrafica completa →
rigenera PDF" quando la scheda arriva prima della firma + upload documento
anche dentro /sign (stesso endpoint `profile/upload`).

**Fase 3 — chiusura del cerchio**
Co-inquilini sulla scheda; il Details step della PA converge sulla stessa
base; 301 dei vecchi form; **backfill one-shot**: bottone/script che manda la
scheda WhatsApp-first a ogni contratto attivo senza CF (la lista è una query).

---

## 6. Sicurezza
- Token derivato ≠ sign token (context string diversa): la scheda non
  permette MAI di firmare.
- `timingSafeEqual`, rate-limit `rateOk`, CORS ristretto (già in _shared).
- La pagina espone solo l'identità del titolare del link (stessa
  sanitizzazione di magic-sign/lookup); l'altra parte mai.
- Storage sotto prefisso admin-only; le rules non si toccano.
- Lock post-firma: l'identità di un contratto firmato non è più scrivibile
  dal link pubblico.
