# La Squadra, la scala della fiducia e la Segretaria (Oggi)

> Dettaglio e storia di quest'area, spostati da CLAUDE.md il 12/10/2026 senza
> riscrivere nulla: stesse sezioni, stesso ordine. Le novità dell'area si
> aggiungono QUI (3-8 righe nella sezione giusta: cos'era, cosa cambia, dove
> sta il test). La mappa del sistema è in `CLAUDE.md`, le priorità in `ORA.md`.

## La Squadra (AI employees — api/employees/*)

Scheduled "employees" that run the back office autonomously. Same
infrastructure as the PFS radar: heartbeat per run (`teamHealth/<employee>`,
Telegram alert after 3 consecutive failures via `api/pfs/_health.js`), a
compact run report (`teamReports`), and — crucially — **no new approval
surface**: anything outbound (emails to tenants/leads) is PROPOSED into the
existing `action_queue`, pinged to Telegram within a minute by
`api/telegram/notify-pending.js`, and sent by `api/agent/execute.js` only
after a human tap. Shared plumbing in `api/employees/_lib.js`
(`proposeAction` is idempotent via `contextHash` — reruns never duplicate).

| Employee (cron) | Schedule (UTC) | What it does |
|---|---|---|
| `/api/employees/contabile` | daily 04:40 | Fiscal picture from live data: obligations due/overdue (`js/fiscal-engine.js`, landlord + company from paid `invoices` by quarter), commercialista document checklist per contract (`js/taxpack-engine.js`), collections YTD + late payments. Telegram only when actionable. On the 1st of the month emails a "chiusura mese" recap (`ACCOUNTING_EMAIL` env, falls back to `GMAIL_USER`). |
| `/api/employees/gestore` | daily 05:10 | Property manager: drafts payment-reminder emails (≥3gg late, re-proposes weekly via ISO-week contextHash) and signature nudges with the party's Magic-Sign link (`/sign?sign=<token>`) as approvable `action_queue` items; Telegram digest of renewals ≤90gg, compliance deadlines (`js/compliance-rules.js`), maintenance open >48h. |
| `/api/employees/commerciale` | every 2h, 06-18 | Lead responder, property-aware: any lead still `new` after a 20-min human window gets a Claude-drafted first reply (same persona as `agent/ai.reply`) proposed for approval; still `new` after 48h (grade A/B or apply/reserve) gets one templated follow-up. Caps per run; dedupe before paying for the AI call. |

All three accept POST with Vercel cron secret, `X-Homie-Secret`, or an admin
Firebase ID token (see `api/pfs/_guard.js`); `?dry=1` computes without
writing/notifying; contabile also accepts `?monthly=1` to force the monthly
close email.

**Console**: `team.html` (`/team`, admin-only, noindex) — status dot + last
run per employee (the PFS radar appears as "Lo Scout" rolling up
`pfsRadarHealth`), pending proposals, latest reports, "Esegui ora" buttons.

### L'ORGANIGRAMMA (`js/squadra-registry.js` + `goTo('squadra')` nel portal)
I tre `api/employees/*` sono la punta: BOOM ha **23 cron** e ~19 processi che
agiscono da soli su dati, clienti e soldi veri. L'unico posto che li elencava
era una lista **scritta a mano** dentro `team.html`, ferma a **8 voci**:
mancavano — fra gli altri — il Selezionatore (archivia lead), il Fotografo
(alle 03:20 riscrive le foto degli annunci), il Copywriter (ne riscrive i
testi), il Rendiconto (il 1° del mese manda un PDF a ogni proprietario) e
l'Archivista (spedisce fuori piattaforma l'archivio legale). Nessuno se n'era
accorto perché **niente la confrontava con la realtà**.
- **La riga che mancava.** Di un dipendente non basta sapere se è vivo (il
  pallino verde): serve sapere **cosa fa da solo**. Letta sul codice la
  risposta è netta — **su ~19 agenti, DUE passano da approvazione umana** (il
  Gestore e il Commerciale, via `proposeAction` → `action_queue`). Journey,
  Segugio, Rendiconto e Contabile **mandano email a inquilini, iscritti e
  proprietari senza che nessuno tocchi niente**. Va benissimo che sia così —
  è il motivo per cui la macchina regge senza personale — ma dev'essere
  scritto, non una scoperta archeologica nel sorgente. Il desk lo mette in
  testa alla pagina: *"scrivono ai tuoi clienti senza chiedertelo"*.
- **La lettera di assunzione.** Ogni agente dichiara `hired` (perché esiste),
  `mandate[]`, e le tre liste che sono il suo contratto: `autonomy.solo` /
  `.porta` / `.mai`. Più `reach[]` — le chiavi che gli abbiamo dato (parla ai
  clienti · scrive a te · archivio · file · soldi · vetrina · AI) — e
  `approval` (`mai|sempre|parziale`). `attentionOf()` non misura
  l'importanza ma **quanto costa caro se sbaglia mentre nessuno guarda**.
- **Non può tornare alla deriva.** `driftVsCrons()` confronta il registro coi
  cron veri di `vercel.json`: un cron non dichiarato (*dipendente fantasma*)
  e un agente che punta a un cron inesistente sono **entrambi errori di CI**.
- **Una copia sola.** La sezione nel portal e `/team` leggono lo STESSO
  registro (stessa disciplina di `_avail.js`): non possono più divergere. La
  voce di menu 🤖 La Squadra era `window.open('/team','_blank')` — una scheda
  nuova — ed è ora una sezione del portale.
- **Si disegna senza Firestore.** Mansioni, autonomia e confini sono
  conoscenza statica: la pagina è intera prima che parta una lettura, e la
  salute arriva dopo in fire-and-forget (regola Safari — mai un await sul
  percorso di render). Il re-render dei pallini **salta se hai un fascicolo
  aperto**, altrimenti te lo richiuderebbe sotto gli occhi.
- **LA DIREZIONE** (`api/_squadra.js` + `settings/squadra`): vedere un
  dipendente e poter premere "esegui ora" non è dirigerlo. Le soglie erano
  costanti nel sorgente — `LATE_AFTER_DAYS = 3` in gestore.js,
  `HUMAN_WINDOW_MS = 20 min` in commerciale.js, `DAILY_AI_CALL_CAP = 12` in
  leads/brain.js — quindi "sollecita dopo 5 giorni invece di 3" voleva dire
  un deploy, cioè in pratica non si cambiava mai. Ora le 10 manopole dei tre
  agenti collegati si girano dal fascicolo; i **default e gli intervalli
  ammessi stanno nel registro**, letto sia dal browser sia dal server
  (`api/_squadra.js` importa `js/squadra-registry.js` — pattern già in uso da
  `compliance-rules`/`canone-engine`), così la console non può mostrare un
  valore diverso da quello in vigore.
  **Due severità di proposito**: alla PORTA `validateKnobs` **rifiuta** un
  valore impossibile invece di aggiustarlo (un valore corretto in silenzio è
  una regola che l'operatore crede di aver messo e non è quella applicata —
  la lezione di `buildConfig`); a RUNTIME `resolveKnobs` non esplode mai —
  torna al default e lo scrive nel report (`rejectedLine`), perché un cron
  che muore per un refuso in un campo è il modo peggiore di scoprirlo.
  Fail-open: Firestore irraggiungibile ⇒ default, gli stessi che vede la
  console.
- **Regola dura: solo manopole collegate.** Un campo che non fa niente è
  peggio di nessun campo — lo giri, non succede nulla, e da lì in poi non ti
  fidi più della pagina. Il test lo rende meccanico: ogni manopola dichiarata
  dev'essere **letta davvero** (`k.<chiave>`) nel sorgente del suo agente, e
  il browser verifica che chi non ha manopole non ne disegni.
