# PORTAL AUDIT 360° — Agosto 2026

**Oggetto**: portal.html + js/portal-app.js (l'app admin), le 16 console satellite, lo stack e l'infrastruttura, l'uso reale da iPhone e desktop.
**Metodo**: 4 analisi indipendenti sul codice (sezioni, performance, mobile, debito+sicurezza) + i runtime log di produzione degli ultimi 7 giorni (Vercel) + i client-error reali arrivati da `/api/log`. Ogni affermazione ha un riferimento file:riga verificato.
**Studio precedenti collegati**: `MAGIC_SIGN_AUDIT_2026-07.md`, `LA_SCHEDA_STUDY.md`.

---

## 1. Verdetto in cinque righe

1. **Il prodotto è vivo e incassa** — contratti, firma, pagamenti, lead e visite sono maturi e usati; la macchina server (La Squadra, radar, journey) è la parte più moderna del sistema.
2. **Il portal paga un debito di forma, non di sostanza**: 28.121 righe in un solo file da 2,3MB scaricato e ricompilato a ogni apertura, 22 query Firestore al boot di cui 12 senza limite, re-render totale a ogni evento. Su desktop si sente poco, su iPhone si sente tutto.
3. **Su mobile il portal è ostile nei punti che usi di più** (dettaglio contratto = 15 bottoni su 8 righe, ricerca globale assente, target touch a 25px) — ma il pattern giusto esiste già in casa (pagina Clienti, manuale/verbale): va esteso, non inventato.
4. **La superficie admin reale è il doppio di quella navigabile**: 9 console satellite vive non linkate da nessuna nav, 2 "secondi portal" mai promossi né rimossi, 4 domini dati duplicati (properties↔listings, users↔landlords, clients↔pfsClients, PhotoStudio↔photo-lab).
5. **Tre falle di sicurezza vere** (una critica) e **un drift di configurazione in produzione**: le firestore.rules del repo non sono deployate su Firebase — il lucchetto anti-doppio-contratto sta fallendo in produzione da giorni (143 errori/settimana nei log).

---

## 2. Produzione: cosa dicono i log (7 giorni)

| Gravità | Evidenza | Stato |
|---|---|---|
| 🔴 | **`propertyLocks` 403 × 143** (ogni ora, `reminder-cron` sweepLocks) + 2 × "lucchetto non verificabile" durante submit REALI (31/7) → **le rules deployate su Firebase sono più vecchie del repo** | **AZIONE OPERATORE**: `npx firebase-tools deploy --only firestore:rules,storage --project boom-property-dashboards` (o console Firebase → Regole → incolla `firestore.rules`). Fix permanente in §9 (deploy automatico da CI) |
| 🔴 | **magic-sign submit 400 × 18** (2/8, 17:16–19:34, un utente = Anouk) — commit write con URL invece di resource name | ✅ Corretto e live il 2/8 sera; zero ricorrenze dopo; contratto firmato |
| 🟠 | **Timeout piattaforma × 58** su `employees/commerciale`, `leads/scan-inbox`, `pfs/scan-inbox` (kill a 60s a metà lavoro) | ✅ Corretto il 4/8: deadline morbida 48s, uscita pulita con `timeBoxed`, ripresa gratuita al giro dopo |
| 🟡 | **Crash iOS `ReferenceError: Notification`** dentro callback realtime (portal-app) — i crash che vedevi da iPhone | ✅ Corretto (doppio fix, anche dalla sessione parallela) |
| 🟡 | `photos/enhance` — listing `2SwJ8yD3ITXylrEtYIlL` con foto in formato non processabile, ritentato ogni notte | Da bonificare: sostituire/rimuovere quella foto dal listing |
| ⚪ | 1 × `MISSING_PROJECT_ID` su reminder-cron (4/8 01:01, mai ripetuto) | Transiente Vercel env — solo da tenere d'occhio |

---

## 3. Stack & infrastruttura

### Cosa regge bene
- **Vanilla + Firebase + Vercel senza build**: deploy in 20s, zero pipeline da mantenere, ogni pagina autonoma. Per un operatore solo è un vantaggio reale.
- Il **server-side è sano**: design system email unico, token derivati, idempotenza ovunque, heartbeat + alert Telegram, 32 suite di test che girano i handler VERI.
- **sw.js** ha imparato le lezioni Safari (network-first con tetto 6s, niente precache della shell).

### Dove il conto arriva (con i numeri)
| Problema | Numeri | Riferimento |
|---|---|---|
| **portal-app.js monolitico** | 2.404.383 byte / 28.121 righe / 681KB gzip — **79% del peso critico di boot**, parser-blocking, riscaricato a ogni apertura (no-store) | portal.html:245 |
| **Boot admin: 22 query, 12 senza limit** | `users, properties, contracts, payments, maintenance, clients, documents, invoices, rules` tutte `.get()` nude + 7 step lazy SEQUENZIALI (7 round-trip in fila) | portal-app.js:2637-2648, 2673-2738 |
| **Scritture al boot** | Ogni pagamento scaduto → un `update()` non batchato A OGNI apertura | portal-app.js:2655-2659 |
| **Listener doppioni** | `contracts` e `maintenance` scaricate DUE volte (get + snapshot iniziale, entrambi senza limite); listener `contracts` senza guardia di ruolo | portal-app.js:2913, 2980 |
| **Cache a metà** | `boom_data_cache` copre 10 collezioni su 22 → badge sidebar a 0 per i primi secondi; il refresh rifà comunque TUTTE le query (nessun delta) | portal-app.js:2609-2611 |
| **Render** | `renderPage()` = innerHTML totale del main a ogni evento (111 punti di invocazione); `checkAlerts()` O(n·m); Chart.js iniettato a OGNI pagina anche senza grafici | portal-app.js:3942, 2768, 4010 |
| **Config duplicata** | Init Firebase inline in 26 pagine HTML (vs `js/firebase-config.js` in 13) — una rotazione = 26 edit | — |

### Interventi proposti (stessa architettura, nessun rewrite)
- **I1 · Boot dieta** *(½ giornata, -60% tempo-a-utile su iPhone)*: `limit()` sensati sulle 12 query nude (contracts/payments attivi + archivio on-demand), i 7 step lazy in UN `Promise.all`, spostare le write "overdue" nel reminder-cron (che già gira ogni 15'), guardia di ruolo + `limit` sui listener contracts/maintenance.
- **I2 · Cache completa** *(2h)*: cacheData() su TUTTE le collezioni di stato → sidebar coi numeri veri all'istante; `JSON.stringify` in `requestIdleCallback`.
- **I3 · Spezzare portal-app.js per pagina** *(1-2 giorni, il più strutturale)*: core (state+router+nav+dashboard) + un file per sezione caricato on-demand (`import()` dinamico funziona senza build step). Da 681KB a ~150KB di boot critico. Il no-build resta.
- **I4 · Chart.js solo dove serve** *(30')*: caricarlo nel render delle 3 pagine che lo usano.
- **I5 · Config unica** *(2h)*: le 26 pagine → `js/firebase-config.js`.
- **I6 · CI che deploya le rules** *(1h + 1 azione tua)*: job GitHub Actions su push a main che fa `firebase deploy --only firestore:rules,storage` con un token repo-secret (`firebase login:ci` una volta). **Il drift di §2 non può più ripetersi.**

---

## 4. Mobile (iPhone) — l'uso reale

### Verdetto per flusso
| Flusso | Oggi | Perché |
|---|---|---|
| Dashboard | ✅ | progettata mobile (auto-fit + breakpoint dedicati) |
| Rispondere a un lead | ✅ | footer corto, WhatsApp nativo |
| Caricare un documento | ✅ | file-zone grande, sheet iOS nativo |
| Confermare una visita | 🟡 | modale ok, ma la tabella a 6 colonne obbliga scroll orizzontale per OGNI riga (Azioni ultima colonna) |
| Wizard nuovo cliente | 🟡 | funziona, stepper sfora in orizzontale |
| Aprire un contratto | 🔴 | **15 bottoni → ~8 righe → metà schermo di footer**, azione primaria per ultima |
| Pagamenti in ritardo | 🔴 | griglia `repeat(6,1fr)` non patchata (celle da 50px), bottoni riga a 25px |
| **Cercare qualcosa** | ❌ | la search globale è `display:none` sotto 800px: **su iPhone non esiste** |

### I difetti strutturali (tutti con fix noto)
1. Header sfora (~435px di contenuto su 390px, nessun `flex-wrap`/`overflow-x:hidden` sul body) → pagina che scrolla di lato.
2. Zero `env(safe-area-inset-*)` con PWA standalone dichiarata → header sotto la Dynamic Island, toast sotto la home indicator.
3. Touch target: `.btn-xs` ~25px usato 134 volte, `.btn-sm` ~36px usato 239 volte (Apple HIG: 44px); la "fix" esistente (`min-height:34px`) è un no-op.
4. Griglie inline `repeat(5/6/7,1fr)` in 9 pagine centrali NON coperte dal patch responsive (che si ferma a repeat(4)); 3 hanno lo stile inline che batte la media query.
5. Nessun body-scroll-lock sulle modali → scroll chaining iOS.
6. Sidebar `100vh` (mai `100dvh`) con 32 voci → **Impostazioni ed Esci finiscono sotto la chrome di Safari**.
7. `#boomBridge` largo 360px fisso → tagliato su iPhone mini/SE.

### La via: pattern già in casa
- **`.cli-row`** (portal.css:1151-1167): la riga-tabella che diventa card a 2 colonne con label — già testata sulla pagina Clienti. **Adottarla per Viewings, Pagamenti, Contratti.**
- **manuale/verbale**: `--safe: env(safe-area-inset-bottom)`, colonna max-640, card atomiche, CTA full-width 46px, input 15px.
- **banca/team**: `repeat(auto-fill,minmax(280px,1fr))` — griglie che si adattano senza una sola media query.

**Pacchetto M1 · "Portal in tasca"** *(1 giorno, trasforma l'uso quotidiano)*:
safe-area token globale + `overflow-x:hidden` su body + header compattato ≤600px · `.modal-footer` mobile (bottoni a 2 colonne, min-height 44px, primaria PRIMA) · patch `repeat(5/6/7)` + `!important` su `.stats-grid` · `.btn-xs/.btn-sm → 44px` a ≤600px · sidebar `100dvh` + padding safe · **search globale ricollocata su mobile** (icona 🔍 nell'header → overlay) · scroll-lock modali · Viewings e Pagamenti su `.cli-row`.

---

## 5. Sicurezza

| # | Gravità | Falla | Fix |
|---|---|---|---|
| S1 | 🔴 CRITICA | **`/api/generate-pass` firma .pkpass col certificato di produzione SENZA auth né rate limit** — chiunque conia carte "BOOM" con contenuti arbitrari (i gemelli pass-issue/push/diag sono protetti, questo no; chiamato però anche dalla pagina pubblica pass-delivery) | Token derivato sui link di delivery (pattern `my-pass.js` già esistente) + `guardPost` per le chiamate console. Da fare con attenzione ai chiamanti — progettato, non ancora applicato |
| S2 | 🔴 ALTA | **IBAN aziendale world-readable**: `settings/company` è `read: if true` e il portal ci scrive l'IBAN — le rules stesse documentano il rischio per `payout` ma `company` è rimasta fuori | Escludere `company` dalla regola pubblica (`x != 'company'`) o spostare i dati bancari in `payout` |
| S3 | 🟠 | `/api/notify-viewing-created`: relay email anonimo verso la tua casella (unico form pubblico senza honeypot+rate) | `rateOk` + honeypot come gli altri 10 form |
| S4 | 🟠 | `/api/canone-bot`: POST anonimo → Claude senza rate limit né cap sui messages (costo diretto) | `rateOk` + cap array |
| S5 | 🟡 | Zero Subresource Integrity sui 7 CDN della pagina che maneggia firme | `integrity=` sugli script pinnati |
| S6 | 🟡 | Storage: `passes/` scrivibile da qualunque utente autenticato (anonimo incluso) | restringere a admin |
| S7 | ⚪ | 2 Firebase apiKey diverse in giro (onboarding/tenant-registration su chiave vecchia); Maps key di esempio Google hardcoded | consolidare con I5 |

**Nota di merito**: il modello rules è ben disegnato (ruoli, `onlyChanges`, anti-enumerazione magicLinks, audit-log protetto, default-deny) e le superfici pubbliche `api/` hanno quasi tutte token derivati + honeypot + rate. Le falle sono eccezioni, non il pattern.

---

## 6. Rianalisi delle sezioni — una per una

### CORE — tenere, lucidare (qui vivi tutto il giorno)
| Sezione | Stato | Modifiche proposte |
|---|---|---|
| **Dashboard** | matura | metà dei contenuti è sepolta in un `<details>`; portare su "Oggi" anche lo stato Squadra (da team.html) e il ⛔ firme |
| **Contratti** | il cuore, ~5.000 righe | footer modale mobile (M1); i `prompt()` nativi (zona ARPE, mq, dati RLI) → mini-modali; testi articoli hardcoded → per ora ok (cambiano con l'accordo territoriale), ma segnalati |
| **Pagamenti** | matura | griglia stats patch (M1); bottoni riga 44px; spostare le write overdue nel cron (I1) |
| **Lead / Viewings / Inbox / Command Center** | mature | Viewings: tabella→`.cli-row`, UI in italiano; Lead: ricerca testuale in pagina; Command Center: editor bozze vero al posto di `window.prompt()` |
| **Commercialista** | matura | stato via URL invece di variabili globali (condivisibile/bookmarkabile) |
| **Burocrazia** | matura ma fragile | i tab 2-3 strippano l'header delle vecchie pagine con una REGEX sull'HTML — da sostituire con render diretti |

### NASCOSTE — esporle (mature ma irraggiungibili)
- **Regole & Automazioni** (680 righe, matura): non è in sidebar — aggiungerla.
- **Template**: raggiungibile solo da Contratti; prezzi hardcoded che DIVERGONO da `SERVICES` → unificare la fonte prezzi e linkarla.
- **Scheda 360° persona**: hub eccellente, solo via `openPerson()` — collegarla da ogni nome cliccabile.

### DOPPIE — unificare (4 duplicazioni di dominio)
| Doppione | Proposta |
|---|---|
| `properties` ↔ `listings` (AdminFlats) | gestionale e vetrina dello stesso immobile senza join: campo `listingId` sull'immobile + azione "pubblica/aggiorna vetrina" — una scheda sola |
| `users(landlord)` ↔ `landlords` (Landlord DB, pagina one-liner ES5) | migrare i campi utili dentro `users` + vista dedicata; deprecare la collezione doppia |
| `clients` ↔ `pfsClients` (riconciliati a runtime) | consolidare su un modello con `type` — rimuove `cliNormalize()` e i due tab difensivi |
| Photo Studio (portal) ↔ photo-lab.html | tenere photo-lab (ha l'AI enhance server); Photo Studio → link |

### SCHELETRI — decidere: farli veri o rimuoverli
| Sezione | Realtà | Proposta |
|---|---|---|
| Zone Intelligence · Analytics | KPI e insight **100% hardcoded** ("€875 Avg Rome" è una stringa) | o calcolarli dai `listings`+`pfsProperties` reali, o togliere il tab: un numero finto in console è un rischio decisionale |
| Market Intelligence | benchmark = 12 valori statici "stima 2024-25" | idem: derivarli dal radar (dati veri che già raccogli) o dichiarare la fonte in UI |
| Asseverazioni | pagina statica, zero dati | assorbita da Burocrazia+Fascicolo: rimuovere il tab |
| Property Research Engine + Casafari | ~700 righe orfane, nessuna rotta, collezione `preProperties` viva con UI morta | rimuovere (recupero ~700 righe sul bundle) |
| `renderPFSCommandCenter`/`renderPFSListPro` | ~400 righe mai chiamate (sostituite da pfs-command.html) | rimuovere |
| Rischio·Shield / Zero-Vacancy | motori eleganti, zero azioni transabili | Zero-Vacancy: aggiungere il tracking "contattato" (1 campo) e diventa utile; Shield: parcheggiare |
| Tenant Info Hub | 6 guide hardcoded EN nel JS | puntare a `/welcome-to-rome` + Manuale della Casa (già esistono, meglio) |
| Landlord DB | one-liner da 3.000 caratteri | riscrivere in 100 righe sul pattern card (o fondere in Utenti) |

### SATELLITI — dare un indice (9 console non linkate da nulla)
team, banca, pfs-command, salute, manuale, verbale, photo-lab, pre-agreement-admin (linkata), scheda-canone (linkata) + deals_v2 (bridge).
**Proposta: gruppo "Console" in sidebar** con le 6 mancanti (team, banca, pfs-command, salute, manuale, photo-lab) — zero sviluppo, solo link. La superficie che hai già costruito diventa finalmente raggiungibile.

### LEGACY — spegnere
`admin.html` (morta, redirect attivo ma codice nel repo), `admin-flats.html` (localStorage, superata), `setup-firebase.html` + `seed-listings.html` (one-shot di setup), `tenant-registration.html` (apiKey vecchia), `detail-v2.html` (zero riferimenti), `cockpit-preview.html` (un SECONDO portal completo, 3.442 righe, mai promosso — decidere: o si cannibalizzano le idee buone o si archivia). → `.vercelignore` + rimozione link.

---

## 7. Debito tecnico trasversale

- **EmailJS: 16 email partono ancora dal browser** (`sendBoomEmail` — tra cui OGNI notifica del portal, benvenuti, credenziali portale clienti, promemoria pagamento): se la tab si chiude l'email non parte, e hanno un'identità visiva DIVERSA dal design system server. Migrazione: 1 endpoint server generico + sostituzione dei 16 call site (~½ giornata, già proposta a luglio).
- **Allegato B/C: il PDF contrattuale nasce SOLO nel browser** (~800 righe client): se il portal non l'ha generato, la firma completa produce solo il certificato (il server lo salta "senza rumore"). Portare i generatori server-side (pdf-lib c'è già) = il contratto non dipende più dal browser dell'operatore.
- **Tabella zone canone DUPLICATA**: `js/canone-engine.js` (75 zone) vs una SECONDA copia inline in `scheda-canone.html`, pure editabile a mano — le fasce possono divergere tra il calcolatore e il Fascicolo che va all'ARPE. Far caricare il motore unico alla pagina (30' — **rischio conformità, priorità alta**).
- **~1.200 righe morte** censite in portal-app.js (54 funzioni) + 21KB di `boom-bg-roma.js` mai serviti.
- **4 gate auth diversi in api/** (`requireSecret`/`guardPost`/`requireRole`/`checkSecret`): consolidabili in 2.

---

## 8. Aggiunte proposte (nuovo valore, non solo pulizia)

1. **Deal Room** (già approvata, #19): la vista "un deal, una schermata" — lead→visita→PA→contratto→firma→incasso con la timeline e le 3 azioni successive. Sostituisce il saltare tra 6 sezioni.
2. **Ricerca globale anche su mobile** (parte di M1) — oggi il modo più veloce di trovare un cliente su iPhone non esiste.
3. **Rendiconto proprietario mensile** (#18, approvato): PDF automatico il 1° del mese dal design system — il prodotto che fa rinnovare i mandati.
4. **Digest giornaliero Telegram del portal** (il Regista già scrive alle 07:30): aggiungere i numeri di cassa (incassato ieri, rate in ritardo, firme pendenti) — il "portal senza aprire il portal".
5. **Stato Squadra in Dashboard**: la card salute agenti (da team.html) dentro "Oggi" — un guasto ai cron oggi lo scopri solo aprendo una pagina che non è linkata.
6. **Conservazione esterna** (#20, approvato): export mensile firmati+certificati fuori da Firebase.

---

## 9. Roadmap proposta

**P0 — questa settimana (sicurezza + produzione)**
1. ⚠️ **[TUA AZIONE, 5']** Deploy firestore.rules + storage.rules su Firebase (comando in §2)
2. S2 IBAN fuori dalla lettura pubblica + S3/S4 rate-limit (1h)
3. S1 generate-pass: token derivato sui link + guard (½ giornata, con test)
4. I6 CI che deploya le rules a ogni push su main (1h + il tuo `firebase login:ci` una volta)
5. Tabella zone unica in scheda-canone (30')

**P1 — la settimana dopo (l'uso quotidiano)**
6. M1 "Portal in tasca" (1 giorno) — il pacchetto mobile completo
7. I1+I2+I4 Boot dieta + cache completa (1 giorno) — portal reattivo su iPhone
8. EmailJS → server (½ giornata) — una sola identità email
9. Sidebar: gruppo "Console" + Regole in nav + pulizia scheletri rapidi (Asseverazioni, Info Hub, PRE/Casafari, funzioni morte) (½ giornata)

**P2 — strutturale (quando P0+P1 sono digeriti)**
10. I3 Spezzare portal-app.js per pagina (1-2 giorni)
11. Allegato B/C server-side (1 giorno)
12. Unificazioni dati: clients+pfsClients, poi properties+listings (per gradi, con migrazione)
13. Deal Room (#19) + Rendiconto (#18) + Conservazione (#20)

---

*Audit del 2026-08-04. I fix già applicati durante l'audit stesso (time-box cron, crash iOS, no-store /sign, Share Hub co-firma) sono live su main.*
