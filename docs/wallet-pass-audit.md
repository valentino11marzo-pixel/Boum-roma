# Audit — Apple Wallet Pass (PropPass) nel protocollo BOOM

Data: 2026-07-08 · Ambito: tutto il codebase (portal, API, cron, pagine pubbliche, PFS, Homie, Magic Sign, pre-agreement, referral).

---

## 1. Verdetto in sintesi

L'infrastruttura Wallet è **matura e sopra la media** (5 tipi di pass, web service Apple completo, push APNs, link live tokenizzati, Pass Studio admin, trigger automatici nel cron). L'integrazione nel protocollo però è **a due velocità**: il momento "conferma visita" e il momento "contratto firmato" sono ben coperti *quando l'admin opera dal portal*, mentre tutti i percorsi **server-side / automatici** (Magic Sign da link, pre-agreement, reserve Stripe, PFS, Homie auto-apply) non emettono mai un pass. Inoltre **due superfici pubbliche (pass-delivery.html, proppass.html) sono rimaste alla V1 dei builder e oggi producono pass semivuoti e non aggiornabili**.

Punto chiave sul quesito "autoconferma": **oggi non esiste alcun percorso di auto-conferma visita**. Tutte le strade (book.html, agent `viewings.schedule`, Homie `schedule_viewing`) creano `viewingRequests` con `status:'pending'`; la conferma — e quindi il pass — nasce solo dal click manuale in portal.html (`confirmViewing`, portal.html:7337). L'auto-apply tier-1 di Homie (`api/homie/action.js:110`) scrive solo nella `action_queue`: non conferma la visita e non genera pass.

---

## 2. Inventario di ciò che esiste (e funziona)

### Motore (server)
| Componente | File | Stato |
|---|---|---|
| Builder 5 tipi (tenant, silver, landlord, viewing, referral) con semantics, geo-fence, relevantDate, changeMessage | `api/generate-pass.js` | ✅ eccellente |
| PassKit Web Service Apple (register/unregister/list/latest/log, If-Modified-Since) | `api/pass-update/[...path].js` | ✅ completo |
| Engine live: rebuild da Firestore, registrazioni device, APNs cert-based | `api/_passkit.js` | ✅ completo |
| Link pubblico "Add to Wallet" sempre fresco, token-auth | `api/my-pass.js` | ✅ ma **usato solo da Pass Studio** |
| Emissione admin da record live | `api/pass-issue.js` | ✅ |
| Trigger push manuale/da sistemi | `api/pass-push.js` | ✅ ma **mai chiamato dal portal** |
| Diagnostica config (cert, APNs, conteggi) | `api/pass-diag.js` | ✅ |
| Demo pass | `api/pass-demo.js` | ✅ |
| Documentazione | `api/WALLET.md` | ✅ aggiornata |

### Trigger automatici già cablati (api/reminder-cron.js, ogni 15')
- Push pass viewing ai reminder 3h e 30m (righe 154, 166).
- Push pass tenant/silver quando la rata entra nella finestra 3 giorni e quando va in ritardo (righe 187–195, flag dedup `passDueSoonPushed`/`passOverduePushed`).
- Push "Pagato ✓" sui pagamenti saldati ≤3 giorni (righe 202–219, `passPaidPushed`).

### Aggancio al protocollo nel portal (client-side)
- **Conferma visita** (`confirmViewing`, portal.html:7337–7390): genera il pass PRIMA dell'email, email cliente con link pass + ICS + Google Calendar, notifica admin, back-link al lead.
- **Reschedule** (7428–7536): se già confermata, rigenera il pass con la nuova data e reinvia il link.
- **Cancellazione** (7538+): rigenera il pass `isVoided:true` (strikethrough).
- **Contratto completamente firmato** (`postSignaturePassFlow` → `generateContractPasses`, portal.html:2890 e 19700–19856): pass tenant (o silver se `isPremium`) + pass landlord, salvati su `contracts.tenantPassUrl/landlordPassUrl`, inviati via WhatsApp + email.
- **Share hub contratto** (portal.html:22735+): voce "Apple Wallet pass" per tenant e landlord se già generato.
- **Referral di fine locazione** (portal.html:4214, 19858): generazione + invio WhatsApp manuale.
- **Pass Studio** (`pass-studio.html`): emissione da record, link my-pass, push manuale, conteggio installazioni, diagnostica. È l'unico posto che usa il sistema live end-to-end.

---

## 3. Bug e incoerenze reali (da correggere)

