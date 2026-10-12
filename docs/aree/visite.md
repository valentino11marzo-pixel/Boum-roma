# Visite — ciclo visita, disponibilità, Regista, pass Wallet

> Dettaglio e storia di quest'area, spostati da CLAUDE.md il 12/10/2026 senza
> riscrivere nulla: stesse sezioni, stesso ordine. Le novità dell'area si
> aggiungono QUI (3-8 righe nella sezione giusta: cos'era, cosa cambia, dove
> sta il test). La mappa del sistema è in `CLAUDE.md`, le priorità in `ORA.md`.

### POST `/api/generate-pass`
Generates `.pkpass` files. Body: `{ passType, fields }` where passType is `viewing|tenant|referral|landlord`. Returns binary `.pkpass` data.

### Il ciclo visita (`/api/viewings/*` + `book.html` + Wallet pass)
A BOOM viewing behaves like a FLIGHT: confirmed → boarding pass + calendar,
then the system speaks at the crucial moments, then asks how it went. Two
modes, one pipeline: `mode:'person'` (address + one-tap directions +
geofenced Wallet pass) or `mode:'video'` (instant browser room, no app, no
account — `videoRoom()` derives an unguessable stable Jitsi URL from the
viewing id + server secret).
- `api/viewings/_lib.js` — pure helpers shared by every surface: video room,
  Google-Calendar URL, `.ics` (with a 3h VALARM), `primaryAction()` (join
  the call / open Maps), Rome-time formatting, pass URL.
- `api/viewings/_email.js` — the email family in the pre-agreement design
  system (black masthead, gold BOOM, one primary action): confirmation
  (ticket card + action + Google/Apple calendar + Wallet), the three
  reminders, the after-visit question (3 WhatsApp one-tap answers:
  interested / thinking / not the one), reschedule + cancel. IT/EN.
- `api/viewings/_moments.js` — THE COUNTDOWN, inside `reminder-cron` every
  run (not hourly — a 30-minute warning is worthless an hour late):
  **T-24h / T-3h / T-30m**, then **T+2h** "how did it go?" (also flips the
  viewing to `completed`). Each fires once (flags on the doc) inside a
  tolerant window; a missed run never skips, a double run never doubles.
  Also sends the confirmation **path-independently**: whoever set
  `status:'confirmed'` (this API, the portal's Viewings page, a hand edit),
  the client gets the kit exactly once (`confirmationSent`).
- `POST /api/viewings/confirm` — the operator's one move (admin/homie/cron
  auth): `{id, action:'confirm'|'reschedule'|'cancel', when, mode,
  durationMinutes, meetingPoint}`. Enriches from the listing, mints the
  video room, emails the client, pushes the Wallet pass. A reschedule
  re-opens the countdown (reminder flags reset).
- `GET /api/viewings/ics?id=` — public calendar file for Apple/Outlook.
- `GET /api/viewings/pass?id=` — the client's boarding pass, served for real:
  loads the LIVE viewing (address, coords, time, video room), signs it and
  streams `application/vnd.apple.pkpass`. `&meta=1` returns JSON for the
  delivery page's mockup. Replaces the old pass-delivery path, which POSTed
  hand-assembled URL params to `/api/generate-pass` (so the pass carried
  nothing) and then navigated to a `blob:` URL — which iOS Safari does not
  reliably hand to Wallet. pass-delivery.html now navigates to this URL for
  viewings, and its broken `<img>` logo (a file absent from the repo) is an
  inline SVG that cannot 404.
- **The operator's calendar fills itself** (`_ical.js` + `_invite.js`): every
  booking is emailed to `VIEWINGS_CALENDAR_EMAIL` (default `GMAIL_USER`) as a
  genuine iCalendar invitation — Gmail/Apple Mail/Outlook add it on their own,
  no OAuth, no API project, nothing to expire. Stable `UID` + growing
  `SEQUENCE` means a reschedule UPDATES that same event in place and
  `METHOD:CANCEL` deletes it; the client rides as ATTENDEE, video viewings
  carry `X-GOOGLE-CONFERENCE` so Google shows a join button, and two VALARMs
  (‑3h, ‑30m) ring on the operator's own devices. Wired into all three paths
  (self-booking, confirm/reschedule/cancel, path-independent confirmation).
