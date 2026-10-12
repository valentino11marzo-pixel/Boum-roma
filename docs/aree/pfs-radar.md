# PFS e mercato — radar PFS, occhi di Homie, Perito, Radar 2.0, Scatto e Contatto

> Dettaglio e storia di quest'area, spostati da CLAUDE.md il 12/10/2026 senza
> riscrivere nulla: stesse sezioni, stesso ordine. Le novità dell'area si
> aggiungono QUI (3-8 righe nella sezione giusta: cos'era, cosa cambia, dove
> sta il test). La mappa del sistema è in `CLAUDE.md`, le priorità in `ORA.md`.

### GET/POST `/api/homie/searches` — gli occhi di Homie sul radar PFS
Il problema sta scritto in `api/pfs/_fetch.js`: *"both portals run anti-bot
protection and may 403 datacenter IPs — the email-alert path is the
LOAD-BEARING source"*. Cioè il radar del servizio che i clienti **pagano**
(Property Finding, €350) scopre un immobile **quando il portale decide di
mandare l'email**, raggruppata e in ritardo — mentre a Roma un buon affitto
da privato raccoglie decine di contatti nelle prime ore. Il server non può
risolverlo per costruzione; il Mac di Homie (IP residenziale, browser vero,
sessioni autenticate) sì. **La pipeline esisteva già tutta**
(`/api/homie/property` → `pfs/_ingest.js`: dedupe → filtro agenzie →
punteggio su ogni cliente → push nel mazzo di swipe): mancava solo che Homie
sapesse COSA guardare.
- **GET** → la lista viva delle ricerche da aprire, da `radarSearches`
  (auto-generata da `pfs/sync-searches` dai criteri reali di ogni cliente
  attivo, quindi niente da hardcodare sul Mac). `urlOverride` batte sempre
  `searchUrl` — è la manopola manuale dell'operatore. `activeSearches()`
  esportata e testata: spente, senza URL o con URL rotto non entrano mai.
- **POST** `{ok, searches, found, ingested, blocked, error?}` → heartbeat
  `pfsRadarHealth/homie-eyes`, quindi l'allerta Telegram esistente (3
  fallimenti consecutivi) copre anche gli occhi di Homie.
- **`runVerdict()` — la regola che tiene in piedi il resto**: un radar
  CIECO non deve mai sembrare un mercato fermo. "Zero risultati" e "il
  portale mi ha sbattuto fuori" arrivano identici; solo il secondo è un
  guasto, e se non lo si distingue il radar muore in silenzio proprio
  mentre il cliente paga per essere il primo. Esportata e testata (anche
  per mutazione), non riscritta nei test.
Cadenza suggerita 10′. I duplicati sono gratis (dedupe `sha1(sourceUrl)`),
quindi il contratto col Mac è "nel dubbio manda". Test:
`node tests/pfs/eyes.mjs`. Mandato completo: `bot/HOMIE.md`.

