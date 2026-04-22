# MAGIC SIGN — Audit Professionale

**Data**: Aprile 2026
**Scope**: Flusso firma digitale passwordless in portal.html
**Metodo**: Lettura completa del codice, zero inferenze su funzionalità non trovate

---

## FASE 1 — DISCOVERY: Flusso Reale vs Dichiarato

### Flusso reale mappato nel codice

```
URL ?sign=TOKEN
    │
    ├── L1516: Token estratto da URL query param
    ├── L1518: isMagicSign = true
    ├── L1522: auth.signInAnonymously()
    ├── L1530: db.collection('contracts').where('tenantSignToken','==',token)
    │   └── L1532: fallback where('landlordSignToken','==',token)
    ├── L1543: Check se già firmato → "Already signed" exit
    ├── L1556: msData object creato con contract/property/signer
    │
    ▼ STEP 1 — Contract Review (L1567-L1599)
    ├── Riepilogo contratto: proprietà, parti, termini, date
    ├── Link opzionale a PDF preview se generatedPDF esiste
    └── Bottone "Continue" → msPassStep2()
    │
    ▼ STEP 2 — Identity Verification (L1634-L1713)
    ├── Form: nome (readonly), DOB, POB, CF, indirizzo, documento
    ├── L1696: Validazione CF: solo lunghezza = 16 (NO checksum)
    ├── Dati salvati in window._msIdData (memoria browser)
    └── → msPassStepOTP()
    │
    ▼ STEP 2.5 — OTP Phone (L1719-L1864)
    ├── L1760: RecaptchaVerifier invisible
    ├── L1782: otpSend() → firebase.auth.PhoneAuthProvider
    ├── L1821: otpVerify() → linkWithCredential
    ├── L1861: otpSkipStep() → SKIP CONSENTITO ⚠️
    └── → msPassStep3()
    │
    ▼ STEP 3 — Firma Canvas (L1867-L1930)
    ├── HTML5 Canvas con DPI scaling
    ├── Checkbox consenso obbligatorio
    ├── Firma estratta come PNG data URL
    └── → submitMagicSign(contractId, role, token)
    │
    ▼ STEP 4 — Submit (L1932-L2038)
    ├── L1937: sigData = canvas.toDataURL('image/png')
    ├── L1939: now = new Date().toISOString() ← client-side
    ├── L1942-1963: Dati identità scritti su contratto Firestore
    ├── L1957: user profile aggiornato
    ├── L1962: landlord collection aggiornata (se landlord)
    ├── L1964-1968: Firma + metadata scritti:
    │   ├── {role}Signature = PNG base64
    │   ├── {role}SignedAt = ISO client timestamp
    │   ├── {role}SignedIP = 'collected' ← HARDCODED, NON IP REALE
    │   ├── {role}SignedUA = navigator.userAgent (200 chars)
    │   └── {role}SignToken = null ← token invalidato
    ├── L1969-1973: Fresh fetch contratto, check altra firma
    │   ├── signatureStatus = 'complete' se entrambi firmato
    │   └── signatureStatus = 'partial' se solo uno
    ├── L1974: db.collection('contracts').doc(id).update(upd)
    │
    ├── SE signatureStatus === 'complete':
    │   ├── L1982: (a) RLI deadline 25gg
    │   ├── L1988: (b) Lead closure
    │   ├── L1993: (c) Property status → rented
    │   ├── L1997: (d) Listing sync → rented
    │   ├── L2002: (e) Payment schedule generation
    │   ├── L2018: (f) sendCAFEmail()
    │   ├── L2020: (g) generateContractPasses()
    │   └── L2022: (h) Tenant auto-account creation
    │
    └── L2032: showMagicSignSuccess()
```

### Divergenze flusso dichiarato vs implementato

| Dichiarato | Implementato | Status |
|-----------|-------------|--------|
| Token passwordless | `crypto.randomUUID()` — UUID v4, non JWT/HMAC | ✅ Diverso da JWT ma funzionale |
| Auth anonima Firebase | `auth.signInAnonymously()` L1522 | ✅ Presente |
| OTP via SMS/WhatsApp | Solo SMS via Firebase Phone Auth. WhatsApp NON implementato. Skip consentito. | ⚠️ Parziale |
| Canvas HTML5 per firma | Canvas con DPI scaling L1896 | ✅ Presente |
| Classificazione FES/eIDAS | **NON IMPLEMENTATA**. Nessun riferimento nel codice. | ❌ Assente |
| Write Firestore contratto | `db.collection('contracts').doc(id).update(upd)` L1974 | ✅ Presente |
| Webhook Make.com | **RIMOSSO** nel commit b173299. Nessuna chiamata webhook nel flow. | ❌ Rimosso |
| CAF email post-firma | `sendCAFEmail()` L2018 — **LIVE** | ✅ Live |
| RLI reminder | Deadline a 25gg L1982 — **LIVE** | ✅ Live |
| Onboarding sequence | Tenant auto-account L2022 — **LIVE**. Email onboarding: **NON trovata** nel flow Magic Sign. | ⚠️ Parziale |