- Test: `node tests/squadra/registry.mjs` (anti-deriva, lettera di assunzione,
  manopole non finte, e la **garanzia di non-regressione**: senza impostazioni
  salvate i default sono pinnati ai valori che le costanti avevano, così il
  deploy non cambia comportamento in silenzio su clienti veri — verificato per
  mutazione) e `node tests/squadra/desk.mjs` (monta la sezione in un
  **Chromium vero** con `window.db` inesistente e pretende tutti gli agenti, i
  tre elenchi su ogni scheda, i badge veri e i campi solo dove sono collegati;
  si auto-skippa senza playwright).

### LA SCALA DELLA FIDUCIA (`js/fiducia-engine.js` + `api/employees/_fiducia.js` + `/fiducia`)
L'auto-invio MISURATO disegnato in STUDIO_HOMIE §4 e deciso in
STUDIO_ORGANICO: le bozze che l'operatore approva da mesi con lo stesso tap
(544 ultime parole di clienti senza risposta = il costo di quel collo di
bottiglia) possono partire da sole — ma solo il PROVATO, e sotto controllo.
- **Il giudizio è nel motore puro** (`BOOM_FIDUCIA`, UMD come boom-geo):
  la categoria è il PREFISSO del `contextHash` (mai `kind`, troppo largo:
  'reply' copre sia la prima risposta AI sia il follow-up template);
  promuovibili SOLO testi template — `commerciale:followup`,
  `gestore:payrem`, `gestore:sign`. `commerciale:first` (bozza AI a un
  contatto nuovo) è in `NEVER` per costruzione: non parte mai da sola
  nemmeno accesa a mano nel doc di config. Il verdetto (`autoVerdict`, i
  cancelli IN ORDINE, testati per mutazione): interruttore → categoria →
  mai-promuovibile → opt-in → campione ≥ `minSample` (30) → tasso ≥
  `minRate` (95%) → escalation (avvocato/denuncia/truffa/rimborso… nelle
  parole del CLIENTE = torna a un umano). Gli invii automatici NON entrano
  nel campione (`fiduciaAutoSent` escluso da `statsFor`): la scala non può
  autoalimentarsi.