### POST `/api/homie/property`
Homie → PFS bridge. Homie scrapes a property (Immobiliare/Idealista/etc.), calls this with the listing data. Validates, then delegates to the shared ingestion pipeline `api/pfs/_ingest.js` (dedupe on `pfsProperties/<sha1(sourceUrl)>`, agency filter, scoring via `api/homie/_match.js`, push score ≥ 60 into each active client's `portalProperties` swipe deck). Client-portal.html already listens and triggers a "New Property!" alert on the client's phone. Auth via `X-Homie-Secret`. See file header for payload schema.

## PFS Radar (automated market scan — api/pfs/*)

The PFS pipeline finds rental listings for paying search clients with no
manual monitoring. One shared ingestion path (`api/pfs/_ingest.js`):
dedupe → advertiser policy (agency listings stored but NEVER pushed) →
score every active `pfsClients` doc (`api/homie/_match.js`, both client
schemas supported) → push into swipe decks → `matchSummary` persisted on
the `pfsProperties` doc for the command center.

| Endpoint (cron) | Schedule | What it does |
|---|---|---|
| `/api/pfs/scan-inbox` | */15 min | **Load-bearing source.** Reads Idealista/Immobiliare search-alert emails from the Gmail mailbox over IMAP (imapflow), reconstructs canonical listing URLs from tracking links (`api/pfs/_alertparse.js`), enriches from the detail page when possible, ingests. Stateless: re-scans a 3-day window, dedupe makes reruns no-ops. |
| `/api/pfs/scan-market` | 2×/hour | Best-effort scraper of the auto-generated searches in `radarSearches` (portals 403 datacenter IPs at will — failures are expected and tracked). |
| `/api/pfs/sync-searches` | daily | Auto-(re)generates one `radarSearches` doc per active client per portal from their stored criteria (`api/pfs/_searchurls.js`). Manual knobs `enabled`/`urlOverride` are never clobbered. Clients gone inactive → searches disabled. |
| `/api/pfs/brief` | daily 06:00 UTC | AI daily briefing: compacts the last 48h (annunci, match, outreach, feedback clienti, salute fonti) and asks Claude (`claude-opus-4-8`, raw-fetch pattern) for an Italian operational brief. Cron → delivered to Telegram; command-center button → returned as JSON `{ ok, brief, stats }`. |

All three accept POST with Vercel cron secret, `X-Homie-Secret`, or an
admin Firebase ID token (the command center's "Scansiona ora" buttons) —
see `api/pfs/_guard.js`. Every run writes a heartbeat to
`pfsRadarHealth/<source>`; 3+ consecutive failures → Telegram alert
(`api/pfs/_health.js`), recovery notified once.

**BLOCCATA ≠ GUASTA** (`alertDecision()`, esportata + testata). `scan-market`
aveva accumulato **1145 run falliti di fila** e un allarme ogni 6h per ~3
settimane: ~96 messaggi identici per una condizione che non può risolversi da
sola — i portali rifiutano gli IP dei datacenter, è documentato in `_fetch.js`.
Il danno non è il rumore: un promemoria non azionabile **abitua a scartare gli
allarmi del radar**, e il giorno in cui muore `scan-inbox` (la fonte PORTANTE)
quello verrebbe scartato con gli altri. Ora ci sono tre stati, non due:
`ok` · `error` (può risolversi → promemoria che si dirada 6h→24h→72h→settimana,
8 messaggi in 40 giorni invece di ~160) · **`blocked`** (non può funzionare da
qui → UN messaggio, che spiega, dice cosa continua a funzionare e dà la via
d'uscita — gli occhi di Homie — poi silenzio finché lo stato non cambia).
`pfs-command.html` smette di mostrarla rossa e lampeggiante: pallino spento,
"🚫 Bloccata all'origine" e la spiegazione al posto dell'errore urlato.
Test: `node tests/pfs/health.mjs`. Listings that could not be
auto-ingested (e.g. no price recoverable) land in
`pfsRadarHealth.needsAttention` — surfaced in `pfs-command.html`, never
silently dropped.

## Il Perito (market intelligence — js/market-engine.js + api/market/*)

Il "nostro Casafari" col dato che Casafari non ha (i canoni FIRMATI). Nato
dall'obiezione dell'operatore agli alert-only: un alert email racconta le
NASCITE degli annunci, mai le MORTI — e le morti sono metà del valore (un
annuncio sparito con prova = affitto concluso → giorni di assorbimento per
zona). Studio: `STUDIO_BOOM_AUTONOMA.md`. Architettura a ciclo di vita:
- **Nascite/vita**: ogni annuncio visto da QUALSIASI porta (pfs/_ingest tap,
  best-effort e DOPO la scrittura master — il radar non rompe mai il servizio
  pagato) alimenta `marketListings` via `api/market/_ledger.js` →
  `ME.observe()`: fold puro, storia prezzi solo sui cambi, rientri con vite
  archiviate (`pastLives`), MAI contatti del privato (il motore li scarta
  alla porta — GDPR per costruzione, testato per mutazione).
- **Morte**: verifiche attive via il Mac di Homie (`api/homie/market.js` —
  GET lotto secondo le manopole, POST esiti; mandato in `bot/HOMIE.md`).
  **Il verdetto lo dà IL SERVER** (`deathVerdict`): gone SOLO con prova
  (404/410, marker 'unavailable'/'search'); 403/429/timeout/200-ambiguo =
  unknown, MAI gone — un pomeriggio di blocchi non è "mezza Roma affittata".
  Heartbeat `pfsRadarHealth/perito-eyes` (allerta Telegram esistente).
- **Statistiche**: cron `api/market/pulse.js` (05:50 UTC) → un doc
  `marketStats/<zoneSlug>` per zona (il portal legge quello, mai il registro
  intero): mediana/p25/p75 €/mq, assorbimento (mediana giorni, SOLO morti
  provate), ribassi 30gg. **Sotto `minSample` non esce un numero** —
  "campione insufficiente", mai una mediana su 3 annunci. Verdetto esplicito
  su libro vuoto e backlog verifiche (la lezione runVerdict di pfs/eyes).
- Manopole nel registro squadra (deathcheckBatch/enrichBatch/minSample),
  rules `marketListings`+`marketStats` admin-only (lezione propertyLocks).
- Test: `node tests/market/engine.mjs` (18 check; mutazioni: 403→morte,
  contatti→dentro, campione piccolo→pubblica — tutte catturate) e
  `node tests/market/wiring.mjs` (giunzioni sulla sorgente: ordine del tap,
  verdetto solo server, rules, cron).

## Il Radar 2.0 — La Centrale (js/radar-engine.js + api/radar/* + /radar)

I quattro poteri di un Casafari, costruiti sul ciclo di vita del Perito e sul
dato che Casafari non ha (i canoni FIRMATI). Studio: `STUDIO_RADAR_CENTRALE.md`.
Il giudizio vive nel motore puro `js/radar-engine.js` (`BOOM_RADAR`, UMD,
riusa `normalizeZone` di market-engine — UNA copia); l'I/O nelle porte.

- **L'IMPRONTA** — la stessa casa vista da due porte è UNA casa.
  `api/radar/_tap.js` (chiamato da `_ingest` DOPO master + libro mastro,
  best-effort: col radar rotto il servizio pagato non si ferma — asserito
  nei test) gemella l'annuncio contro l'indice dei recenti
  (`radarState/index`, UN doc compatto, cap 800/90g — cache della verità:
  una voce persa degrada, non rompe). Regole dure, testate per mutazione:
  vie diverse = MAI gemelli; stessa fonte = soglia più alta + segnale
  identitario obbligatorio (le dieci unità gemelle della stessa agenzia);
  il segnale titoli esige ≥2 token significativi. Cluster additivo su
  `pfsProperties.radar` (clusterId = capostipite), MAI cancellazioni.
  Effetti: il mazzo del cliente NON riceve due volte la stessa casa da due
  portali; il cluster dichiara `privateAndAgency`/`multiPortal`/`repost`.
- **IL FIUTO** — punteggio occasione 0-100 contro `marketStats/<zona>` +
  libro mastro (ribassi 14g, rientri 30g, privato, appena uscito). Sotto
  campione NIENTE verdetto; prezzo irrealistico = 'sospetto', mai
  'occasione' (le truffe vivono sotto p25). verdict='occasione' → feed
  `radarState/occasioni` (cap 60, la stessa CASA una volta sola anche via
  gemelli) + card Telegram 💎. Un ri-avvistamento non è una notizia; un
  RIBASSO sì (`priceJustDropped` dal ramo skipFresh, che ora aggiorna
  anche il prezzo sul doc — prima restava stantio).
- **LE VEDETTE** (`radarWatchers`, CRUD dalla Centrale) — le ricerche
  libere, slegate dai clienti PFS: zone/prezzo/mq/camere/solo-privati/solo
  occasioni; canale Telegram ISTANTANEO (nel tap) e canale email come
  DIGEST (`api/radar/digest.js`, cron 3×/giorno, disciplina Segugio: max 6
  case, notifiedIds DOPO l'invio, un rerun non rispedisce). Una vedetta
  vede solo il FUTURO (annunci nati dopo la sua creazione); il de-dup di
  cluster è per canale e per vedetta (il gemello PRIVATO di un annuncio
  d'agenzia passa dalla vedetta "solo privati"); criterio dichiarato +
  dato mancante = NO che dice perché. Heartbeat `teamHealth/vedetta`.
- **IL VALUTATORE** (`POST /api/radar/valuta` {zone,sqm,rooms}, auth come
  i cron PFS) — fascia canone dai quantili del CHIESTO di zona, CORRETTA
  sul rapporto chiesto→FIRMATO dei contratti BOOM della zona (≥3 firme,
  cap [−20%,+10%], sempre dichiarata) + comparabili vivi dal libro.
  Sotto campione: 'small_sample', mai un numero debole.
- **IL RADAR MANDATI** — `pulse.js` (il Perito) compila
  `radarState/mandati`: privati fermi oltre 1.5× l'assorbimento di zona
  (o 60g fissi dichiarati) = candidati "proponigli la gestione BOOM".
  CARD per l'operatore, MAI contatti automatici (la D5 del Perito non si
  tocca: solo fatti + URL pubblico).
- **LA ZONA DEDOTTA, MAI INDOVINATA** (`inferZone`) — il difetto che
  affamava tutto: scan-inbox (fonte portante) non passava zone,
  scan-market passava la LABEL della ricerca come zona → slug spazzatura
  che frammentava marketStats. Ora: lessico curato di ~38 zone romane su
  titolo+indirizzo (mai la descrizione — "a due passi da Trastevere" è
  marketing), parole intere, l'alias lungo batte il corto contenuto
  ('monti tiburtini' → Tiburtino), ambiguo → null; provenienza dichiarata
  (`zoneInferred`). `_searchurls` emette la zona pulita → `sync-searches`
  la persiste (`zoneName`) → `scan-market` passa quella.
- **Due battiti guariti**: `pfsRadarHealth/sync` era letto ma MAI scritto
  (ora `reportHealth('sync')` in sync-searches); gli occhi del Perito
  (`homie/market.js`) scrivevano il battito a mano bypassando
  `alertDecision` — l'allerta promessa nel commento non esisteva. Ora vera.
- **Console** `/radar` (admin, noindex+no-store, gruppo Console del
  portal): salute fonti, polso per zona, occasioni, mandati, vedette,
  valutatore, gemelli. La Vedetta è nell'organigramma (driftVsCrons);
  Perito.console = /radar. Rules: `radarWatchers` + `radarState`
  admin-only (lezione propertyLocks).
- Test: `node tests/radar/run.mjs` (102 check — motore per mutazione,
  giunzioni sulla sorgente, giro vero su Firestore in memoria col digest
  email reale via nodemailer mockato, e il contenimento: radar giù →
  cliente servito comunque).

## Lo Scatto + Il Contatto (bot/boom_scout.py · bot/boom_contatto.py · api/outreach/*)

Il ciclo PFS chiuso per intero, coi due bracci sul Mac che mancavano
(mandato completo: `bot/SCATTO_CONTATTO.md`; installazione in UN comando:
`bot/install_scatto_contatto.sh` — ritrova HOMIE_SECRET dai bracci già
installati, .env mai clobberati, rilanciarlo aggiorna gli script e basta).
La scoperta che li ha fatti
nascere: il ciclo "apri le ricerche → estrai → manda al server" esisteva
solo come PROMPT in `bot/HOMIE.md` — nessuno script deterministico lo
eseguiva, e il radar viveva dei soli alert email. Regola invariata: il
server pensa, il Mac esegue (IP residenziale, browser vero — i portali
403-ano i datacenter, `api/pfs/_fetch.js`).

- **LO SCATTO** (`bot/boom_scout.py` + `com.boom.scout.plist`, ogni 10'):
  GET `/api/homie/searches` (che ora porta anche la `zone` pulita) → apre
  ogni ricerca nel profilo persistente → estrae gli URL (stessi pattern di
  `_fetch.js`), registro locale dei già visti (il dedupe VERO è del server)
  → apre le schede nuove (JSON-LD prima, regex poi, mai inventare) →
  inserzionista SOLO con prova: `/da-privati/` → private per costruzione,
  marker → quello che dicono, altrimenti **`unknown` ESPLICITO** (il server
  a campo mancante assume private — un'agenzia spacciata per privato
  finirebbe nel mazzo) → POST `/api/homie/property` (ora con
  `skipFreshHours`: i ri-avvistamenti non ripunteggiano tutti i clienti) →
  rapporto = battito (`pfsRadarHealth/homie-eyes`, `blocked` è il campo che
  conta). Priorità totale al privato per costruzione: le agenzie si
  archiviano, mai nei mazzi.
- **IL CONTATTO** (`js/outreach-engine.js` + `api/outreach/*` +
  `bot/boom_contatto.py` + `com.boom.contatto.plist`, ogni 5'): il primo
  messaggio al proprietario nella CHAT DEL PORTALE (quando non c'è un
  numero), approvato UNO PER UNO. In plancia: 📨 sul feed/triage → modale
  con 4 stili (sobrio/caloroso/deciso/english) × 2 voci (chi cerca casa /
  BOOM trasparente), anteprima ISTANTANEA dal motore condiviso (UMD:
  stessa copia browser e server), ✨ rifinitura AI opzionale
  (`api/outreach/draft.js`, haiku sui SOLI fatti dell'annuncio, fallback
  template su qualunque errore), testo editabile → il tap Approva È la
  firma: doc `outreachQueue/out_<listingId>` (id deterministico = **un
  contatto per annuncio per costruzione**). `api/outreach/queue.js`: lease
  anti doppio-invio (GET marca 'sending', orfani oltre 45' tornano in
  coda), 3 fallimenti = parcheggio, **esito_incerto = parcheggio
  IMMEDIATO** (un retry cieco rischia il doppio messaggio allo stesso
  proprietario), `blocked` rilascia i job e il battito lo dice
  (`pfsRadarHealth/contatto`, riportato anche a coda vuota), a invio
  riuscito l'annuncio passa da solo a `contattato` (channel portal-chat).
  Guardie del motore: mai un telefono nel testo, mai dati del cliente
  (solo ingresso/durata generici), `?peek=1` per guardare senza prendere.
  Kill switch `settings/outreach {enabled:false}`. MAI il bottone sulle
  agenzie. Nell'organigramma: approval **'sempre'** (ogni messaggio è un
  tap), il terzo agente ad approvazione umana accanto a Gestore e
  Commerciale (pinnato nei test del registro).
- Test: `node tests/outreach/run.mjs` (47) · `python3 tests/scout/runner.py`
  (29) · `python3 tests/contatto/runner.py` (16).

### POST `/api/admin/match-test`
Admin test harness + manual-ingest endpoint (Firebase ID token, role
admin/owner/landlord). `dryRun:true` scores a hypothetical listing against
every active client without writing; `dryRun:false` ingests + pushes for
real. Backs the "Aggiungi annuncio" modal in `pfs-command.html`.
