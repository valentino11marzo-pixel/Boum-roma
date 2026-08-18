# AUDIT 360° — BOOM Roma · 18 agosto 2026

**Oggetto**: tutto il sistema — il portale admin (`portal.html` + `js/portal-app.js`, 27.723 righe), la macchina server (221 file in `api/`, 24 cron), il modello dati (63 collezioni Firestore + regole), la piattaforma (Vercel, CI, Storage), e il **modo** con cui BOOM viene sviluppato (159 commit in 14 giorni, di cui 130 da sessioni AI parallele).

**Metodo**: quattro ispezioni indipendenti sul codice ATTUALE (`HEAD`), verificate riga per riga — **nessuna affermazione presa da CLAUDE.md o dai commenti**, che dichiarano fatte cose che il codice smentisce. Più i **log runtime di produzione veri** (Vercel, ultimi 7 giorni) e i **log della CI di GitHub**. Ogni claim ha un riferimento `file:riga` o un log citato. La domanda che governa tutto: *cosa serve per portare BOOM al livello di un software globale top, e cosa è davvero utile all'operatore.*

**Chi legge abbia chiaro il tono richiesto**: brutalmente onesto. Il che include dire, con la stessa forza, dove BOOM è già migliore di prodotti che si fanno pagare.

---

## 1. Il verdetto in sette righe

1. **Il nucleo che incassa è vero e, in alcuni punti, di livello.** Contratti → firma digitale → incasso, il webhook Stripe, La Squadra che scrive ai clienti da sola, il radar PFS, il journey inquilino: sono maturi, usati, e testati dove conta. Il webhook Stripe e l'alerting `pfs/_health.js` sono ingegneria vera, non demo.
2. **Ma il sistema è protetto da una cintura di sicurezza che in tre punti non è allacciata**, e uno di questi sta perdendo sangue in produzione **adesso**.
3. **Il rischio n.1 è a sé, e non è vicino al secondo: non esiste NESSUN backup del database.** Zero. Un errore, uno script storto o una password compromessa cancellano contratti, pagamenti e mandati SEPA in modo definitivo.
4. **Le rules di sicurezza del repo NON sono quelle attive in produzione** (drift confermato dai log): i fix di sicurezza scritti sono spenti, e l'anti-doppio-contratto fallisce 403 da settimane.
5. **C'è uno stored XSS che esegue codice nella sessione admin** (privilegi Firestore totali), abilitato da due collezioni scrivibili da chiunque e dall'assenza totale di Content-Security-Policy.
6. **La superficie è il doppio della sostanza**: 139 pagine HTML (34 preview di laboratorio in produzione), 50 progetti Vercel di cui ~48 zombie, scheletri con numeri finti ancora a schermo.
7. **La causa comune di quasi tutto è UNA, ed è il modo di sviluppo**: ogni lezione viene imparata benissimo **una volta** e applicata **in un posto solo**. Il codice non è fragile perché scritto male — è fragile perché scritto bene diciassette volte separatamente. Questo è il vero oggetto dell'audit.

---

## 2. Il metro del "software globale top" — voto per asse

Sette assi, quelli su cui si misurano davvero Linear, Stripe, Notion. Voto onesto, con la prova.

| # | Asse | Voto | Sintesi |
|---|---|---|---|
| 1 | **Correttezza dei soldi** | **8/10** | Il pezzo migliore. Webhook con firma su raw body, idempotenza per-ramo, la regola d'oro "un pagato non si sovrascrive mai, si alza un allarme". Due macchie: `reserve-checkout` si fida dell'importo dal client, e il webhook gira su 10s di default. |
| 2 | **Nucleo funzionale (prodotto)** | **8/10** | Contratti/firma/incasso, Squadra, radar, journey: profondi e reali. La macchina server regge il business. |
| 3 | **Esperienza d'uso** | **6/10** | Mobile (M2) e desktop (D1) appena costruiti alzano molto l'asticella; il boot da 2,3 MB no-store resta il freno. |
| 4 | **Osservabilità** | **5/10** | Heartbeat + alert Telegram di qualità dove esistono — ma **11 cron su 24 sono ciechi**, incluso `reminder-cron` che incassa gli affitti. Web Analytics spente. |
| 5 | **Sicurezza & privacy** | **4/10** | Modello rules ben disegnato, ma **drift in produzione**, **XSS stored**, **zero CSP**, rate-limit fittizio, **due auth fail-open**. Il disegno è buono; l'esecuzione perde. |
| 6 | **Architettura & manutenibilità** | **4/10** | Monolite da 27,7k righe non spezzato, **17 implementazioni di auth** (erano 4), **3 schemi identità**, 4 verità doppie non ridotte (una peggiorata). |
| 7 | **Affidabilità & recuperabilità** | **2/10** | **Zero backup del database.** Tutto il resto è recuperabile; questo no. È l'unico voto che da solo può affondare l'azienda. |