### 3.1 ⚠️ `pass-delivery.html` e `proppass.html` sono rimaste alla V1 dei builder
Entrambe inviano a `/api/generate-pass` campi che i builder V3 **ignorano**:
- `pass-delivery.html:512–535` manda `date`, `time`, `rent`, `zone`, `startDate`, `discount`… I builder si aspettano `confirmedDateISO`, `monthlyRent`, `contractStart/contractEnd`, `viewingId`, `contractId`. Il `passId` letto dalla query (`:465`) **non viene mai inserito nei dati**.
- `proppass.html` (collectData, :360–365) idem: `zone, rooms, agentName, iban, emergencyPhone, cadastral, nextPayment, usesLeft` non esistono nei builder V3.

Conseguenze: pass generati **semivuoti** (solo nome/indirizzo), `serialNumber` random (`crypto.randomUUID()`), `authenticationToken` derivato dal nome → la registrazione al web service fallisce con 401 → **pass "morti"**, mai aggiornabili. Da riallineare ai campi V3 e a `viewingId`/`contractId`, o meglio: far puntare pass-delivery a `/api/my-pass`.

### 3.2 ⚠️ Reschedule/cancel non spingono l'aggiornamento ai pass installati
`rescheduleViewing` e `cancelViewing` rigenerano il file e re-inviano il link, ma **non chiamano mai `/api/pass-push`**. Il device che ha già installato il pass si aggiorna solo:
- al prossimo reminder 3h/30m (solo se la visita è ancora `confirmed`), oppure
- quando iOS decide di fare polling.

Caso peggiore: **visita annullata** → il cron interroga solo `status=='confirmed'` (reminder-cron.js:136) → il pass installato **non riceverà mai** lo stato "ANNULLATA". Fix da 1 riga per flusso: dopo l'update Firestore, `POST /api/pass-push { type:'viewing', entityId:id }` con `X-Firebase-Token` (stesso pattern di pass-studio.html:224).

### 3.3 ⚠️ Firma via Magic Sign "pura" → il tenant non riceve mai il pass
La generazione dei pass contratto vive **solo nel client portal** (`postSignaturePassFlow`). Il percorso server (`api/magic-sign/submit.js` → `api/sign/_finalize.js`) fa tutto il resto (payments, RLI, welcome email, certificato FES) ma **zero pass**: l'email di benvenuto di `_finalize.js:140–184` non contiene il link Wallet. Se nessuno riapre il portal, il pass non parte. Fix: in `_finalize.js` costruire il link live `https://boomrome.com/api/my-pass?type=tenant&id=<contractId>&t=<generateAuthToken(contractId)>` (import da `generate-pass.js`) e inserirlo nelle due welcome email. Costo: poche righe, nessun nuovo endpoint.

### 3.4 `book.html` non mostra il pass alla conferma
La schermata "Confirmed!" (book.html:379–412) fa già polling dello stesso documento `viewingRequests` che contiene `passSentUrl` — ma mostra solo Google/Apple Calendar. Basta aggiungere un bottone "Add to Apple Wallet" quando `data.passSentUrl` esiste (o, meglio, link my-pass).

### 3.5 Il portal distribuisce snapshot statici su Storage invece dei link live
`generatePass()` (portal.html:19382–19404) carica il `.pkpass` su Firebase Storage e condivide quell'URL. Il serial dentro il file è corretto (`viewing-<id>`, `tenant-<contractId>`), quindi il pass **installato** resta aggiornabile — ma:
- il **link** mostra i dati congelati al momento della generazione (se il cliente lo apre giorni dopo un reschedule, installa la versione vecchia e deve aspettare il refresh);
- ogni rigenerazione crea un nuovo file orfano su Storage (nessuna pulizia);
- su Android/desktop il link scarica un file inutilizzabile.
Il sistema live (`/api/my-pass`) esiste esattamente per questo ed è usato solo da Pass Studio. Consiglio: sostituire l'URL Storage con il link my-pass in `sendClientViewingConfirmation`, `generateContractPasses`, share hub e WhatsApp (il token si ottiene server-side; si può esporre negli header di `/api/generate-pass` come già fa `pass-issue` con `X-Pass-Token`).