- **Auto-invio ≠ invio istantaneo**: la bozza si ARMA con `graceMin` (10')
  di grazia — card Telegram con **✋ Ferma — decido io** (`fstop:`, il doc
  resta pending coi tasti Approva/Rifiuta: fermare ≠ rifiutare), ✅ Manda
  subito e ❌ Rifiuta. Allo scadere parte dallo STESSO executor del tap
  manuale (`api/agent/execute.js` in-process) → stessa strada, stesso
  outbox WhatsApp, stessa idempotenza. Digest ogni sera alle 19
  (idempotente: `heartbeat/fiducia-digest-<giorno>`, fsCreate 409).
- **Dove gira**: dentro `notify-pending` (ogni minuto), PRIMA delle card
  normali (il tick marca `telegramNotifiedAt` così la stessa azione non
  riceve due card) e best-effort (un suo errore non ferma card/lead/visite).
  Il kill switch vince anche sulle bozze GIÀ armate: spegnere DISARMA.
- **Config**: `settings/fiducia` {enabled, graceMin, minSample, minRate,
  categories} — default TUTTO SPENTO (pinnato nei test: il deploy non
  cambia comportamento finché l'operatore non gira gli interruttori).
  Valori impossibili rifiutati al default, mai aggiustati in silenzio
  (disciplina `resolveKnobs`). Si comanda da Telegram: **`/fiducia`** =
  quadro (per categoria: on/off, decisioni storiche, tasso, pronta o in
  attesa dei numeri) + interruttori inline (`ftg:`).
- Test: `node tests/fiducia/run.mjs` — cancelli per mutazione, giunzioni
  sulla sorgente, e il giro VERO su Firestore in memoria: default = niente,
  armo → grazia → executor reale → digest, ✋ e kill switch che vincono.

### LA SEGRETARIA (`js/segretaria-engine.js` + `api/segretaria/_core.js` + 🤖 sulla card)

- **IL 409 CHE FERMAVA WHATSAPP (21/09/2026, sera — letto nei log di Vercel,
  non dedotto)**. Nelle 24 ore: `/api/homie/message` **946 × 409** contro
  430 × 200, tutti da quando il ramo del 21/09 è andato in produzione (13:04
  UTC), e dalle 21:13 UTC in poi SOLO 409, uno ogni 23 secondi: il Mac
  ritentava lo stesso messaggio all'infinito e nessun WhatsApp entrava più in
  Inbox né in Oggi. Causa: il resolver «Conversazione stabile» rispondeva 409
  a OGNI conflitto d'identità senza `ingestFallback` — e i conflitti più
  comuni sull'archivio VERO sono **permanenti**: la chat del numero nata
  prima del lead e senza `leadId` (`unbound_whatsapp_conversation`), un
  doppione di lead con lo stesso numero (`shared_contact_identity`), il
  numero della chat diverso da quello del lead (`phone_conflict`). Un 409 su
  una condizione che non può risolversi da sola è un messaggio perso — o,
  con un client che ritenta, una coda bloccata in testa. Due regole nuove in
  `api/homie/message.js`, entrambe verificate per mutazione:
  1. **Un messaggio non si rifiuta MAI per una questione di identità.** Il
     conflitto resta un conflitto (nessuna fusione, nessun legame scritto,
     nessuna identità del lead rivendicata), ma il messaggio si SALVA sulla
     chat onesta — quella del numero da cui è arrivato, `conv_whatsapp_<n>`,
     creata se manca; senza numero la primaria del lead — con
     `conversationBindingConflict` sopra e risposta **200**
     `conversationStatus:'conflict'`. L'identità della chat esistente resta
     la sua (telefono compreso). La Segreteria non iscrive casi su quella
     chat finché il dubbio non è sciolto, e ora l'Inbox LO DICE
     (`inboxBindingNotice`: prima quel campo non lo leggeva nessuno e il
     silenzio era indistinguibile da un guasto). Il motivo va nel log come
     codice, mai un dato.
  2. **La chat storica senza legame viene ADOTTATA, non rifiutata.** Se la
     chat del numero esiste, non porta alcun `leadId`, il lead non ha alcuna
     chat e nessun'altra scheda ha quel numero (`sharedIdentity`), il lead la
     adotta con lo stesso commit atomico del primo messaggio (`attachCid`):
     un solo CID, backlink nei due sensi, e da lì il caso in Oggi. È il caso
     più frequente dell'archivio (ogni contatto entrato da un'altra porta che
     aveva già scritto su WhatsApp). Due chat con storia restano due chat
     (regola di Codex intatta: `multiple_established_conversations` →
     fallback sulla primaria, dichiarato).
  Contratto per il Mac (`bot/HOMIE.md`): **200 = accettato** (anche in
  conflitto), **503 = ritenta più tardi**, un 4xx = payload sbagliato, non
  si ritenta uguale. Test: `tests/segretaria/conversation-binding.mjs`
  (chat storica adottata; legata a un altro lead → 200 col conflitto e
  nessun legame; doppione → 200 sul numero; telefono diverso → identità
  intatta; retry → dedup; tre mutanti: il 409 rimesso, l'adozione tolta, il
  telefono riscritto).

- **L'INTERRUTTORE CHE NON ESISTEVA (stessa sera)**: `settings/segretaria.
  prepareCases` e `prepareSince` — i due cancelli senza cui il worker esce
  subito (`enabled:false, prepared:0`) e `refreshTrackedFollowUp` non iscrive
  NESSUN caso nuovo — non avevano alcuna superficie che li scrivesse: né
  portal, né Telegram, né endpoint. La Segreteria era costruita, deployata e
  ferma per costruzione, e Oggi diceva «Preparazione automatica sospesa»
  senza un tasto per accenderla. Ora `POST /api/segretaria/preparation`
  (admin, `{prepareCases:boolean}`): all'accensione stampa `prepareSince`
  SOLO se manca (sospendere e riaccendere non riavvolge la finestra:
  l'arretrato resta fuori dal rollout, come da disegno), il kill switch
  `enabled:false` vince e lo dice (409 `segretaria_disabled`), risponde col
  monitor riletto. In Oggi: **▶ Attiva la preparazione automatica** /
  «Sospendi» nel blocco di stato (`oggiSegretariaSwitchPreparation`); `/segretaria`
  su Telegram dice quando è sospesa e dove si accende. Nessun invio nasce
  dall'interruttore: ogni consegna resta una conferma dell'operatore.
  **Da fare a mano una volta**: `npx firebase-tools deploy --only
  firestore:indexes` — l'indice `messages(conversationId ASC, at DESC)` è
  dichiarato in `firestore.indexes.json` ma la CI deploya solo rules+storage
  (aggiungerlo alla CI in `--non-interactive` fallirebbe al primo indice
  creato dalla console e assente dal file). Senza indice la cronologia
  lunga degrada al fallback, non si ferma.

- **Oggi, azioni ed effetti espliciti (21/09 sera)**: le schede distinguono messaggio da rivedere e seguito interno senza bozza; «Da rivedere» non chiama decisioni tutte le richieste. Sintesi breve, contesto consultabile e avviso di fonti parziali restano separati; prima della conferma sono esposti destinatario, testo e dubbi completi.
  `BOOM_PROPOSTA.approvalExpired` governa la scadenza; render e click bloccano nuove conferme scadute, con rielaborazione esplicita e gestione del 409 `preparation_expired`. Ricevute e ripresa della stessa approvazione restano valide; il modulo condiviso assente blocca la conferma.
  Il feedback `approveAgentAction` distingue prova email e WhatsApp da verificare: `executed` o un link non attestano invio. Nessuna lettura della Home genera o invia; una nota testuale non esegue telefonate o lavori.
  Prove: `segretariapropostaui`, `segretarialiveui`, `segretariaapprovaltimeui` e `agentactionfeedback` (mutazioni); `segretariafreshui`, `seguitoui`, `propertyoggiui` conservano bozze, focus e ritorno dal fascicolo. La disponibilità reale del trasporto richiede verifica separata.

- **Revisione Oggi dopo confronto Claude (21/09)**: le avvertenze della proposta non approvata precedono il piano, con dubbi/copertura annunciati; destinatario e testo restano esposti prima della conferma.
  Un nuovo ingresso può spostare il caso da Decisioni a Da preparare: entrambi i limiti preservano focus, dettagli, modale e ritorno dal fascicolo. Le date di messaggio/preparazione includono l’anno; una proposta approvata non chiede di decidere di nuovo sui limiti.
  Prova: `segretariapropostaui`, ordine avvertenze/piano e cambio di gruppo oltre dodici casi. Cancelli, tipi dei timestamp persistiti e contratto delle incertezze invariati.

- **Oggi: dal messaggio al prossimo passo (21/09)**: card e review distinguono l’anteprima dell’ultimo inbound, con la sua data quando disponibile, dall’interpretazione AI e dall’azione proposta. Il testo ricevuto non è etichettato come novità.
  La card mostra azione, motivo e dubbi specifici; l’analisi completa si espande mantenendo apertura e focus durante gli aggiornamenti. Una sola azione «Rivedi proposta» apre effetti reali, destinatario e testo prima della conferma.
  Copertura parziale e allegati non letti restano espliciti; non vengono inventati scenari o un inventario documentale. Proposte obsolete e ricevute continuano a dipendere dai cancelli esistenti.
  Le decisioni mostrano dodici schede alla volta, con totale completo e «Mostra altre»; il caso in lettura resta raggiungibile dopo riordino o ritorno dall’immobile. Nessun caso viene eliminato o riclassificato.
  Prove: `segretariapropostaui`, `segretarialiveui`, `segretariafreshui`, `seguitoui`, `propertyoggiui`; dati sintetici, nessun invio reale.

- **Conversazione stabile (21/09)**: diventare lead conserva il CID verificato, senza migrare messaggi, casi o ACL storiche. `_conversation.js` risolve il riferimento persistito e le identità; numero condiviso, legami contraddittori o due chat con storia restano conflitti espliciti.
- `POST /api/homie/conversation` è admin-only: restituisce `{cid,status,reason}` e crea/lega solo dopo assenza verificata nello stesso CAS. `409` = conflitto, `503` = lettura indisponibile; il portale non crea un fallback.
- Il primo lead WhatsApp e il backlink nascono atomicamente. Handover, apertura, email e inbox-sync riusano il resolver; i retry partono dal CID del messaggio già persistito.
- In presenza di due chat storiche, l'ingest può conservare il percorso primario verificato dichiarando il conflitto: nessuna fusione, nuovo caso o risposta automatica. Preparazione e consegna bloccano quella fonte ambigua.
- Prove: `npm test -- segretariaconversazione`, handler reali su fixture, corse e mutazioni; nessuna verifica su dati privati o modifica in produzione.
- **Fonti WhatsApp aggiornate (21/09)**: un OUT su un caso già tracciato invalida la proposta tramite `contextRevision`, senza cambiare ultimo inbound, impegno confermato o ricevute; il valore assente vale zero, senza rigenerazione globale.
  Worker, retry, revisione e conferma confrontano la stessa revisione; una consegna precedente resta protetta. Ricevute idempotenti e CAS rendono riparabile un errore secondario, senza creare casi dal solo OUT.
  Il messaggio normale e la testa Inbox si salvano insieme; ingressi tardivi non arretrano testa/seguito e non cancellano unread più recenti. A timestamp uguali, il seguito confronta `updateTime` del messaggio persistito, anche se il tracking termina in ordine inverso; nessuna cronologia dedotta dagli ID.
  Header e messaggio condividono le ACL della stessa identità finale; un cambio concorrente prevale sui dati del pre-read. Prove `segretariafreshness`: handler/worker/conferma/consegna reali, duplicati, corse, prima associazione, cambi ACL e mutazioni. Nessun invio implicito o migrazione dei casi.

- **LA FINESTRA DI QUIETE (23/09/2026 — letta in `/ai`, non dedotta)**: la
  preparazione del caso è il 96% della spesa AI del giorno (193 chiamate opus
  su 251, $16,57 su $17,27), e ogni inbound rifà la preparazione INTERA:
  `contextRevision` sale a ogni messaggio e il worker (ogni minuto) ripaga il
  modello. WhatsApp arriva a raffiche («ciao» · «cercavo un bilocale» · «per
  settembre» — lo stesso esempio di `mergeMessage`), quindi una raffica da tre
  pagava tre proposte, due delle quali già superate all'arrivo. Ora un caso
  con evento nuovo aspetta che la chat sia FERMA da `prepareQuietMinutes`
  (`settings/segretaria`, default **3**, 0–30: un valore impossibile torna al
  default e si dichiara in `rejected`, mai un aggiustamento) e si prepara UNA
  volta sull'insieme. La regola è pura in `PRIORITY.quiet` (priority-engine):
  vale SOLO per gli eventi nuovi — un ricontrollo scaduto e una decisione
  dell'operatore non sono raffiche — e MAI per una scadenza confermata o una
  richiesta datata entro l'ora (lo stesso rango che in `chooseNext` batte gli
  eventi nuovi). Il monitor lo dichiara: `queue.quiet` nel battito,
  `counts.quiet` in Oggi («In arrivo a raffica»), `quietMinutes` sul run,
  la riga dei tetti in `/segretaria`. Le prove esistenti del worker misurano
  ORDINE ed equità su messaggi di pochi secondi fa e dichiarano
  `prepareQuietMinutes: 0`; la finestra ha le sue (default, raffica che si
  prepara una volta, scadenza che non aspetta, 999 → default, ricontrollo
  che non aspetta) e due mutanti. Qualità invariata per costruzione: la
  proposta arriva comunque, dopo la raffica, e copre tutto. Il guadagno VERO
  si legge in `/ai` nei giorni successivi (193 chiamate/giorno è la base).
  Il modello (opus 4.8) non è stato toccato: la sua qualità si misura sulle
  approvazioni (`agreeOn:false`), e cambiarlo è una decisione dell'operatore.
- **LE TUE RISPOSTE E IL PERCHÉ (25/09/2026 — letto in `/ai` e nei log di
  Vercel, non dedotto)**: due giorni dopo la finestra di quiete `/ai` diceva
  ancora `segretaria.prepare` $10,29 su 142 chiamate (95% della spesa del
  giorno) e i log di Vercel contano 344 chiamate a `/api/homie/message` in
  24 ore — circa una preparazione ogni due messaggi WhatsApp, in entrata O in
  uscita. Il motivo: ogni OUT dell'operatore invalida la proposta
  (`contextRevision`, la regola del 21/09) e la quiete guardava SOLO
  `followUp.lastInboundAt`, quindi una risposta dell'operatore veniva
  ripreparata al ciclo dopo — e l'operatore scrive a raffica quanto il cliente
  (mediana ≤17 caratteri, misurata sui suoi 29.255 messaggi). Due mosse:
  (1) `invalidateTrackedContext` stampa `lastOutboundAt` sul caso — top level,
  MAI dentro `followUp`: «l'OUT non tocca l'ultimo inbound né la decisione»
  resta — e `PRIORITY.quiet` conta «chat ferma» in ENTRAMBE le direzioni; un
  caso legacy senza il campo si comporta come prima. (2) Il contatore del
  giorno (`heartbeat/segretaria-preparations-<giorno>`) archivia la CAUSA di
  ogni tentativo (`triggers`: inbound · outbound · recheck · decision · manual
  · other — lista in `SEG.PREPARATION_TRIGGERS`, `tallyTriggers` scarta chiavi
  ignote e valori impossibili invece di aggiustarli); il monitor la espone
  (`triggersToday`), Oggi la stampa («Perché: …») e `/segretaria` la dice —
  prima di cambiare modello si legge da cosa partono i soldi. Il modello resta
  opus 4.8: la sua qualità si misura sulle approvazioni, e cambiarlo è una
  decisione dell'operatore. Test: `tests/segretaria/worker.mjs` (una tua
  risposta di 10s fa aspetta, a chat ferma UNA preparazione, un OUT senza
  cambio di contesto non è un evento, le cause archiviate; due mutanti presi:
  risposta esclusa dalla quiete, causa falsa), `freshness.mjs` (il handler
  VERO stampa `lastOutboundAt` con l'ora del messaggio, mai in `followUp`; con
  la quiete al default il secondo OUT aspetta e poi UNA ripreparazione),
  `monitor.mjs`, `realtime-ui.mjs`.
- **Preparazione continua (18/09)**: le proposte non condividono più `dailyCap` con le risposte conversazionali. Il contatore misura i tentativi; attivazione, lease, budget per ciclo e veti di consegna restano distinti.
  La scansione legge pagine per ID con cursore nel battito esistente e riparte dal principio a fine giro: nessun arresto ai primi 200 casi. Oggi legge tutte le pagine, preservando dati e modali durante refresh incompleti; il monitor dichiara i conteggi parziali.
  Scadenze confermate e richieste datate precedono i nuovi eventi, con un turno su tre al caso meno recentemente controllato. Errori temporanei riprovano dopo 1/5/15/60/360 minuti; errori di validazione restano visibili da verificare fino a nuova evidenza, decisione o versione.
  Retry e revisione sono legati a evento, decisione e versione; cursori e marcatori usano confronti di versione per non sovrascrivere lavoro concorrente. Nessuna nuova collection o apertura degli invii.
  Prove `segretariaworker`, `seguito`, `segretariamonitor`, `segretarialiveui`: oltre mille casi, ripresa, concorrenza, equità, retry e revisione dichiarata.

- **Ora italiana delle proposte v4 (18/09)**: il modello dichiara data e ora Europe/Rome accanto all'istante ISO. Il calendario confronta i due valori con IANA; incoerenze, ora mancante/ambigua e relativi vaghi riconosciuti producono `needs_context`, senza bozza né approvazione.
  La prova temporale conserva la dichiarazione originale; soltanto un anticipo deterministico del controllo rigenera la rappresentazione locale. Nessuna correzione automatica degli appuntamenti o interpretazione semantica universale.
  Proposte da verificare conservano la classificazione fra versioni e scadenze, a parità di fonti e decisione. Nuovi dati riaprono la preparazione; proposte pronte obsolete vanno ricalcolate, ricevute approvate restano leggibili.
  Prove `segretariacalendario`, `segretariaprepara`, `segretariaattese`, con mutazioni sulle conversioni, sulla classificazione e sull'anticipo del controllo.

- **Piano da eseguire in Oggi (18/09)**: «Rivedi proposta» resta disponibile; «Esegui piano» mostra i passaggi prima di «Approva ed esegui».
  `segretaria-esecuzione-engine` deriva registrazione del seguito, invio della bozza e ricontrollo dalla proposta e dalle ricevute esistenti. Coda, esito incerto, pausa e intervento umano restano distinti; il testo libero non inventa operazioni su telefono o portali.
  L’unica conferma usa ancora `prepare` → `_dispatch` → executor/outbox sulla revisione vista; niente seconda coda, chiusura automatica o autonomia permanente. Nessuna azione parte aprendo il piano.
  UI senza modulo esecuzione blocca la conferma; nuove fonti, conflitti e doppio tap conservano i controlli precedenti. Prove: `segretariaesecuzione`, `segretariapropostaui`, conferma/consegna e UI live.

- **Ripresa prima dell'esecuzione (18/09)**: Oggi offre «Riprendi esecuzione» solo
  sulla ricevuta server `pending_execution` riferita all'approvazione corrente.
  Rilegge lo stato prima del POST sulla stessa revisione; claimed/queued/sent o
  esito incerto non diventano retry. `tests/segretaria/resume-execution.mjs`
  verifica handler e UI veri, una sola azione/un solo effetto e mutazioni.

- **Prima iterazione sulle proposte osservate (17/09)**: la guardia `nextActor` poteva sovrascrivere un richiamo esplicito e lasciare una motivazione serale dopo aver anticipato l'orario. Il motore ammette ora un'attesa provata da fonte integra, ultima e odierna, citazione letterale e stesso contatto; grammatica IT/EN circoscritta, mai un generico impegno dichiarato dal modello.
  La cronologia deve essere completa; i riscontri successivi ignorabili sono solo testo e il prossimo passo deve riguardare lo stesso richiamo. Negazioni, esitazioni, storia parziale o formulazioni non risolte producono `needs_context`, fonte e impegno consultabili, verifica umana necessaria prima della conferma. Azione, raccomandazione e motivazione diventano coerenti con questa verifica, senza assegnare come certa un’attesa dubbia.
  I sommari Miniera privi di cronologia individuale sono esclusi dall'input fattuale e dalle fonti dichiarate consultate; archivio e fingerprint restano, `coverage.historical` esplicita l'esclusione. Le fonti attuali e lo stile verificato rimangono disponibili.
  Proposta v3 rigenera le vecchie proposte non approvate entro il cap esistente, conservando le ricevute approvate; nessun reset, invio o correzione retroattiva del seguito.
  Prove `segretariaattese` e `segretariaprepara` con mutazioni, più worker, conferma/consegna e UI. Il confronto sui casi reali resta distinto dalle prove sintetiche; il prompt di sintesi minimale non attesta da solo la qualità del modello.

- **Richieste e decisioni distinte (17/09)**: Oggi separa «Da preparare» dalle proposte attuali, dalle scadenze confermate e dai problemi di consegna. `workGroups` deriva i quattro gruppi; nessun nuovo stato salvato.
  L'arretrato mostra dodici richieste alla volta, tutte raggiungibili. Il cap espone tentativi usati/disponibili, inclusi fallimenti; a limite raggiunto si possono leggere fonti e correggere il seguito senza avviare preparazioni destinate a fallire.
  Home, worker e cache usano `currentContext` del motore proposta, con un'unica `CONTEXT_VERSION`: copertura assente/vecchia torna da preparare, ricevute approvate restano leggibili solo sullo stesso evento aperto.
  Le conferme senza pratica restano decisioni da completare; una richiesta d'orario già gestita non riapre una conferma futura. Nuove fonti e ricontrolli restano visibili. Asset vecchi non dichiarano proposte pronte.
  Prove: `seguitoui`, `segretarialiveui`, `segretariapropostaui`, worker e prepara; mutazioni di classificazione/copertura, 111 richieste, mobile, bozze e zero invii in lettura. Cap e HOLD invariati.

- **Ricontrollo iniziale dalla fonte (17/09)**: la cattura non mette più ogni richiesta indistintamente a +2h. `segretaria-intake-engine` conserva `followUp.intakeTiming`, con fonte, citazione e istante richiesto separati dal controllo interno.
  Entro/by + oggi/domani o data completa + HH:MM usa Europe/Rome e anticipa il controllo; giorno mancante, esitazione, negazione, passato e ambiguità chiedono revisione immediata, senza promesse né rinvio implicito a domani.
  La grammatica è circoscritta e riusa le primitive IANA/DST del calendario. Neutralità e backlog conservano la fonte precedente; `confirmedAt`/`confirmedBy` proteggono la decisione umana anche senza pratica verificata.
  La Home mostra la citazione e distingue una fonte precedente. Prove `segretariaintake`, `seguito`, calendario, tracking/backlog e telefonia, con sei mutazioni. Nessun backfill; l'interpretazione AI successiva resta una verifica distinta.

- **Associazione immobile da voce (17/09)**: una keyword poteva collegare la stanza esclusa dal chiamante. `phone-listing-engine` separa candidati ed evidenza positiva, con titolo catalogo univoco nell'ultimo turno sostanziale e grammatica chiusa IT/EN.
  Saluti conservano interesse; domande, citazioni, condizioni o correzioni successive impediscono l'associazione automatica. Trascrizione oltre limite coperto: associazione non confermata, mai dedotta dal prefisso troncato.
  Lo stesso risultato vale per analisi, lead e Centralino; match WhatsApp invariato e nessuna prenotazione. Non è comprensione semantica generale, né una formula che il chiamante deve usare.
  Prova `phone`: 237 verifiche; mutazioni su keyword, catalogo al limite100 e trascrizione oltre200turni. Nessuna modifica storica ai collegamenti live.

- **Oggi, memoria e preparazione (17/09, Codex)**: gli eventi aggiornano i pannelli senza distruggere modali/bozze; listener dei casi e fallback 30s, Inbox ordinata su `at DESC` con limite dichiarato.
  `_context` legge fino a 100 messaggi: evento prioritario, massimo 22k caratteri di storia e 32k complessivi; tagli e hash integrali dichiarati. Il dossier conserva gli ultimi messaggi anche oltre la vecchia soglia 40.
  Miniera entra soltanto via JID canonico/telefono/identità verificati: estratti storici separati, mai prove citabili di impegni attuali. `coverage.version` rigenera le vecchie proposte non approvate; ricevute approvate conservate.
  Il worker passa ogni minuto con massimo tre tentativi sequenziali nel budget esistente, priorità ai nuovi eventi ed equità per gli arretrati; lease e tetti invariati. Un concorrente che perde la lease non scrive retry sul caso in lavorazione.
  `follow-up` espone il monitor di preparazione: pausa, cap reale, ultimo ciclo e letture parziali; questi dati non certificano la ricezione WhatsApp. Nessuna nuova collection o autorizzazione agli invii.
  Prove: `segretarialiveui`, `segretariaworker`, `segretariamonitor`, `persona`, `segretariacontesto`, `segretariaprepara`, conferma/consegna e calendario; mutazioni sui difetti riprodotti. Il cron al minuto non garantisce inferenza istantanea né lettura di media/gruppi.

- **Revisione semantica (16/09 pomeriggio)**: quattro proposte reali hanno esposto data/giorno incoerenti, reazione scambiata per conferma e lingua dedotta dal wrapper HOMIE.
  Preparazione v2 usa gli ingressi sostanziali per lingua e richiesta umana; una citazione esitante o una reazione non prova un impegno certo/completato.
  `segretaria-calendar-engine` ancora i giorni alla fonte in Europe/Rome e rifiuta incoerenze o ricontrolli descritti come precedenti ma tardivi; forme non interpretabili restano ambigue.
  `_context` dichiara vocali/documenti importati non letti anche senza `attachments`, conservando eventuali caption. Stato commerciale e data passata non attestano disponibilità attuale.
  Le vecchie proposte non approvate richiedono nuova preparazione; conferme e ricevute già esistenti restano consultabili. Il limite giornaliero non viene alzato dal codice.
  Prove: `segretariaprepara`, `segretariacalendario`, `segretariacontesto`, `segretariapropostaui`, più conferma/consegna e mutazioni. Controlli circoscritti, non garanzia generale di comprensione del modello.

- **Indice cronologia (16/09)**: in produzione mancava `messages(conversationId ASC, at DESC)`;
  le chat oltre il limite del fallback non potevano ricostruire l'evento WhatsApp, salvato con ID documento diverso.
  `firestore.indexes.json` dichiara l'indice per la query ordinata e conserva l'indice `notifications` già presente.
  Distribuire `firestore:indexes` e attendere la query leggibile prima di attestare la cronologia; nessun messaggio viene reimportato.

- `settings/segretaria.automaticReplies:false` sospende solo i vecchi turni e aperture WhatsApp/email, conservando preparazione e conferme esplicite.
- `_core` controlla prima del turno e dopo il modello; lettura fallita sospende, flag assente conserva la consegna per chat. Il tap `sg` e `/segretaria` dichiarano la sospensione.
- La pausa non revoca azioni già accodate né assegnazioni `segretaria:true`: queste continuano a impedire una seconda risposta finché l'operatore non riprende la chat.
- Prove: `tests/segretaria/run.mjs` §9, handler reali WhatsApp/email/Telegram, preparazione e conferma, tre mutazioni sui cancelli e sulla ricevuta.

- **Esperienza founder** (15/09 sera): `oggiSegretaria*` e `css/segretaria.css` mettono la decisione prima del testo da leggere: briefing compatto, Decisioni per te / In corso / In attesa, una CTA principale. La review espone sempre destinatario e risposta prima della conferma; dettagli e fonti si aprono a richiesta. Conteggi derivati, nessun successo o autonomia fittizi.
- Attese senza data restano visibili con «Ricontrollo da impostare»; invio e lettura non chiudono il lavoro. Le prove `segretariapropostaui` e `seguitoui` coprono tastiera, mobile, errori, gruppi ed esiti.
- **Recupero silenzioso**: `homie/message` accetta `intakeMode:'backlog_review'` solo dopo l'autenticazione del trasporto; il valore salvato sul messaggio governa i retry. Conserva Inbox/riferimenti agli allegati e seguito già autorizzato da `prepareCases/prepareSince`, senza riaprire lead, lanciare il vecchio turno o elaborare allegati. Head e seguito più recenti resistono al replay e alla concorrenza; test `segretariabacklog` e mutazioni.
- **Prova del modello reale**: sei esecuzioni sintetiche hanno evidenziato perdita della pratica scelta e attese attribuite a chi non aveva ancora ricevuto la domanda. Il contratto conserva la pratica confermata ancora verificabile. La guardia deterministica `nextActor`, eseguita dopo i blocchi sulle bozze, riporta a Valentino una nuova attesa senza bozza o identica attesa già confermata. La correzione è verificata anche sull'output reale errato e per mutazione; non attesta apprendimento dello stile personale.
- **Telefono, consegne Claude `95fbf45` e `1b0e0a4`**: note di `agent-tools` e prompt effettivamente applicato non promettono prenotazioni, link o richiami. Il vecchio numero è escluso su indicazione di Valentino; numero nuovo, voce ascoltata e webhook firmato sono verifiche di attivazione separate dal deploy del portale. Nessuna nuova notifica esterna nasce dalla preparazione.
- **Conversazione telefonica, consegna Claude `40af4ed`**: fallback `say` sostituito da `note`; tool e prompt chiedono un solo dato mancante, senza frasi da recitare. Una richiesta completa viene riepilogata e chiusa, senza promesse di consegna.
  Prompt v6 verificato sul provider (`agtvrsn_6501m2kjkyc9fwx8cch3hc59hrs0`): tre prove semantiche IT superate al secondo ciclo, con tool simulati. Non sono prove audio, telefoniche o del webhook reale.
  Integrato soltanto il perimetro concordato; suite `phone` ripetuta e verde. Modello, numero e trasferimento restano configurazioni distinte.

- **Tipo di alloggio nel catalogo voce (17/09)**: il tool scartava `listings.type`; nella prova reale una `Room` con una camera veniva presentata come bilocale intero.
  `phone/agent-tools` conserva ora il tipo dichiarato; assente, vuoto o non testuale resta `null`. Non lo ricava dal titolo o dal numero di camere.
  La nota del catalogo distingue stanza e appartamento intero e richiede verifica quando il tipo è sconosciuto; `bedrooms` non prova il numero totale di locali.
  Prova `phone`: stanza e appartamento con stessi dati numerici, tipo mancante/invalido e mutazione che rimuove il campo. Nessun prompt live o trasferimento modificato; il collaudo conversazionale va ripetuto dopo la pubblicazione.

- **Risolutore Immobile Unico v1 (27/09)**: `phone/agent-tools` conserva il catalogo senza input e accetta riferimenti BOOM/portale mappati, nome o indirizzo e filtri dichiarati.
  Legge soltanto `listings` e `portalPubs`, riusa `DISPO`, espone fonte, istante e copertura e restituisce al massimo due risultati; pareggi e coperture parziali diventano `needs_confirmation`, mentre un id BOOM noto viene controllato sul documento esatto.
  Il contratto configurabile del tool (`bot/RECEPTIONIST.md`) dichiara `reference`, `query`, `type`, `zone`, `maxPrice` e `moveIn`; non attesta che i parametri siano già stati applicati sul provider live.
  Un URL esterno senza mapping risponde `unverified_external_reference`; un affittato resta riconoscibile ma non entra fra le alternative, una waitlist conserva la sua data reale.
  Prova `phoneresolver`: handler vero su Firestore in memoria, con ID/indirizzo, mapping portale, ambiguità, filtri, cap e stati; nessun portale contattato.
  Il catalogo generico espone gli affittati/riservati soltanto in `unavailableListings`, indice identitario compatto capato a 8 e derivato dalla stessa scansione: nessuna seconda lettura né descrizioni lunghe; copertura esplicita impedisce di dedurre assenza dal cap.
  Nella ricerca nominativa l'identità viene risolta prima dei filtri: una casa fuori budget resta la casa giusta con `criteriaMatch:false` e il motivo, invece di diventare inesistente. Senza nome/riferimento i filtri continuano a selezionare soltanto alternative compatibili.
  Schema dinamico e description del tool vanno pubblicati insieme; fino ad allora l'indice compatto mantiene coerente la promessa minima. Prova `phoneresolver` sui due confini e sull'ambiguità non risolta dal budget.

- **Firma webhook voce su Vercel Node (17/09)**: `req.body` è un getter JSON del runtime standalone; l'hint Next `api.bodyParser:false` non lo disabilita. Riscrivere l'oggetto cambiava i byte firmati e rifiutava payload validi con `401 invalid_signature`.
  `phone/elevenlabs` legge ora lo stream originale ripristinato da Vercel senza attivare il getter. Negli harness senza stream accetta solo stringa/Buffer grezzi, mai oggetti JSON; lettura fallita = 400 esplicito.
  La verifica HMAC e la tolleranza restano invariate. Prova `phone`: spazi/newline, Unicode escaped e spezzato fra chunk, ordine chiavi, un byte alterato, secret errato e firma scaduta; mutazione ripristina il difetto.
  Handler reale con confini simulati; non certifica la corrispondenza dei secret live. Serve un nuovo evento provider con riscontro nel Centralino dopo il rilascio.

- **Lavoro preparato sul caso** (15/09, Codex): `_prepare` e `segretaria-proposta-engine` scrivono una proposta versionata sul seguito esistente: sintesi, impegni espliciti/dedotti, fonti, risposta e prossimo controllo. `_context` legge cronologia ordinata e riferimenti verificati del dossier; campioni `out/fromMe` non attestano la voce umana di Valentino.
- In Oggi la proposta precede il modulo manuale. `prepare` admin-only conferma insieme seguito e risposta mostrata, con destinatario derivato dal server; `_dispatch` riusa l'executor e l'outbox. Fonti, recapito, evento e decisioni manuali sono ricontrollati: una revisione vecchia non sovrascrive le nuove informazioni. Senza pratica verificata resta solo il seguito.
- **Proposta pronta scaduta (21/09)**: `approvalExpired(proposal, now)` distingue
  il ricontrollo trascorso di una `ready` non approvata da una revisione o ricevuta.
  La conferma risponde `409 preparation_expired` prima di rileggere il contesto;
  una richiesta di preparazione rielabora anche con lo stesso `recheckFor`.
  Cache futura, `needs_context` e replay approvato restano invariati; un errore AI
  conserva la proposta precedente. Prove: `segretariaprepara`, `segretariaconferma`.
- **Freschezza Oggi/Inbox (21/09)**: il browser distingue conversazioni confermate dal server, copia locale, offline ed errore; le informazioni già lette restano visibili. Questo stato non certifica l'ingresso WhatsApp né la preparazione AI.
  Ritorno alla scheda, ripristino della pagina e connessione recuperata riattivano i listener terminati e ricontrollano Oggi, accorpando eventi ripetuti. Gli agganci si rimuovono uscendo dalla vista o dall'utente; callback e letture superate non sostituiscono dati correnti.
  Gli aggiornamenti conservano bozza, oggetto email, selezione del testo e posizione della cronologia; Oggi aggiorna solo le proprie regioni, senza ricreare il modulo aperto.
  Prove: `segretariafreshui` e `segretarialiveui`, codice UI reale con sole letture simulate, nessuna scrittura, chiamata AI o comunicazione reale.
- **Apertura lead senza seconda chat (21/09)**: dal modal Inbox il lead passa a `POST /api/homie/conversation` con il solo `leadId`; la UI usa il CID verificato restituito dal server e legge quel documento dal server, anche fuori dalle 200 conversazioni recenti.
  Nessun `set/merge` locale degli header o degli accessi per i lead. Conflitto, timeout o lettura fallita mantengono il contatto nel modulo e consentono un nuovo tentativo; nessun ripiego a `conv_lead_*`.
  Solo la chat selezionata verificata resta in memoria durante gli snapshot della lista, per lo stesso utente; stop e logout la rimuovono. Risposte di selezioni o utenti precedenti non aprono un'altra chat.
  Prova: `inboxleadui`, UI e listener reali con soli confini di rete simulati. Nessuna risoluzione o chiamata AI all'apertura Home; percorsi non lead e riferimento di ritorno da Oggi invariati.
- `_execution-guard` e `_delivery-guard` proteggono solo le nuove proposte: claim atomico prima dell'effetto e del pull WhatsApp, ACK terminale; esito incerto non riparte automaticamente. `_reply-owner` evita risposte già affidate alla conversazione automatica o presenti in coda; è una verifica bounded, non un lock universale dei vecchi produttori. Pagamenti e firme conservano il loro flusso specialista.

- **Consegna preparata scaduta (18/09)**: dopo 48h una WhatsApp mai ritirata mostrava revisione ma bloccava per sempre nuove proposte. `_prepare` può dismetterla soltanto con prova della stessa approvazione e protocollo claim verificati, senza tentativi/esiti precedenti.
  Nuova proposta NON approvata e vecchia azione `rejected` con `delivery.expired` si salvano insieme, con CAS su caso, azione e conversazione; prova originaria e payload restano leggibili. Cache, nuovo evento e retry seguono la stessa regola; errore AI o concorrenza non dismettono nulla.
  Azioni legacy, istanti mancanti, claim o esiti incerti richiedono ancora verifica. `_delivery-guard` rilegge il clock dopo il contesto per non ritirare oltre la finestra; nessun reinvio o nuova approvazione automatica.
  Prove `segretariaprepara` e `segretariaconsegna`: soglia, cache, nuovo evento, audit, errore AI, claim/ACK/inbound/recapito concorrenti e mutazioni sui cancelli/CAS.
  Anche un nuovo caso può risolvere la risposta scaduta di un caso già chiuso della STESSA conversazione: legge la prova originale, conserva chiusura/esito/approvazione e vincola quel caso al commit della nuova proposta. L’esclusione prospettica dall’ownership vale solo insieme alla dismissione atomica; altri owner, copertura incompleta, chat automatica e risposte incerte restano veti.
  La raccolta rispetta il budget esistente; rilettura ownership e CAS su vecchio caso/azione, nuovo caso e conversazione proteggono nuove risposte o cambiamenti concorrenti. Prove `segretariaprepara` con close/capture/approve reali, stessa persona in altra chat, più vecchi owner, fallimenti e mutazioni.
  La chiusura manuale non viene modificata; nessun recupero storico o invio nasce da questa risoluzione, e ogni nuova bozza richiede la consueta approvazione.
- `worker` prepara e ricontrolla senza inviare né notificare, disattivo finché `settings/segretaria.prepareCases` non è true. Nuovi messaggi richiedono anche `prepareSince`: l'ora di ricezione salvata dal server include arretrati HOLD appena ricevuti; i retry non possono riscriverla. Limite giornaliero, lease, budget condiviso e massimo tre candidati impediscono consumo senza limite e blocco sul primo caso guasto.
- `_callcase` collega le chiamate elaborate alla stessa Inbox/seguito; retry recupera soltanto quel collegamento. L'intento deriva dalle parole attribuite al chiamante, non dalle promesse dell'agente. Nessun trasferimento di chiamata o cambio ElevenLabs è attivato da questi file; il briefing dettagliato resta in Oggi, senza estendere gli invii digest.
- **Owner Command v1 (27/09, Codex)**: `POST /api/segretaria/owner-command` è admin-only e separa `resolve` da `prepare-only`; nome, telefono o email cercano `users`, `landlords`, `clients`, `pfsClients`, `leads` senza first-match.
- Il resolver dichiara ora `resolution.status`, `nextAction` e le limitazioni bounded: un unico candidato trovato mentre la finestra legacy è incompleta resta `ambiguous` e richiede una scelta esplicita, ma il target esatto scelto dall’operatore può proseguire alle verifiche di `prepare-only`.
- **Owner Command in Oggi (28/09, Codex)**: il modulo «Dille chi. Dille cosa.» espone i risultati 0/1/N senza preselezione; anche un solo People richiede il tap esplicito.
- Conversazione, Pratica, Flat e canale/recapito partono vuoti e sono scelti soltanto tra i legami restituiti dal resolver; pratiche multi-Flat e recapiti discordanti non diventano azionabili.
- «Prepara la bozza» chiama soltanto `prepare-only`, conserva la chiave idempotente nei retry e apre il caso nella revisione Segreteria già esistente. Nessuna nuova coda, conferma o via di invio è stata aggiunta.
- Test `segretariaownercommandui`: browser reale su 0/1/N, bersaglio esatto, retry, zero endpoint di invio e layout iPhone.
- `lastMessageId` dell’Owner Command è il token di revisione della proposta: la nota autenticata diventa l’evento corrente senza cancellare la cronologia; un nuovo messaggio reale la sostituisce, rimuove il target Owner Command e invalida la vecchia conferma tramite i CAS già esistenti.
  La preparazione richiede `personRef`, recapito, conversazione, Pratica e Flat esatti e riletti; omonimi, più pratiche, contatto mancante/stale o ricerca legacy incompleta restano espliciti.
  L'ordine entra come nota `source: owner-command`, riusa seguito e preparazione esistenti e produce una bozza da confermare; caller ID non autorizza e questa porta non crea `action_queue` né invia.
  `commandId` rende il retry idempotente e rifiuta payload diversi sullo stesso comando. Test `segretariaownercommand` + mutazioni: resolver, ambiguità, recapito, bozza/seguito e zero effetti.
  È il backend preparatorio: il tool della chiamata owner richiede ancora autenticazione forte e un collegamento separato; nessun deploy o modifica al plugin HOMIE in questo lotto.
- Prove: `npm test -- segretariacontesto segretariaprepara segretariaconferma segretariatelefono segretariapropostaui segretariaconsegna seguitotracking voce`; handler e browser reali con soli confini esterni simulati, più mutazioni. Le prove non attestano qualità del modello live, voce appresa, disponibilità del Mac o consegna su numeri reali.

- **Data della fonte e data appuntamento (17/09)**: la prova con modello reale recuperava correttamente un accordo oltre la vecchia finestra, ma il controllo calendario scambiava «indicazioni date il 2 novembre» per la data del sopralluogo del 6.
  Il confine distingue solo forme esplicite di provenienza verificate sui timestamp delle fonti, conservando la coerenza del giorno della settimana; le altre date passano dai controlli preesistenti. Le date delle fonti coprono fino a 124 riferimenti, mantenendo a 40 l’interpretazione degli eventi.
  `segretariacalendario` riproduce l’output reale sintetico, provenienze IT/EN e mutazioni su date, fonti e conflitti. Nessuna chiamata o risposta al cliente nasce dalla verifica.

- **Persona, voce e seguito** (14/09, Codex): `_persona.js` deriva ruoli, pratiche e fonti; un vecchio lead non nasconde tenant/landlord/PFS. Identità contraddittoria o illeggibile blocca il turno; storia parziale viene dichiarata, non spacciata per ultimo accordo.
- `voce-engine.js` costruisce il prompt WhatsApp/email; `replyLang` e i cancelli esistenti restano autorevoli. Le regole editoriali usano le fonti storiche senza copiarne prezzi o promesse. Non cambia ancora il mandato vocale della Receptionist.
- `_follow-up.js` conserva l'impegno in `operatorTasks.followUp`: leggere, rispondere o passare all'operatore non lo chiude. Ricevute e cursore tecnici in `heartbeat`, scritti atomicamente via `fsGetVersioned/fsCommit` di `homie/_lib`, impediscono replay e aggiornamenti persi.
- In Oggi, `segretaria-casi-engine` mostra decisioni e attese. `/api/segretaria/follow-up` è admin-only: pratica scelta esplicitamente dalle fonti, azione, chi e ricontrollo; chiusura con esito, conflitto → ricaricare. Il ricontrollo iniziale di due ore è una proposta interna, non una promessa al cliente.
- I seguiti non usano «Nascondi»/localStorage né i vecchi tasti Regista privi di esito. La conferma non invia messaggi, non prenota e non modifica contratti. Nessuna nuova collection o impostazione di autonomia.
- Prove: `npm test -- persona voce seguito seguitoui seguitotracking segretaria regista oggi`. Fixture e mutazioni verificano il percorso; non attestano attivazione in produzione, qualità del modello reale o lettura automatica di vocali e allegati.
Il "durante" della conversazione — il buco che generava la frammentazione
misurata (metà dei messaggi dell'operatore ≤17 caratteri) e i 544 silenzi.
Studio: `STUDIO_SEGRETARIA_2026-08.md`. È il cervello della Receptionist
applicato a WhatsApp: prende in mano una chat QUANDO l'operatore gliela
consegna e la porta fino alla visita prenotata o all'escalation.
- **La consegna è PER CONVERSAZIONE e il click è la firma** (D1): bottone
  **🤖 Passa alla Segretaria** sulla card Telegram del lead (`sg:<leadId>`,
  solo dove esiste una conversazione WhatsApp). Default: nessuna chat
  consegnata ⇒ zero invii (il deploy non cambia comportamento).
  Il CID viene dal legame persistito e verificato: un contatto sconosciuto
  può restare su `conv_whatsapp_<numero>` anche dopo la creazione del lead.
  La consegna marca quella conversazione; `conv_lead_<id>` è il fallback
  soltanto dopo assenza verificata. Due chat già operative restano distinte
  e il conflitto impedisce la consegna automatica.
- **I binari duri stanno nel motore** (`BOOM_SEGRETARIA`, testati per
  mutazione), non nel prompt: mai su chat non consegnate, mai con
  inquilini/proprietari/PFS, escalation legale/rabbia (la STESSA regex
  della scala della fiducia — una copia sola), tetto turni/chat (12) e
  giornaliero (60), `sanitizeReply` che RIFIUTA (mai aggiusta): link fuori
  da boomrome.com/wa.me = escalation, mai un invio; markdown spogliato;
  lunghezza tagliata a frase intera (la voce misurata: corta).
- **Il turno** (`segretariaTurn`, dentro homie/message dopo syncLead,
  best-effort — un errore non perde mai il messaggio): fatti SOLO da fonti
  vere (stato immobile + alternative come il Commerciale, slot da
  `viewings/_avail` — la griglia che book.html non può smentire, servizi
  da `_catalog`, storia della chat, `replyLang`), Claude risponde
  `{reply, escalate}`, e l'invio passa dalla STESSA rotaia del tap manuale:
  action_queue (proposedBy `segretaria`, contextHash
  `segretaria:turn:<conv>:<msgId>` → un retry di Homie non risponde due
  volte) → executor → outbox WhatsApp → messageLog → Inbox.
- **Il rientro è dell'operatore, senza cerimonie** (D4): un suo messaggio
  manuale nella chat la spegne su quella conversazione — e le risposte
  della Segretaria che TORNANO dal Mac come `out` sono riconosciute come
  eco (`isSegretariaEcho`, hash + finestra 48h, disciplina dropBoomEchoes)
  o si spegnerebbe da sola al primo turno.
- **L'escalation è un passaggio di testimone** (D5): parole legali, tetti,
  il modello che chiede una persona, un invio fallito → chat restituita +
  card 🖐 con le ultime battute e il wa.me. La voce è "noi di BOOM", mai
  la firma di una persona (D6): "ti metto in contatto con Valentino" È
  l'escalation.
- **La mossa d'apertura**: il 🤖 vale su QUALSIASI lead raggiungibile
  (portale, centralino, sito) — se il cliente non ha ancora scritto, la
  Segretaria APRE lei (`segretariaOpen`, dal webhook subito dopo la
  consegna): risponde alla richiesta ORIGINALE sul canale giusto, WhatsApp
  col numero, EMAIL senza (payload `channel:'email'` con to+subject, stesso
  executor → Nodemailer). Idempotente (`open_<leadId>`): un secondo click
  non riapre; una chat già avviata non riceve aperture doppie.
- **La porta email** (`api/segretaria/scan-replies.js`, cron */10,
  maxDuration 60): legge SOLO i mittenti delle conversazioni consegnate o dei seguiti aperti
  con contactEmail (perimetro stretto — zero consegnate = un run costa una
  query), spoglia il testo citato (`stripQuoted` nel motore: il thread
  sotto la risposta farebbe rispondere a frasi NOSTRE), registra il
  messaggio in Inbox e passa il turno allo stesso cervello. Message-ID in
  `heartbeat/segretaria-mail-memory`. Sul canale email il rientro D4 non
  esiste (una tua email non passa dal sistema): si riprende da /segretaria.
- **Tracking dopo il rientro**: gli inbound dei casi già presi aggiornano il seguito anche con `segretaria:false`, senza riaccendere AI/invii. Il retry WhatsApp ripara usando il messaggio persistito; l'email usa un ID deterministico e ritenta gli errori prima di ricordare l'evento come visto. Alias email ammessi solo con stessa identità persistita; ambiguità e limiti sono dichiarati. Prova: `tests/segretaria/tracking.mjs`.
- **Controllo**: `/segretaria` su Telegram (chat attive, 🖐 Riprendi per
  ognuna, kill switch `sgk`), `settings/segretaria`
  {enabled, maxTurns, dailyCap, maxChars} con la disciplina resolveKnobs.
  homie/message ha maxDuration 60 in vercel.json (il turno paga una
  chiamata Claude). La Segretaria è nell'ORGANIGRAMMA (💁, approval
  `parziale`: la consegna è il tuo click) col heartbeat
  `teamHealth/segretaria`; la lettera del Commerciale dichiara ora la
  scala della fiducia sui follow-up.
- **IL POSTINO — la consegna WhatsApp non è un atto di fede** (29/08, dal
  primo uso vero: due 🤖 cliccati, la Segretaria scrive, l'executor marca
  `executed`… e su WhatsApp non arriva niente, perché su WhatsApp consegna
  il MAC via `wa-outbox` e il ciclo di ritiro esisteva SOLO come mandato
  in bot/HOMIE.md — la stessa storia dello Scout). Due bracci:
  `api/telegram/_postino.js` dentro notify-pending (ogni minuto,
  best-effort): (1) riesegue le azioni della MACCHINA rimaste `approved`
  senza esecuzione (funzione uccisa a metà volo; mai le approvazioni
  umane), (2) la posta `executed` che il Mac non ritira entro 5' diventa
  una card 📮 col TESTO GIÀ PRONTO nel bottone wa.me (un tap = consegna
  manuale) e si marca `waSendError:'stalled_operator_notified'` così
  l'outbox non può più rimandarla (un doppio messaggio è peggio di uno in
  ritardo); ✅ Consegnato (`pw:`) registra la consegna manuale;
  `/segretaria` mostra i conteggi della coda. E `bot/boom_postino.py` +
  `com.boom.postino.plist` (ogni 2'): il ritiro DETERMINISTICO — pull →
  wacli (comando via `WACLI_SEND_CMD`, template argv MAI shell, `--test`
  per collaudare) → ack; registro locale anti-doppio scritto PRIMA
  dell'invio. La card del 🤖 dice la verità sul canale ("in consegna via
  Mac" / "email inviata"), mai "fatto" per un messaggio in coda.
  Test: `python3 tests/postino/runner.py`.
- Test: `node tests/segretaria/run.mjs` — cancelli e sanificazione per
  mutazione, giunzioni sulla sorgente, e il giro VERO su Firestore in
  memoria col handler reale: consegna → turno (executor vero) → eco che
  non spegne → out manuale che spegne → escalation con ping → retry
  idempotente → kill switch → Postino (posta ferma → card col testo
  pronto, auto-riparazione delle azioni uccise a metà volo).