---

## FASE 2 — AUDIT

### 1. SICUREZZA

**[CRITICA] S1 — IP firmatario non catturata**
- Riga: 1965, 1967
- `{role}SignedIP = 'collected'` — stringa hardcoded, non IP reale
- Rischio: Audit trail FES incompleto, impossibile provare geolocalizzazione al momento della firma
- Fix: Catturare IP reale via API serverless o header `x-forwarded-for`

**[CRITICA] S2 — Hash documento non-deterministico**
- Riga: 11678-11686 (`generateDocHash`)
- Include `Date.now()` nell'input dell'hash → hash diverso ogni esecuzione
- Rischio: Impossibile verificare integrità del documento in un momento futuro
- Fix: Rimuovere `Date.now()`, hashare il contenuto PDF reale

**[ALTA] S3 — Nessun hash pre-firma**
- Il documento non viene hashato PRIMA che l'utente firmi
- L'hash è calcolato durante `generateContractPDF()` che gira al momento della creazione contratto, NON al momento della firma
- Rischio: Documento potrebbe essere modificato tra generazione e firma senza che il firmatario lo sappia
- Fix: Calcolare e mostrare hash del PDF al firmatario nello Step 1, verificare corrispondenza al submit

**[ALTA] S4 — Token in URL plaintext**
- Riga: 1516
- Token passato come `?sign=UUID` — esposto in browser history, HTTP Referer, server logs
- Rischio: Link firma intercettabile o riutilizzabile da chi ha accesso alla cronologia browser
- Fix: Usare fragment hash `#sign=UUID` (non inviato a server), o implementare token one-time con scambio server-side

**[ALTA] S5 — Nessuna Firestore Security Rule nel repo**
- Nessun file `firestore.rules` trovato
- DA VERIFICARE MANUALMENTE: le rules potrebbero essere deployate via Firebase Console ma non committate
- Rischio: Utente anonimo potrebbe leggere/scrivere qualsiasi contratto se le rules sono permissive
- Fix: Implementare rules che limitano accesso per token e role

**[ALTA] S6 — OTP skip consentito**
- Riga: 1861-1864 (`otpSkipStep`)
- L'utente può saltare la verifica telefonica completamente
- Rischio: Nessuna garanzia di identità del firmatario
- Fix: Rimuovere opzione skip, rendere OTP obbligatorio per FES

**[MEDIA] S7 — Race condition token nullification**
- Riga: 1965, 1974
- Token nullificato dentro lo stesso `update()` della firma
- Se il write fallisce parzialmente, il token potrebbe restare valido
- Fix: Usare Firestore transaction per atomicità

**[MEDIA] S8 — Nessun TTL sui token**
- Riga: 9721
- Token generato alla creazione contratto, nessuna scadenza
- Rischio: Link firma valido indefinitamente
- Fix: Aggiungere campo `tokenExpiresAt` (es. 7 giorni) e verificare in initMagicSign

**[BASSA] S9 — Identity data in window._msIdData**
- Riga: 1703-1711
- Dati sensibili (CF, DOB, documento) in oggetto globale JavaScript
- Rischio: Accessibile a XSS se presente, ma mitigato dal fatto che il flow è single-page
- Fix: Minimo — i dati esistono per la durata del flow e non vengono persistiti localmente

### 2. CONFORMITÀ eIDAS / FES

**[CRITICA] F1 — Nessuna classificazione FES esplicita**
- Non esiste codice che classifichi la firma come FES o eIDAS
- Il flow raccoglie dati compatibili con FES (identità, consenso, firma) ma non li struttura come tale
- Rischio: In caso di controversia legale, la firma potrebbe non essere riconosciuta come FES
- Fix: Aggiungere metadata esplicito `signatureType: 'FES'`, compliance statement nel PDF