### 3.6 Sicurezza: `PASS_AUTH_SECRET` non impostato/documentato
`generateAuthToken` (generate-pass.js:75–81) usa `process.env.PASS_AUTH_SECRET || "fallback"`. La variabile **non è nella lista env di CLAUDE.md** né altrove: se manca su Vercel, ogni token è `sha256("boom-<id>-fallback")` → derivabile da chiunque conosca un ID documento (i QR dei pass contengono proprio `BOOM:VIEWING:<id>`). Con quel token si scarica il pass altrui via `/api/my-pass` (dati personali: nome, indirizzo, canone). **Impostarla subito**, prima della distribuzione di massa: cambiarla dopo invalida l'auth di tutti i pass già installati (token baked-in).

### 3.7 Minori
- `silver` esiste nell'API ma non ha tab in proppass.html.
- `passMeta`/`passRegistrations` non hanno regole in firestore.rules: le letture client di pass-studio (`showInstalls`, `loadRecent`) falliranno silenziosamente se il default è deny → aggiungere `allow read: if isAdmin()`.
- Le email reminder 3h/30m del cron non includono il link "Add to Wallet" come fallback per chi non ha ancora installato il pass (il push raggiunge solo i pass installati).
- Il cron push viewing spara a ogni reminder anche se il pass non è mai stato installato (no-op innocuo, ma `registrationsForSerial` fa una query a run).

---

## 4. Cosa manca nel protocollo (gap di copertura)

Ordinati lungo la pipeline: lead → visita → pre-agreement → firma → tenant → referral.

1. **Auto-conferma visite (il gap che chiudi per primo).** Nessun percorso automatizzato porta una visita a `confirmed`: né Homie (`schedule_viewing` finisce in `action_queue`), né l'agent tool (crea `pending`). Se vuoi il pass "quando viene autoconfermato", serve un endpoint server `api/viewings/confirm` (o un ramo in `api/agent/execute.js`) che: setti `confirmed*`, generi/aggiorni il pass, invii l'email col link my-pass e chiami `pushPass`. Così sia l'auto-apply tier-1 sia il bottone del portal passerebbero dalla stessa strada server-side (oggi tutta la logica è duplicata nel client).
2. **Pre-agreement accettato/pagato → nessun pass.** `api/preagreement/submit.js` e il ramo PREAGREEMENT di `stripe-webhook.js` inviano email documentali senza Wallet. Momento ideale per un pass "prenotazione" (eventTicket/storeCard con ref BOOM-xxx, importo versato, prossimi step) o per seminare il tenant pass già alla firma della proposta.
3. **RESERVE pagata (Stripe) → nessun pass.** `stripe-webhook.js` scrive `leads/res_*` e manda la conferma: un pass "Apartment on hold" con countdown/`expirationDate` sarebbe il momento più "wow" del funnel.
4. **PFS scollegato dalla macchina visite.** `client-portal.html` → `api/portal/action.js` `requestViewing` flippa solo un flag su `pfsClients.portalProperties` — niente doc `viewingRequests`, quindi niente reminder cron, niente pass, niente auto-conferma futura. Fix strutturale: `requestViewing` crea (anche) un `viewingRequests` doc con `source:'pfs'`, e da lì eredita gratis tutto il protocollo visite.
5. **Referral: il pass esiste, il programma no.** `refer.html` posta a web3forms (relay esterno); non c'è collezione `referrals`, nessuna assegnazione di `referralCode` sugli utenti, nessun trigger post move-in che emetta il pass BOOM Circle, nessun endpoint che riscatti il QR `BOOM:REFERRAL:<code>` (il `?ref=` in home non viene tracciato). Il coupon Wallet è la punta di un iceberg che va costruito sotto.
6. **Check-in con QR mai implementato.** Ogni pass viewing ha il QR `BOOM:VIEWING:<id>` e il portal prevede lo stato `completed` con `checkedInAt` (portal.html:19346), ma non esiste alcuna pagina/endpoint di scansione. Una micro-pagina admin che scansiona e marca `completed` chiuderebbe il cerchio (e alimenta le stats no-show).
7. **Superfici loggate senza Wallet.** `tenant.html` e `owner-dashboard.html` non mostrano mai "Add to Wallet" nonostante client-portal/corporate/partners lo promettano in marketing. Con `my-pass` è un bottone: il tenant loggato ha `contractId`, il landlord il suo `uid`.
8. **Pagamento marcato "paid" nel portal → push non immediato.** Arriva col cron entro 15' (ok), ma WALLET.md stesso lo lista come 1-liner: chiamare `/api/pass-push {type:'tenant', entityId:contractId}` quando l'admin marca la rata pagata, e nel ramo Stripe del webhook affitti se/quando esisterà.
9. **Google Wallet assente** (roadmap in WALLET.md): oggi ogni link inviato a un Android è un vicolo cieco. Almeno: fallback nella pagina di delivery ("sei su Android → salva il PDF/calendario").
10. **Analytics di adozione non esposte nel protocollo.** `passRegistrations` dice chi ha installato cosa; il portal non lo mostra (es. badge "Pass installato ✓" sulla riga viewing → sai se il cliente arriverà col pass o se serve il reminder WhatsApp).