- `GET /api/viewings/feed?key=` — **subscribe once, done forever**: a live
  calendar feed (`feedKey()` derived from `HOMIE_SECRET`, rotate to revoke) of
  every viewing from ‑30d to +120d, `REFRESH-INTERVAL:PT15M`. Google Calendar
  → "From URL", Apple Calendar → "New Calendar Subscription". Belt and
  braces with the invites: if a mail is ever missed, the feed still has it.
- Wallet: `buildViewingPass` gained `mode`/`videoUrl` — a video pass shows
  "VIDEO", leads with a **Entra nella call →** link and drops the geofence
  (a room has no address); an in-person pass keeps address, Maps link and
  the lock-screen trigger near the building. `_passkit.loadPassData` now
  reads `listings` before `properties` (book.html writes `listingId`) —
  previously book-created passes shipped with no address and no coords.
- `GET|POST /api/viewings/slots` — **real availability, instant
  confirmation** (the multinational leap: no more "propose a time and
  wait"). GET publishes bookable slots from `settings/viewingAvailability`
  (weekly Rome-time windows, per-mode duration person 45' / video 20',
  minimum notice, horizon, max/day) minus every live viewing plus a 15'
  gap. POST re-verifies the slot server-side (the grid can be seconds
  stale → 409 `slot_taken`), writes the viewing as **confirmed** — the
  slots ARE the operator's declared availability, so nothing is left to
  approve — mints the video room and sends the confirmation immediately
  (waiting for the cron would break the promise). Honeypot + email
  validation. `buildSlots()` exported and unit-tested.
- `book.html` — step 3 is now a real picker: **in person or video call**
  (video first-class, most clients are still abroad), day rail + time
  grid of genuinely free slots, "⚡ Instant confirmation", Rome time with
  the visitor's local offset. The confirmed screen leads with the one
  thing they'll tap on the day (directions / join call), then Wallet and
  calendar. No polling, no pending limbo.
- `api/viewings/_avail.js` — **the availability engine, one copy**. The
  public grid, the client's reschedule page and the operator's Telegram
  picker all read it, so they can never disagree about what's free.
  `loadConfig` / `busyBlocks(cfg, exceptId)` / `buildSlots` / `slotOffered`,
  plus the Rome-time helpers (offsets derived from `Intl`, no tz library).
  `exceptId` is what makes a reschedule possible at all — without it a
  viewing blocks itself and can never move by 30 minutes. Unit-tested
  (`node tests/viewings/avail.mjs`): step math, the 15' gap, notice,
  horizon, max/day, and the DST boundary.
- **Date operative di Roma (17/09)**: `romeDateKey` e `buildSlots` usano componenti numeriche in Europe/Rome. Il mese breve di `Intl` può essere «Sept», mentre la vecchia tabella accettava solo «Sep»: settembre diventava mese 00 e la griglia restava vuota.
  Conversione condivisa, `romeParts` di visualizzazione invariato. `viewings` verifica tutti i mesi, cambi giorno/anno, bisestile e due transizioni DST; due mutazioni riproducono i difetti.
  La correzione vale per i nuovi calcoli. Le date già salvate richiedono una verifica distinta; nessun dato storico viene riscritto.
- `api/viewings/_busyics.js` — **il calendario Workspace dentro la griglia**
  (la risposta a "non posso avere disponibilità istantanea costante su tutti
  gli appartamenti"): legge gli indirizzi ICS segreti (`BUSY_ICS_URLS` env
  e/o `busyIcs` sul doc `settings/viewingAvailability`) e ogni impegno REALE
  dell'operatore diventa un blocco per `busyBlocks()` — book.html, la pagina
  self-service del cliente e il picker Telegram smettono INSIEME di offrire
  quello slot. Bloccare l'instant booking per un pomeriggio = trascinare un
  evento in Google Calendar, nessuna UI BOOM. TRANSPARENT ("libero") e
  CANCELLED non bloccano; gli eventi BOOM stessi (UID
  `boom-viewing-*`/`viewing-*@boomrome.com` — inviti, .ics cliente, feed)
  sono filtrati, altrimenti la copia in calendario di una visita bloccherebbe
  il SUO stesso reschedule; **se il feed anonimizza gli UID** (calendario
  condiviso in modalità "solo disponibilità" — quello che resta quando
  l'admin Workspace disattiva la condivisione esterna dei dettagli, e in cui
  l'indirizzo *segreto* non compare affatto) subentra `dropBoomEchoes()`:
  un blocco esterno che inizia E finisce entro 2' da una visita viva è
  l'eco di quella visita, non un impegno diverso — scartarlo è sicuro anche
  se la stima sbaglia, perché la visita stessa è già nella lista occupati;
  ricorrenze espanse nell'orizzonte (DAILY/WEEKLY
  con BYDAY/INTERVAL/COUNT/UNTIL/EXDATE, istanze spostate via RECURRENCE-ID,
  MONTHLY/YEARLY semplici — l'esotico contribuisce solo la prima istanza);
  gli impegni esterni NON consumano `maxPerDay` (sono tempo occupato, non
  visite); fetch con cache 2' + stale 6h e SEMPRE fail-open: un calendario
  irraggiungibile non spegne mai le prenotazioni. È integrazione senza
  credenziali OAuth: l'URL segreto È la credenziale (rotarlo da Google lo
  revoca). Test: `node tests/viewings/busyics.mjs`.
- **`GET|POST /api/viewings/calendar-check` + `/calendario` sul bot** — il
  prezzo del fail-open è che il silenzio è ambiguo ("nessuno slot tolto" =
  collegato e libero, oppure non collegato?). Questa è la risposta esplicita:
  legge il calendario ADESSO (bypassa la cache), dice quante sorgenti, se
  rispondono, quanti eventi ha letto, quanti **occupano tempo** e quali sono
  i prossimi. Non mostra MAI l'URL (è la credenziale). **Trappola vera,
  incontrata in produzione**: gli eventi creati in automatico da Gmail
  (`eventType:FROM_GMAIL` — voli, hotel, conferme) nascono `TRANSPARENT`
  cioè "Libero", quindi NON bloccano; il verdetto lo dice esplicitamente
  invece di far concludere che l'integrazione è rotta. Per bloccare uno
  slot l'evento va segnato **"Impegnato"** in Google Calendar.
  **Nota Workspace**: se l'admin del dominio tiene "Opzioni di condivisione
  esterna per i calendari principali" su *"Solo informazioni sulla
  disponibilità"* o su *nessuna condivisione*, l'indirizzo **segreto** non
  compare affatto nel pannello del calendario — va portato a "Condividi
  tutte le informazioni" (è un permesso, non pubblica nulla), oppure si usa
  l'indirizzo pubblico in modalità disponibilità (lì entra in gioco
  `dropBoomEchoes`, perché quel feed anonimizza gli UID).