**Media pesata ≈ 5,3/10 — ma la media mente.** Il ritratto vero è questo: **un nucleo da 8 avvolto in un'infrastruttura di protezione da 3.** La distanza fra i due numeri È il lavoro di questo audit. Un software globale top non ha il nucleo più bello di BOOM — ha la stessa cura del nucleo estesa alla cintura.

---

## 3. Produzione: cosa dicono i log VERI (7 giorni)

Non congetture: i cluster di errore runtime di Vercel e il log della CI di stamattina.

| Gravità | Evidenza (log reale) | Causa radice |
|---|---|---|
| 🔴 | **`propertyLocks` 403 — ancora oggi 18/08 11:01** (`reminder-cron` sweepLocks) + `market/_ledger` 403 **×281** (`pfs/scan-inbox`) + `perito` 403 ×7 (`market/pulse`) + **2 accettazioni reali** senza lucchetto (31/7, 15/8) | **Le rules in produzione sono più vecchie del repo.** La CI di stamattina lo prova: `##[warning]FIREBASE_TOKEN assente — rules NON deployate`. Il job `deploy-rules` esiste, gira, e **esce senza deployare** perché il secret non c'è. |
| 🟠 | **`leads/scan-inbox` timeout 300s** ×7 + `pfs/scan-inbox` stesso rischio | Le due fonti email PORTANTI non hanno `maxDuration` → default 300s del piano. Le gemelle `banking/` e `documents/scan-inbox` sono capate a 60s: incoerenza pura. |
| 🟠 | **`banking/scan-inbox` Socket timeout** (IMAP) | `leads/scan-inbox` è anche l'unico dei 4 scanner IMAP senza `socketTimeout` (`api/leads/scan-inbox.js:93`). |
| 🟡 | `photos/enhance` — listing `2SwJ8yD3ITXylrEtYIlL` foto non processabile, ritentata ogni notte da 25 giorni | Da bonificare quella foto. |

**La riga 🔴 è la più importante di tutto l'audit sul piano operativo**: significa che **ogni fix di sicurezza scritto nelle rules del repo è spento in produzione** (l'esclusione dell'IBAN `company`, i vincoli di scrittura per inquilini/proprietari, l'anti-doppio-contratto). Il codice pensa di essere sicuro; la produzione gira su regole di settimane fa.

---

## 4. I difetti, prioritizzati (P0 → P2)

Ordine per **rischio × irreversibilità**, con effort onesto. I P0 sono quelli che o non si recuperano, o stanno già causando danni misurati.

### 🔴 P0 — da fare per primi (rischio esistenziale o emorragia attiva)

| # | Difetto | Prova | Impatto | Effort |
|---|---|---|---|---|
| **P0.1** | **Nessun backup del DB.** Nessun export, nessun PITR, nessuno script. | ricerca esaustiva `api/**`: 0 occorrenze di export/backup/PITR | Un errore o una password compromessa = contratti, pagamenti, mandati SEPA persi **per sempre** | **1h tua**: abilita PITR su Firestore (7 gg, una casella in console) + export schedulato su GCS |
| **P0.2** | **Rules non deployate** → 455+ errori/settimana, fix di sicurezza spenti | log CI 18/08 "FIREBASE_TOKEN assente"; runtime 403 propertyLocks | Doppio contratto possibile, IBAN pubblico ancora, vincoli tenant spenti | **5 min tua**: `npx firebase-tools login:ci` → secret `FIREBASE_TOKEN` su GitHub. **Ma vedi P0.3 prima di deployare** |
| **P0.3** | **`documents` create manca il ramo `isAdmin()`** (che `maintenance` ha) → l'archiviazione legale post-firma è negata | `firestore.rules:121` vs `:107` (verificato); 6 siti che creano doc per terzi: `portal-app.js:1818,17263,17276,19468-19470` | Contratto firmato, firme, bozza RLI: **non si salvano mai** in `documents`. Va corretto NELLO stesso deploy di P0.2 | 10 min |
| **P0.4** | **Stored XSS nella sessione admin.** `viewingRequests`/`registrations` `allow create: if true` + sink non escapati | `firestore.rules:178,203` (verificato); `portal-app.js:5878` (`passSentUrl` non-esc), `3477/3480/3481` (showReminders), `7291` (fileUrl in onclick) | Uno sconosciuto esegue JS con privilegi Firestore totali | **½ giornata**: vincolo di forma sulle 2 create + `esc()` sui ~12 sink |
| **P0.5** | **Due auth fail-open** | `agent/_lib.js:143` (`undefined===undefined`→true su 25 endpoint) e `telegram/_lib.js:64` (`return true` se env manca) | Se un env si svuota, 25 endpoint agent + il webhook Telegram diventano pubblici | **10 min**: il fix corretto è già scritto in `homie/_lib.js:150` (`secretEqual`) |
| **P0.6** | **Due generatori di pagamenti scrivono rate duplicabili e INVISIBILI al debitore** | `portal-app.js:15725` e `:16177`: auto-id, dedup solo in memoria, **omettono `tenantId`/`propertyId`** | Sotto le rules quelle rate non compaiono in `/casa`: soldi dovuti, invisibili a chi paga. Il generatore CORRETTO è a fianco (`:17389`) | 2h: estendere il pattern deterministico già lì |