---

## 5. Piano d'azione consigliato

**P0 — correttezza (poche ore totali)**
1. Impostare `PASS_AUTH_SECRET` su Vercel + aggiungerla a CLAUDE.md (§3.6).
2. `pushPass` su reschedule/cancel dal portal (§3.2).
3. Link my-pass nelle welcome email di `api/sign/_finalize.js` (§3.3).
4. Bottone Wallet nella schermata Confirmed di book.html (§3.4).
5. Riallineare (o dismettere a favore di my-pass) pass-delivery.html e proppass.html ai campi V3 (§3.1).

**P1 — un solo protocollo visite, server-side**
6. Endpoint `api/viewings/confirm` unico (conferma + pass + email + push) usato da portal, agent e futuro auto-confirm (§4.1).
7. `requestViewing` PFS → crea `viewingRequests` (§4.4).
8. Sostituire gli URL Storage con link my-pass in tutti gli invii (§3.5).
9. Link Wallet nelle email reminder del cron (§3.7).

**P2 — nuovi momenti Wallet**
10. Pass prenotazione su pre-agreement accettato/pagato e su RESERVE Stripe (§4.2–4.3).
11. Add-to-Wallet in tenant.html / owner-dashboard (§4.7).
12. Check-in QR (§4.6) + badge "Pass installato" nel portal (§4.10).
13. Programma referral reale sotto il pass BOOM Circle (§4.5).
14. Google Wallet parity (§4.9).

---

## 6. Addendum — P0 implementati (2026-07-09)

Tutti i fix P0 sono stati applicati nello stesso branch di questo audit:

| Fix | Dove |
|---|---|
| §3.6 `PASS_AUTH_SECRET` documentata (da impostare su Vercel) | `CLAUDE.md` |
| §3.2 `pushPassUpdate()` + push APNs su confirm (re-conferma), reschedule e cancel | `portal.html` |
| §3.3 Link `my-pass` (tenant/silver + landlord) nelle welcome email server-side | `api/sign/_finalize.js` |
| §3.4 Bottone "Add to Apple Wallet" nella schermata Confirmed | `book.html` |
| **Scoperta in corso d'opera**: il polling di book.html leggeva `viewingRequests` senza auth → negato dalle rules → la schermata Confirmed non appariva mai. Creato endpoint pubblico sanificato (senza email/telefono/note) e puntato il polling lì | `api/viewings/status.js` + `book.html` |
| §3.1 pass-delivery.html e proppass.html riallineati ai campi V3 (`confirmedDateISO`, `monthlyRent`, `contractStart/End`, coords) + entity ID (`viewingId`/`contractId`) quando disponibile | `pass-delivery.html`, `proppass.html` |
| §3.7 Regole lettura admin per `passMeta`/`passRegistrations` (pass-studio le legge dal browser) | `firestore.rules` |

Restano da fare (P1/P2): endpoint unico `api/viewings/confirm` (abilita auto-conferma), link my-pass al posto degli snapshot Storage, PFS → `viewingRequests`, pass su pre-agreement/RESERVE, programma referral, check-in QR, Google Wallet.

**Azione manuale richiesta**: impostare `PASS_AUTH_SECRET` nelle env Vercel (valore lungo e casuale) e ridistribuire — farlo PRIMA di distribuire pass su larga scala. Dopo il deploy, ricordarsi anche di pubblicare le nuove `firestore.rules` (`firebase deploy --only firestore:rules`).

## 7. Nota di verifica

Le affermazioni chiave sono state verificate sul codice a mano (file:riga citati). Una precisazione rispetto a una lettura frettolosa possibile: il nome file random su Storage (`passes/viewing_<random>.pkpass`, portal.html:19395) **non** è il serial del pass — il serial è sempre canonico (`viewing-<id>`, `tenant-<contractId>`) perché lo scrive il builder server-side. Quindi i pass distribuiti dal portal, una volta installati, **ricevono** i push del cron. I pass davvero non aggiornabili sono quelli emessi da pass-delivery.html/proppass.html senza entity ID (§3.1).