**[CRITICA] F2 — Hash non legato al documento firmato**
- Come S2 sopra — l'hash non rappresenta il documento al momento della firma
- Requisito FES: integrità dimostrabile del documento
- Fix: Hash SHA-256 del PDF base64 calcolato e mostrato prima della firma, salvato immutabile

**[ALTA] F3 — Audit trail incompleto**
- Riga: 1965-1968
- Presente: timestamp client, user agent (200 chars)
- Mancante: IP reale, device info, geolocalizzazione, versione browser, OS
- Rischio: Audit trail insufficiente per contestazioni legali
- Fix: Catturare IP (via API), device fingerprint, salvare in campo `auditTrail` separato

**[ALTA] F4 — Consenso non strutturato**
- Riga: 1888-1891
- Checkbox "I confirm my identity..." ma il testo del consenso non è salvato su Firestore
- Solo il fatto che il bottone è stato cliccato (implicitamente, dato che il submit funziona)
- Rischio: Non dimostrabile quale testo di consenso è stato mostrato
- Fix: Salvare il testo esatto del consenso + timestamp + hash nel campo `consentText`

**[MEDIA] F5 — PDF mutabile dopo firma**
- `generatedPDF` può essere rigenerato con `regenerateContractPDF()` anche dopo la firma
- Nessun lock sul documento firmato
- Rischio: Admin potrebbe rigenerare il PDF con dati diversi post-firma
- Fix: Bloccare rigenerazione se `signatureStatus !== 'none'`, o salvare versione firmata separata

**[MEDIA] F6 — GDPR: nessuna politica di retention esplicita**
- Dati biometrici (firma grafica), PII (CF, DOB, documento) salvati indefinitamente
- Nessun meccanismo di export/erasure nel codice
- Rischio: Violazione GDPR art. 5(1)(e) — limitazione conservazione
- DA VERIFICARE MANUALMENTE: politiche di retention potrebbero esistere a livello aziendale

### 3. CONFORMITÀ LEGALE ITALIANA

**[ALTA] L1 — Codice fiscale non validato (solo lunghezza)**
- Riga: 1696-1700
- Verifica: `if (cf.length !== 16) { ... error }`
- Nessun checksum (il CF italiano ha un carattere di controllo calcolabile)
- Rischio: CF errato accettato → asseverazione CAF fallisce, registrazione RLI bloccata
- Fix: Implementare validazione checksum CF italiano (algoritmo noto, ~20 righe)

**[MEDIA] L2 — RLI deadline a 25 giorni invece di 30**
- Riga: 1984
- `rliDue.setDate(rliDue.getDate() + 25)`
- La legge italiana richiede registrazione entro 30 giorni
- 25gg è un buffer ragionevole ma il titolo della deadline dice "Registrare RLI" senza menzionare la scadenza legale
- Fix: Chiarire nel titolo "Registrare RLI (scadenza legale: 30gg)" e aggiungere alert a 28gg

**[MEDIA] L3 — Cedolare secca non esplicitata nel flow firma**
- Il firmatario non vede/conferma esplicitamente l'opzione cedolare secca durante il flow
- Il campo `cedolareSecca` è nel contratto ma non mostrato nello Step 1
- Rischio: Firmatario potrebbe non sapere di aver optato per cedolare secca
- Fix: Mostrare campo cedolare secca nel riepilogo Step 1 con evidenziazione

**[BASSA] L4 — Allegato B vs C selezione corretta**
- Riga: 11573-11576 (`generateContractPDF`)
- Template correttamente selezionato in base a `contract.type === 'studenti'`
- `isStudenti` → Allegato C, altrimenti → Allegato B
- **FUNZIONA CORRETTAMENTE**

### 4. POST-FIRMA / AUTOMAZIONI

**[MEDIA] A1 — Nessun retry/dead-letter per automazioni fallite**
- Tutte le automazioni post-firma (L1977-L2030) hanno `.catch()` con `console.warn`
- Se una fallisce silenziosamente, nessun alert e nessun retry
- Rischio: CAF email persa, pagamenti non generati, property non aggiornata
- Fix: Creare collection `failedAutomations` dove loggare errori, mostrare alert nel dashboard admin

**[INFO] A2 — Stato effettivo delle automazioni post-firma**