### 🟠 P1 — le settimane dopo (falle vere, non ancora sfruttate / danni silenziosi)

| # | Difetto | Prova | Effort |
|---|---|---|---|
| P1.1 | **Zero Content-Security-Policy** in tutto `vercel.json` — il moltiplicatore che trasforma ogni futuro XSS in compromissione | `vercel.json` 9 blocchi headers, 0 con CSP | 2h per una CSP minima (`object-src 'none'; base-uri 'none'; frame-ancestors 'none'`), adottabile subito |
| P1.2 | **11 cron su 24 senza heartbeat**, tra cui `reminder-cron` (incassa gli affitti) e `notify-pending` (ogni minuto) | §4.1 dell'ispezione server | ½ giornata: estendere `tests/squadra/registry.mjs` a "nessun cron senza battito" |
| P1.3 | **Regressione S1**: il fix su `/api/generate-pass` ha rotto `pass-delivery.html` (pagina pubblica, unico CTA → 401) | `pass-delivery.html:552` senza token; `generate-pass.js:482` commento falso | 2h: token derivato pattern `my-pass.js` |
| P1.4 | **`maxDuration` mancante** su `stripe-webhook` (10s, regge tutti i soldi), `preagreement/submit`, `leads/scan-inbox`, `pfs/scan-inbox` | `vercel.json` functions | 15 min |
| P1.5 | **`stripe` e `sharp` a range `^`** — possono cambiare minor a ogni deploy; stripe tocca gli addebiti SEPA | `package.json:35,38`; solo `jspdf` è pinnato+testato | 15 min: pinnare esatto come jspdf |
| P1.6 | **Endpoint pubblici deboli**: `viewings/slots` POST senza rate-limit (auto-DoS dell'agenda), `portal/lookup` brute-forzabile (code ≥4), `geocode-bake` ripete il DoS che il gemello chiude | `viewings/slots.js:63`, `portal/_shared.js:13`, `geocode-bake.js:83` | ½ giornata |
| P1.7 | **`reserve-checkout` prende l'importo della caparra dal client** (clamp 100–2000, ma il cliente sceglie: chiede €300, paga €100) | `reserve-checkout.js:36,43` | 30 min: importo dal listing server-side |
| P1.8 | **URL bearer permanenti dei contratti firmati** in 3 caselle email, mai revocabili né scadenti | `api/sign/_finalize.js:256` | valutazione: token scadente o download proxy |
| P1.9 | **`storage.rules` `passes/`**: `read: if true` + write da ogni autenticato (anche anonimo) fino a 5MB | `storage.rules:116` | 30 min |
| P1.10 | **`api/get-ip.js` rotto** (unico file CJS in ESM) → l'IP nel trail di firma è sempre vuoto | `get-ip.js:25` vs `api/package.json:2` | 5 min |

### 🟡 P2 — strutturale (debito che rallenta tutto, ma non sanguina)

- **Il monolite non è stato spezzato** (I3 dell'audit di agosto): 27.723 righe in un file, +64KB dai layer M2/D1 → il boot è oggi *più* pesante di agosto. `import()` dinamico funziona senza build.
- **17 implementazioni di auth, 3 schemi identità, 7 copie di `verifyFirebaseToken`**: consolidare in una libreria sola.
- **4 verità doppie non ridotte, una peggiorata**: `properties↔listings` legge un join `listingId` **che nessuno scrive** (`portal-app.js:10590`); `landlords` cresce con doppia scrittura sincrona; `clients↔pfsClients` e le due Photo Studio invariate.
- **Timestamp misti** (Timestamp vs stringa ISO sullo stesso campo) → `leads.orderBy('createdAt')` non ordina cronologicamente.
- **Nessuna cascata sulle cancellazioni**: eliminare un contratto lascia orfani pagamenti, scadenze, documenti; la Bonifica copre 9 collezioni su ~20.
- **Copertura test a due velocità**: dove ci sono i soldi ottima (`payments` 7/8, `magic-sign` 3/3); dove c'è l'autonomia **cieca** (`agent/` 0/25, `banking/` 1/8, `telegram/webhook` 0, `portal/` 0/5).
- **16 chiamate Anthropic su 18 senza timeout** → un modello lento consuma il `maxDuration` fino al 502.
- **EmailJS non è "ritirato"**: vive in 12 call-site server (`stripe-webhook`, `portal/_notify`, `notify-viewing-created`) → due identità email in produzione.

---

## 5. Cosa vale DAVVERO (la tua domanda: "cos'è realmente utile a me")

Onestà brutale anche qui: **hai costruito il doppio di quello che ti serve, e il di più non è neutro — è rischio e manutenzione.**

### Tenere e curare — questo È il prodotto
Contratti/firma/incasso · pre-agreement · La Squadra (Commerciale/Gestore/Contabile) · il radar PFS · il journey inquilino · `/casa` · La Banca · i bot Telegram (wizard, viewing, smistatore) · il canone SEPA · la vetrina pubblica. **Qui vive il valore. Ogni ora spesa a irrobustire questo nucleo rende.**

### Parcheggiare o rimuovere — peso morto che sembra prodotto
| Cosa | Perché | Azione |
|---|---|---|
| **34 pagine `preview-*` in produzione** | laboratorio di design servito live (noindex sì, ma è superficie e confusione) | `.vercelignore` completo; tenere solo le finaliste da promuovere |
| **~48 progetti Vercel zombie** (di 50) | tutti "boom-*", "roma-boom-*" di ottobre 2025 | cancellare: ognuno è una copia del codice con env potenzialmente vivi |
| **Zone/Market Intelligence con numeri finti** | `ZI_ZONES`/`MARKET_SQM_BENCHMARK` hardcoded (`portal-app.js:24571,10739`), UI in inglese | o li colleghi al radar (dati veri che già raccogli) o togli i tab: un numero finto in console è un rischio decisionale |
| **Property Research Engine (PRE) + Casafari-PRE** | ~90 righe di zone + 25 funzioni orfane (`preProperties` scritta mai letta) | rimuovere (~700 righe) — **Casafari VERO resta**, è vivo |
| **Landlord DB** one-liner da 2.193 caratteri, UI inglese | duplica `users(landlord)` | fondere in Utenti |
| **Tenant Info Hub** 6 guide hardcoded EN | duplica `/welcome-to-rome` (già linkato) | togliere il contenuto, tenere il link |
| **`seed-listings.html`, `cockpit-preview.html`** | legacy ancora linkati e serviti (`portal-app.js:5124,14121`) | `.vercelignore` + togliere i link |

**La regola**: ogni pagina, ogni progetto, ogni tab con dati finti è una superficie che qualcuno un giorno crederà vera. Un software globale top ha **meno** superficie di BOOM oggi, non di più.

---

## 6. La causa comune — e perché riguarda "come sviluppi in altre chat"

Hai chiesto di tenere conto di come stai sviluppando BOOM in parallelo. È la parte più importante di questo audit, perché **spiega tutto il resto**.

I numeri che ho misurato: **159 commit in 14 giorni, 130 da sessioni AI parallele** (i "Lotti" della vetrina, il redesign su `claude/apartment-detail-redesign`, l'hold €300, M2/D1). Ogni sessione è brava, disciplinata, testa il suo pezzo. E ogni sessione **impara una lezione e la applica nel suo angolo**:

- `secretEqual` timing-safe esiste a `homie/_lib.js:150` — e 17 righe sotto un confronto insicuro non la usa.
- La CORS corretta (`startsWith('boum-roma-')`) esiste in `magic-sign/_shared.js:137` — e `_auth.js:74` ha ancora quella aperta a tutto `.vercel.app`.
- `geocode-all.js` **documenta e chiude** un DoS che `geocode-bake.js` lascia spalancato.
- `my-pass.js` richiede un token dove `viewings/pass.js` non lo richiede.
- Il rate-limit è la STESSA `Map` in memoria copiata ~20 volte.
- L'auth è passata da 4 implementazioni (agosto) a **17** oggi.

**Questo non è un difetto di competenza. È il difetto strutturale dello sviluppo multi-agente senza un sistema nervoso condiviso.** Diciassette sessioni che non si parlano producono diciassette soluzioni corrette e divergenti. Il codice è "costruito bene, diciassette volte separatamente".

**Le tre contromisure — questo è il cambiamento di processo che vale più di ogni singolo fix:**

1. **Una libreria di piattaforma, importata, mai copiata.** `api/_platform/` con UNA `verifyFirebaseToken`, UNA `requireAuth(roles)`, UN `rateLimit`, UNA CORS, UN `secretEqual`. Un test che **fallisce se qualcuno reintroduce una copia** (grep sul sorgente, stessa disciplina di `tests/squadra`). D'ora in poi ogni sessione importa, non reinventa.
2. **La CI deve BLOCCARE, non avvisare.** Oggi è advisory (deploya anche se rossa) e gira **4 suite su 60**. Con 130 commit AI/2 settimane serve un cancello vero: `npm test` completo obbligatorio prima del merge su main. Il costo di un test rosso ignorato cresce con la velocità.
3. **Un "contratto di piattaforma" in testa a CLAUDE.md** che ogni sessione legge: backup, auth, rate-limit, CSP, timestamp, timeout, id deterministici → "usa `_platform/X`, non scriverne un altro". La regola di propagazione diventa esplicita invece di dipendere dal fatto che una sessione si ricordi.

Finché lo sviluppo resta multi-chat parallelo — e va benissimo che lo sia, è ciò che ti dà questa velocità — **il collo di bottiglia della qualità non è più il singolo pezzo, è la loro coerenza.** Il livello "software globale top" si raggiunge lì.

---

## 7. Roadmap 30 / 60 / 90

**Settimana 0 — le tue azioni, ~90 minuti totali, valore enorme**
1. PITR Firestore ON + export su GCS (P0.1). *Se BOOM dovesse fare una cosa sola questa settimana, è questa.*
2. Secret `FIREBASE_TOKEN` su GitHub (P0.2) — dopo aver corretto `documents:121` (P0.3) nello stesso deploy.
3. Cancellare i ~48 progetti Vercel zombie (dopo aver verificato quale è quello live).

**30 giorni — chiudere l'emorragia (P0 + i P1 di sicurezza)**
- P0.4 XSS + P1.1 CSP minima (insieme: la CSP rende innocui i prossimi buchi).
- P0.5 fail-open + P0.6 pagamenti invisibili.
- P1.2 heartbeat su tutti i cron + P1.4 maxDuration + P1.5 pin stripe/sharp.
- P1.3 regressione pass, P1.6 endpoint deboli, P1.7 reserve importo, P1.10 get-ip.

**60 giorni — il sistema nervoso condiviso (§6)**
- `api/_platform/` + il test anti-copia. Migrare i 17 auth → 1.
- CI bloccante con `npm test` completo.
- Il contratto di piattaforma in CLAUDE.md.
- Pulizia scheletri (PRE/Casafari-PRE, Zone/Market finti, Landlord DB, Info Hub) e preview.

**90 giorni — l'altitudine (P2 strutturale)**
- Spezzare `portal-app.js` per pagina (`import()` dinamico) → boot da software vero.
- Ridurre le verità doppie (prima `clients+pfsClients`, poi `properties+listings` con migrazione).
- Copertura test dove oggi è cieca: `agent/` (0/25), `banking/`, `telegram/webhook`.
- Backup verificato con un **restore drill** reale (un backup mai testato non è un backup).

---

## 8. La riga finale

BOOM non è un prototipo travestito da prodotto. È un prodotto vero, con un nucleo che in due o tre punti è già migliore di software che si fanno pagare — e con una cintura di protezione che è stata cucita benissimo, a pezzi, da mani diverse che non si sono parlate. **Il salto al livello che vuoi non è costruire di più. È tre cose: un backup (oggi), il deploy delle regole che hai già scritto (oggi), e un sistema che costringa le prossime cento sessioni a condividere le lezioni invece di reimpararle.** Il talento c'è già, ed è ovunque nel codice. Manca solo che diventi *uno*.

---

*Audit del 2026-08-18 su `HEAD`. Prove: log runtime Vercel (7gg) + log CI GitHub + lettura riga-per-riga. I fix di sicurezza citati come "già scritti altrove" sono verificati nel repo. Caveat: `firestore.rules` è un file di repo e le regole attive in produzione sono più vecchie (drift provato) — le sezioni sulle rules vanno rilette dopo il primo deploy pulito.*