- **Annullamento admin dal portal**: la riga visita ha ✕ Cancel anche sulle
  CONFERMATE (le instant self-booked nascono confermate — prima il bottone
  esisteva solo sulle pending) e passa da `/api/viewings/confirm` →
  `_apply.js`: email di annullamento al cliente, METHOD:CANCEL che toglie
  l'evento dal calendario, Wallet pass aggiornato, countdown spento. Prima
  il portal scriveva solo `status:'cancelled'` su Firestore: il cliente non
  veniva avvisato e si presentava al portone. Aggiunti anche ↩ Reschedule
  sulle confermate, il filtro ✕ Cancelled, e i modal ora mostrano/prefillano
  l'orario reale anche per i doc self-booked (che hanno solo i campi ISO).
- **Il double confirm** (`requireApproval`, default **true** in
  `_avail.js` DEFAULTS + toggle nel modal ⚙️ Disponibilità): l'instant
  booking confermava da solo, ma una visita è un impegno su un immobile
  vero e l'operatore vuole filtrare chi entra. Ora il cliente sceglie
  comunque uno slot REALE (nessun ping-pong di date) e **quell'orario resta
  tenuto per lui** — `busyBlocks` conta già le pending — ma la visita nasce
  `status:'pending'`: niente campi `confirmed*`, niente pass, niente invito
  in calendario, niente countdown. Parte solo `sendRequested()` ("l'orario è
  tenuto, ti confermiamo entro poche ore"), e la card con ✅ Conferma arriva
  su Telegram da `notify-pending` entro un minuto; alla conferma il kit
  completo parte da `_apply.js`/`_moments.js` come sempre. La GET di
  `/api/viewings/slots` espone `requireApproval` e **book.html cambia le
  parole** (via `applyApprovalCopy()`: niente "⚡ Instant confirmation", il
  bottone diventa "Request this viewing", e la schermata *"Request sent"* —
  che esisteva già ed era irraggiungibile — diventa la sua strada). Test:
  il ramo è asserito sulla SORGENTE (`tests/viewings/availability-ui.mjs`):
  l'uscita anticipata deve precedere `sendConfirmation` e `inviteOperator`,
  perché un pass per una visita non confermata è una bugia al cliente e un
  evento fantasma nell'agenda dell'operatore.
- **⚙️ Disponibilità nel portal** (`js/viewing-availability.js`, UMD come
  boom-geo/canone-engine → `window.BOOM_AVAIL`, caricato da portal.html):
  fino al 2026-07 le finestre di prenotazione erano i **default hardcoded**
  di `_avail.js` (lun-ven 10-13 e 15-19, sab 10-13) — nessuna pagina le
  mostrava e **nessuna le poteva cambiare**: l'operatore poteva solo
  TOGLIERE tempo dal calendario, mai ridefinire l'orario di lavoro. Il
  bottone sulla pagina Viewings apre il modal che scrive
  `settings/viewingAvailability` (finestre per giorno in ora di Roma,
  durate persona/video, preavviso, orizzonte, max/giorno) con anteprima
  live di quante visite entrano davvero a settimana. **La divisione dei
  ruoli**: la REGOLA sta qui, le ECCEZIONI del singolo giorno restano un
  evento "Impegnato" in Google Calendar. `buildConfig` **rifiuta** un
  valore impossibile invece di aggiustarlo (una finestra scritta male non
  dà errore: dà una griglia vuota, e lo scopre il cliente). I default
  della console sono asseriti UGUALI a quelli del server nei test —
  divergere significherebbe far modificare all'operatore una regola che
  non è in vigore.
- **L'avviso quando forzi un orario** (`checkSlot`): dal portal Confirm e
  Reschedule accettano QUALSIASI data/ora (sei l'operatore, a volte devi
  forzare) — ma prima nessuno diceva che stavi sovrapponendo due clienti.
  Ora i modal mostrano in tempo reale ⚠️ sovrapposizione (col nome del
  cliente e l'ora), ℹ️ fuori finestra / giorno chiuso / passato, oppure
  ✓ libero. **Avverte, non blocca.** Test: `node tests/viewings/availability-ui.mjs`.
- **La geometria della giornata** (`travelGapMinutes` in `_avail.js`): il
  gap tra due impegni non è più un 15' piatto — Roma non è un punto. Visite
  IN PERSONA sullo stesso immobile si INCATENANO (gap 0: tre clienti, un
  viaggio — il grid offre lo slot adiacente); tra immobili geocodificati il
  gap è il viaggio vero (haversine + euristica Roma ~8'+3,2'/km, clamp
  15–45'); video = 15' piatto (nessun viaggio); tutto ciò che non si conosce
  (doc legacy senza coordinate, blocchi ICS esterni) = 15' identico a prima.
  Il contesto (l'immobile che si sta prenotando) arriva da book.html (che
  già mandava `listingId`), dalla pagina self-service del cliente e dal
  picker Telegram; `slots.js`/`_apply.js` stampano `lat`/`lng` sul doc
  visita alla creazione/conferma così `busyBlocks` non fa letture extra.
  Test: `node tests/viewings/gap.mjs`.

### Il Regista (`api/regista/*` — cron 05:30 UTC + Telegram)
Il quarto membro de La Squadra: dirige la GIORNATA dell'operatore.
- **Il Foglio di Chiamata** (`_brief.js`, deterministico — un call sheet
  deve essere GIUSTO, non eloquente: zero AI): ogni mattina alle 07:30 su
  Telegram la timeline delle visite di oggi coi viaggi reali tra una e
  l'altra (stessa euristica della griglia — foglio e grid non possono
  divergere), cosa è successo stanotte (prenotazioni self-service,
  spostamenti del cliente), le richieste da confermare → /visite, i task di
  oggi con bottoni ✓ Fatta / ⏰ +1g, e domani in una riga. Silenzioso a
  giornata vuota; `/giornata` lo manda on demand (anche vuoto).
- **La memoria task** (`_tasks.js`, collection `operatorTasks` admin-only in
  firestore.rules): l'operatore scrive al bot in linguaggio naturale
  ("ricordami di comprare le lampadine per Pigneto domani alle 15") →
  `parseTaskText`, parser REGEX a grammatica chiusa (mai un'allucinazione:
  oggi/stasera/domattina/domani/dopodomani/giorni della settimana — con
  lookaround espliciti, `\b` è cieco dopo "giovedì" — /task, DD/MM, "5
  settembre", "il 15", orari IT/EN am/pm; grammatica pinnata nei test).
  `/task` lista gli aperti. **Un task CON orario diventa un VERO evento nel
  calendario del telefono** (invito iCal UID `boom-task-<id>`, SEQUENCE
  crescente): ✓ Fatta → METHOD:CANCEL e l'evento sparisce da solo, ⏰ +1g →
  l'evento si sposta. `_busyics.js` filtra `boom-task-*` così un task non
  mangia mai uno slot prenotabile via round-trip ICS.
- **Task automatici** (nel run del cron, id deterministici
  `task_prep_<giorno>_<immobile>` / `task_esito_<viewingId>` — un rerun non
  duplica MAI, la data sta in testa all'id così la troncatura non la taglia):
  🔑 preparazione chiavi/accesso per ogni immobile con visite in persona
  oggi (l'orario della prima visita nel titolo; se le visite vengono
  annullate il prep task si auto-VOIDa), 📋 "esito visita" per ogni visita
  completata ieri — il follow-up che decide il fatturato, messo dove
  l'operatore lo vede.
- Heartbeat `teamHealth/regista` (card 🎬 in `/team`), alert Telegram dopo 3
  run falliti, `?dry=1` per l'anteprima. Callback `tkd:`/`tks:` ≤64 byte per
  costruzione. Test: `node tests/regista/run.mjs`.
- `api/viewings/_apply.js` — **the ONE place a viewing changes state**.
  Four surfaces confirm/move/cancel (the operator's API, their Telegram
  buttons, the client's own page, the portal); the side-effects — email,
  Wallet push, calendar invite in place, reminder-flag reset — live here
  once, so they cannot drift. `confirm.js` is now a thin auth wrapper.
- **The client owns their appointment** — `POST /api/viewings/manage` +
  `viewing.html` (`/viewing?t=<ref>`). No login: the link IS the
  credential (`manageToken` in `_lib.js` is *derived*, not stored, so
  every viewing ever created already has a valid one, no migration;
  rotating `HOMIE_SECRET` revokes them all). Ops: `lookup` (ticket +
  free slots), `slots` (the other mode's grid), `reschedule` (re-verified
  server-side → 409 `slot_taken`), `cancel` (allowed right up to the
  start). Every change runs through `_apply.js` **and pings the operator's
  Telegram immediately** — a client rescheduling themselves is never a
  silent surprise. The page is English-first with IT toggle, shows Rome
  time next to the visitor's own clock, and carries the day-of action,
  Wallet and .ics. Linked from the confirmation email, the T-24h reminder,
  the reschedule email and `book.html`'s confirmed screen.
  **Flight status (LO SCALO, W1)**: la pagina veste il biglietto da schermo
  di stato volo — rotta `ROM → <codice zona>` dal lessico condiviso
  `js/scalo-codes.js` (una copia con pass-delivery e book; nessun match →
  HOME, mai inventato), numero `BM ····` DERIVATO dall'id, e il countdown
  T-24h / T-3h / T-30m disegnato sugli STESSI momenti che `_moments.js`
  esegue — stato puramente temporale, mai un "già spedito". Su /book la
  schermata confermata È la carta d'imbarco (stessa grammatica); la
  pending resta "Request sent": un pass su una visita non confermata è
  una bugia. Test: `node tests/scalo/run.mjs`.
- **Telegram: the agenda in your pocket** (`api/telegram/_viewings.js`).
  Every viewing request pings the admin chat (via `notify-pending`, every
  minute) as a card with the three moves — **✅ Conferma <l'orario
  proposto>** (one tap, no typing), **🔁 Sposta** (a real slot picker:
  day rail → times, mode switch person⇄video, re-verified before writing),
  **✖️ Annulla** (two steps, because it emails the client). Self-booked
  viewings arrive as a notification with Sposta/Annulla. `/visite [giorni]`
  prints the week grouped by day and re-sends an actionable card for
  anything still open. Callback data is capped at 64 bytes by Telegram —
  the encoding (`vok/vmv/vdy/vtm/vmo/vxq/vxx/vbk`, mode as one char, time
  as base36 epoch-minutes) is asserted in `node tests/viewings/telegram.mjs`
  along with HTML escaping, since one oversized button silently kills the
  whole keyboard.