| Automazione | Codice | Status |
|-------------|--------|--------|
| (a) RLI deadline 25gg | L1982-1986 | **LIVE** — crea documento in `deadlines` |
| (b) Lead closure | L1988-1991 | **LIVE** — aggiorna lead a `closed` |
| (c) Property → rented | L1993-1995 | **LIVE** — aggiorna proprietà |
| (d) Listing sync | L1997-2000 | **LIVE** — aggiorna listing pubblico |
| (e) Payment schedule | L2002-2015 | **LIVE** — genera rate mensili |
| (f) CAF email | L2018 | **LIVE** — invia via EmailJS `boom_notification` template |
| (g) PropPass passes | L2020 | **LIVE** — genera Apple Wallet passes |
| (h) Tenant account | L2022-2028 | **LIVE** — crea user in `users` collection |
| Webhook Make.com | — | **RIMOSSO** (commit b173299) |
| Onboarding email sequence | — | **NON TROVATA** nel flusso Magic Sign |

### 5. UX / EDGE CASE

**[ALTA] E1 — Nessun recovery se perdi connessione durante firma**
- Se il network cade tra click "Confirm" e completamento del write Firestore (L1974), la firma è persa
- Il bottone torna attivo nel catch (L2035) ma i dati canvas sono persi
- Fix: Salvare sigData in sessionStorage prima del submit, recuperare al reload

**[MEDIA] E2 — Co-firmatari non supportati**
- Il flow supporta esattamente 2 firmatari (tenant + landlord)
- Nessun supporto per più inquilini sullo stesso contratto
- Fix: Fuori scope per MVP, documentare come limitazione

**[MEDIA] E3 — Link riutilizzato dopo firma**
- L1543: check se `tenantSignature` o `landlordSignature` esiste
- Mostra "Already signed" correttamente
- **FUNZIONA** — ma il messaggio è generico, potrebbe mostrare info firma precedente

**[BASSA] E4 — Lingua fissa inglese nel flow**
- Tutto il flow è in inglese, non usa il sistema `S.lang` / `t()` del portal
- Non critico per il target expat, ma il contratto è in italiano
- Fix: Internazionalizzare quando necessario

### 6. OSSERVABILITÀ

**[ALTA] O1 — Nessun alerting su firme bloccate**
- Se un firmatario apre il link ma non completa, non c'è alert all'admin
- L'admin vede solo `signatureStatus` nel portal ma deve controllare manualmente
- Fix: Deadline automatica "Follow up firma - [nome]" dopo 48h dal primo accesso al link

**[MEDIA] O2 — Logging solo console.log/console.error**
- Tutti i log vanno alla console browser del firmatario
- L'admin non vede nulla se il firmatario ha un problema
- Fix: Inviare eventi critici a Firestore `signatureEvents` collection

**[BASSA] O3 — Dashboard pending signatures**
- Il portal mostra `signatureStatus` nei contratti
- Badge "Da firmare" / "Firma parziale" presenti
- **FUNZIONA** ma senza alert proattivo

---

## FASE 3 — PROPOSTE DI IMPLEMENTAZIONE

### Sprint A — Must-fix PRIMA del prossimo contratto firmato

| # | Finding | Fix | Effort | Impatto | Dipendenze | Regressione | Verifica |
|---|---------|-----|--------|---------|------------|-------------|----------|
| S1 | IP hardcoded | Creare API endpoint `/api/get-ip` che ritorna l'IP dal header `x-forwarded-for`. Chiamare prima del submit, salvare in `{role}SignedIP`. | S (2h) | Alto | Nessuna | 1/5 | Firma di test, verificare campo IP su Firestore |
| S2+F2 | Hash non-deterministico | Riscrivere `generateDocHash()`: rimuovere `Date.now()`, hashare il PDF base64 completo con SHA-256, salvare hash intero (non troncato) | S (1h) | Alto | Nessuna | 2/5 | Generare PDF 2 volte con stessi dati, verificare hash identico |
| S6 | OTP skip | Rimuovere `otpSkipStep()` e il bottone "Skip". Rendere OTP obbligatorio. | S (<1h) | Alto | Nessuna | 1/5 | Tentare flow senza completare OTP, verificare blocco |
| L1 | CF non validato | Aggiungere funzione `validateCodiceFiscale(cf)` con algoritmo checksum ufficiale. Chiamare in `msPassValidateAndOTP()` prima di procedere. | S (2h) | Alto | Nessuna | 1/5 | Testare con CF validi e invalidi |
| F4 | Consenso non strutturato | Salvare `{role}ConsentText`, `{role}ConsentTimestamp`, `{role}ConsentHash` nel update object (L1940). | S (1h) | Alto | Nessuna | 1/5 | Verificare campi su Firestore dopo firma |

### Sprint B — Entro 30 giorni

| # | Finding | Fix | Effort | Impatto | Dipendenze | Regressione | Verifica |
|---|---------|-----|--------|---------|------------|-------------|----------|
| S3 | Hash pre-firma | Calcolare SHA-256 del PDF prima di mostrare Step 1. Mostrare hash al firmatario. Al submit, ricalcolare e confrontare. Se diverso, bloccare. | M (4h) | Alto | S2 | 3/5 | Modificare PDF tra gen e firma, verificare blocco |
| S5 | Firestore rules | Creare `firestore.rules`: contratti leggibili solo da tenant/landlord coinvolto o admin. Token non esposti in query. | M (4h) | Alto | Nessuna | 4/5 | Test con utente non autorizzato |
| S4 | Token in URL | Migrare a fragment hash `#sign=TOKEN` (non inviato a server) o implementare token exchange: link contiene `exchangeId`, backend valida e ritorna `contractId`. | L (1gg) | Medio | Nessuna | 3/5 | Verificare token non appare in server logs/Referer |
| F1 | Classificazione FES | Aggiungere metadata `signatureType: 'FES'`, `signatureStandard: 'eIDAS_Art25'` al contratto. Aggiungere statement di compliance nel PDF. | S (2h) | Medio | S1, F4 | 1/5 | Review legale del PDF generato |
| F3 | Audit trail completo | Creare campo strutturato `{role}AuditTrail: { ip, ua, device, os, browser, screenRes, timestamp, consentHash }`. | M (3h) | Alto | S1 | 2/5 | Verificare tutti i campi dopo firma test |
| A1 | Retry automazioni | Ogni automazione che fallisce: salvare in `failedAutomations` collection con contractId, tipo, errore, timestamp. Mostrare alert nel dashboard admin. Bottone retry manuale. | M (4h) | Medio | Nessuna | 2/5 | Simulare fallimento (offline), verificare log e retry |
| E1 | Recovery rete | `sessionStorage.setItem('pendingSignature', JSON.stringify({sigData, contractId, role}))` prima del submit. Al reload, detectare e offrire retry. | S (2h) | Medio | Nessuna | 2/5 | Kill network durante submit, reload, verificare recovery |
| O1 | Alert firme bloccate | In `checkContractExpiry()`, aggiungere check per contratti con `signatureStatus === 'none'` da più di 48h. Creare deadline + notifica admin. | S (2h) | Medio | Nessuna | 1/5 | Creare contratto, non firmare per 48h, verificare alert |

### Sprint C — Tech debt / nice-to-have

| # | Finding | Fix | Effort | Impatto | Dipendenze | Regressione | Verifica |
|---|---------|-----|--------|---------|------------|-------------|----------|
| S7 | Race condition token | Convertire submit a Firestore `runTransaction()` per atomicità. | M (3h) | Basso | Nessuna | 3/5 | Test concorrenza con 2 tab aperti |
| S8 | Token TTL | Aggiungere `tokenExpiresAt` a `saveContract()`. Verificare in `initMagicSign()`. | S (1h) | Basso | Nessuna | 2/5 | Creare contratto, aspettare scadenza, verificare blocco |
| F5 | PDF mutabile | Bloccare `regenerateContractPDF()` se `signatureStatus !== 'none'`. Salvare copia immutabile `signedPDF` separata. | S (1h) | Medio | Nessuna | 2/5 | Tentare rigenerazione post-firma, verificare blocco |
| F6 | GDPR retention | Documentare politica retention, implementare export/erasure per PII su richiesta. | L (1gg) | Basso | Review legale | 1/5 | Test export dati utente |
| L2 | RLI deadline testo | Cambiare titolo deadline in "Registrare RLI (scadenza legale: 30gg)" + alert a 28gg. | S (<1h) | Basso | Nessuna | 1/5 | Verificare testo deadline |
| L3 | Cedolare secca visibile | Aggiungere riga cedolare secca nel riepilogo Step 1. | S (<1h) | Basso | Nessuna | 1/5 | Verificare campo visibile |
| E4 | i18n flow | Internazionalizzare stringhe del flow con sistema `t()` esistente. | M (4h) | Basso | Nessuna | 2/5 | Testare in IT e EN |
| O2 | Logging strutturato | Creare collection `signatureEvents` con log di ogni step del flow. | M (3h) | Medio | Nessuna | 1/5 | Completare flow, verificare eventi loggati |
