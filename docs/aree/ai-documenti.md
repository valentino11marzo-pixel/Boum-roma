# AI e documenti — Centrale AI, Doc Parser, Innesto, Scrivano, Smistatore, Bonifica

> Dettaglio e storia di quest'area, spostati da CLAUDE.md il 12/10/2026 senza
> riscrivere nulla: stesse sezioni, stesso ordine. Le novità dell'area si
> aggiungono QUI (3-8 righe nella sezione giusta: cos'era, cosa cambia, dove
> sta il test). La mappa del sistema è in `CLAUDE.md`, le priorità in `ORA.md`.

### POST `/api/parse-docs`
Proxies to Anthropic Claude API for document extraction (model pinned
server-side, max_tokens capped, body field-whitelisted, 10MB cap, rate limit
per IP). **Due vie di autorizzazione**: l'ID token Firebase di un utente con
ruolo **admin** (la via di `boom_doc_parser.html`, verificata server-side come
in `api/_auth.js`) oppure il segreto storico `PARSE_DOCS_SECRET` per i
chiamanti server-to-server. Un utente loggato senza ruolo admin riceve **403**,
e in nessuno dei due casi si spende un token Anthropic.

**La lezione del 23 agosto 2026**: la pagina si procurava il bearer leggendolo
da Firestore (`config/parse_docs.bearer`) — un documento **mai creato in
produzione**, quindi lo strumento si apriva sul cartello *"Parser config
missing. Contact admin."* e non partiva nulla. Creare quel documento avrebbe
rimesso in piedi anche il difetto che `docs/portal-security-audit.md` segnalava
da mesi (rilievo #7): un segreto del SERVER spedito dentro una pagina, dove
chiunque legga quella collection se lo porta via. Ora nel browser non scende
nessun segreto: il token dell'admin è già lì, dura un'ora e si rinnova da solo
(`getIdToken()` a ogni chiamata — una pagina lasciata aperta il pomeriggio
mandava altrimenti un token scaduto). E un errore HTTP viene detto per quello
che è: prima un 401/429 arrivava all'operatore come *"JSON non valido nella
risposta"*, il messaggio sbagliato per il guasto.
Test: `node tests/parser/run.mjs`.

### La Centrale AI (`api/_ai.js` + `js/ai-registry.js` + `GET/POST /api/ai/status` + `/ai` su Telegram) — 21/09/2026
**Cos'era.** VENTITRÉ file chiamavano `api.anthropic.com` ognuno con la
propria `fetch`, il modello scritto a mano dentro il file e NESSUN contatore:
la spesa AI era una riga di fattura a fine mese, mai un numero per scopo. Le
scelte care erano invisibili — `_claude.js` metteva **opus 4.8** di default
sulla prima risposta del Commerciale, sui turni della Segretaria e su
`ai.reply` (sonnet 5 sull'interprete del bot, opus 5 sull'inventario) — e
«proviamo un modello locale sul Mac» avrebbe voluto dire ventitré patch senza
alcun modo di sapere se il locale regge. Lo studio è
`STUDIO_MODELLI_LOCALI_2026-09.md`; il lato Mac (server, tunnel, launchd) è
il compito di Codex in `docs/PROMPT_CODEX_MODELLI_LOCALI.md`.

**Cosa cambia.** Ogni chiamata a un modello passa da `ai({ purpose, system,
messages|user, maxTokens, timeoutMs, json })` in `api/_ai.js`; il chiamante
dichiara solo lo SCOPO, e lo scopo sta nel registro puro `js/ai-registry.js`
(27 voci: file, modello cloud di default, modalità testo/visione/documento/
audio, `localOk` col perché, posta in gioco, i campi su cui misurare
l'accordo). La centrale:
- **instrada** secondo `settings/ai` (default: TUTTO cloud, il deploy non
  cambia niente): `cloud` com'è oggi · `shadow` (risponde il cloud, il locale
  corre in parallelo e si registra SOLO se i due sono d'accordo — mai il
  contenuto) · `local` (risponde il locale; giù, lento o JSON illeggibile →
  si ricade sul cloud, `fallback:true` nel risultato e nei contatori; con
  `local.fallback:false` è un errore dichiarato). Il locale è un endpoint
  **OpenAI-compatibile** (`/v1/chat/completions`: Ollama, llama-server, LM
  Studio, mlx-lm) raggiunto dal server attraverso un tunnel https; il TOKEN
  sta solo in env. Il server pensa, il Mac esegue — e col Mac spento il cloud
  c'è: fail-open per costruzione;
- **tiene i confini**: `banking.pdf`, `inventario.video` (il documento vale
  sul deposito) e `parse.docs` (proxy: la pagina legge la risposta grezza,
  dichiarato `direct` e contato via `recordUsage`) non vanno MAI in locale
  nemmeno se scritto nel documento (rifiutato col perché); un blocco PDF
  forza il cloud; un'immagine esige `local.visionModel`; l'ombra NON è un
  paracadute (cloud giù = errore, la qualità non cambia di nascosto);
- **conta**: `aiUsage/<giorno di Roma>` con incrementi atomici (`:commit` +
  `increment`, due funzioni in parallelo non si sovrascrivono): per scopo ×
  backend chiamate/ok/fail/ricadute/token veri/cache/ms e il **costo dal
  listino** (`PRICES` nel registro; modello ignoto → `null`, mai un numero
  inventato; STT stimata dai byte e detta stima). `aiShadow/<scopo>`: coppie,
  accordi, disaccordi, guasti del locale. Un contatore che fallisce non fa mai
  fallire una risposta ottenuta;
- **cambia modello senza deploy**: `purposes.<scopo>.cloudModel` in
  `settings/ai` (validato sul listino) — «il Commerciale su sonnet invece di
  opus» è un POST, non una PR. `ANTHROPIC_MODEL` in env resta l'override
  globale dei quattro chiamanti di `_claude.js`;
- **nei log mai contenuto**: codice, stato, millisecondi (il test scandaglia
  ogni `console.*` del file).
`/ai` su Telegram: stato del locale (sonda a `/v1/models`), spesa di oggi e
del mese per backend, una riga per scopo con modalità e verdetto dell'ombra,
bottoni `aitg:` che accendono/spengono il locale e ruotano la modalità
(cloud → shadow → local; chi non può, resta). `GET /api/ai/status` è la
stessa fotografia in JSON (auth come i cron PFS); `POST` (solo admin)
scrive `settings/ai` DOPO la validazione del registro: un valore impossibile
torna 400 con `rejected` e non si scrive. **La promozione la decide sempre
l'operatore, coi numeri davanti** — `shadowVerdict`: ≥ `minSample` (30)
coppie, accordo ≥ `minAgree` (90%), locale che fallisce ≤ 10% → «pronta»;
per i testi liberi (bozze ai clienti) l'ombra non misura: la misura sono le
approvazioni dell'operatore, cioè la scala della fiducia. La trascrizione
(`api/wizard/_stt.js`, scopo `stt.transcribe`) ha lo stesso doppio backend:
Whisper sul Mac (`local.sttUrl`, rotta OpenAI-compatibile) prima, OpenAI come
rete. Rules: `aiUsage`/`aiShadow` admin-only, `settings/ai` non pubblico
(porta l'URL del tunnel).
Test: `node tests/ai/run.mjs` (145 check — default pinnati, confini per
mutazione, ricadute, ombra, contatori e costo, porta HTTP, STT, giunzioni
sulla sorgente, anti-deriva nelle due direzioni: ogni chiamante dichiara uno
scopo che esiste, ogni scopo ha un chiamante, nessun modello scritto a mano
fuori dal registro) + `tests/tempo/run.mjs` (la regola di classe «nessuna
chiamata senza tetto» letta sulla centrale e sui `direct`).

**Il lato Mac (22/09/2026 — Codex fuori crediti, fatto qui).** Ollama serve
il modello (`:11434`) ma NON ha autenticazione: esposto nudo, chiunque
potrebbe farci girare i propri prompt, e di lì passano i documenti dei
clienti. `bot/boom_locale.py` è **il ponte con la serratura**: bearer
`LOCAL_AI_TOKEN` (senza token nel `.env` il server NON PARTE — verificato
per mutazione), inoltra SOLO le tre rotte del contratto (`/v1/models`,
`/v1/chat/completions`, `/v1/audio/transcriptions` → `STT_URL`; l'API
nativa `/api/pull`,`/api/delete` resta invisibile), `/health` senza auth e
senza dettagli, body oltre 12 MB → 413, Ollama giù → 502/504 con codice, nei
log rotta/stato/ms e mai contenuto. `bot/install_locale.sh` (un comando,
idempotente): legge chip e memoria, sceglie il modello con `--pick-model`
(UNA tabella, nello script — 8 GB `qwen3:4b` · 16 `qwen3:8b` · 24–32
`qwen3:14b` + `qwen2.5vl:7b` · 64+ `qwen3:32b`), `ollama pull`, imposta
`OLLAMA_CONTEXT_LENGTH=16384` e `OLLAMA_KEEP_ALIVE=-1` (il catalogo
dell'interprete supera i 4096 di default; un modello scaricato dopo 5' di
silenzio costa 10-30 s alla chiamata dopo, oltre il tetto del server),
genera il token, installa `com.boom.locale` (KeepAlive), espone con
**Tailscale Funnel** (https stabile senza dominio) e stampa le righe per
Vercel; `--test` prova il ponte, `--smoke` chiede a `/api/ai/status` se il
server lo vede. Guida per l'operatore: `bot/MODELLI_LOCALI.md`. Test:
`python3 tests/locale/runner.py` (40 check: picker, serratura per
mutazione, rotte, log senza contenuto, e il server VERO contro un Ollama
finto in-thread). **Il primo giro vero (22/09 sera, via SSH)**: il Mac mini
si usa da terminale, quindi l'app Tailscale (estensione da approvare sullo
schermo, login nella finestra) è inerte; la via è il demone Homebrew
(`brew install tailscale`, `sudo tailscaled install-system-daemon`,
`sudo tailscale set --operator`, `tailscale login` che stampa un link).
L'installer sceglie il Tailscale che RISPONDE a `status`, non il primo file
che esiste, e per l'altro dice cosa fare. E nei blocchi copia-incolla **mai
un commento `#`**: zsh interattivo non li accetta e li esegue come parole.
**Il secondo intoppo della stessa sera: Ollama non c'era.** La guida lo
dava per «già installato» — un'assunzione scritta come un fatto, mai letta
dal Mac — e l'unica via dell'installer era «scaricalo da ollama.com e apri
l'app», che via SSH non è una via. Ora, se `ollama` manca e c'è Homebrew,
l'installer fa `brew install ollama` (la formula: solo il binario, senza
finestra) e, senza `Ollama.app`, tiene su il server con un LaunchAgent
NOSTRO, `com.boom.ollama`, con `OLLAMA_CONTEXT_LENGTH`/`OLLAMA_KEEP_ALIVE`
scritti NEL plist e `OLLAMA_HOST=127.0.0.1:11434` (la serratura è il ponte:
Ollama non si espone). Il plist sopravvive al riavvio; `launchctl setenv`
— la via del ramo app, quella che la doc di Ollama consiglia — no: dopo un
reboot l'app riparte col contesto di default. Dichiarato nel sorgente, non
risolto (il Mac mini non ha l'app). Un solo server su :11434: se lo occupa
un altro `ollama` (brew services, un `serve` a mano) l'installer lo ferma
prima di caricare il suo, altrimenti il suo entra in crash loop. Cinque
check in più in `tests/locale/runner.py` (45). **E l'installer era
impaziente**: 10 s di attesa sul ponte, dopo un pull da 5 GB il primo
avvio ne ha voluti di più, e ha dichiarato morto un ponte VIVO (PID, porta
in ascolto, log vuoto). Ora 30 s e, se tace, il messaggio dice dove
guardare (`launchctl list`: trattino = non parte, PID = sta partendo).
`HOMIE_SECRET` per `--smoke` si legge anche nella forma `export
HOMIE_SECRET="…"` di `~/.boom/env` (il ponte di Homie lo scrive così).
**Il terzo intoppo, e il più istruttivo: il modello pensava.** La prova
«completion JSON» del ponte è fallita con `Expecting value: line 1 column 1`
— contenuto VUOTO. qwen3 è un modello «pensante», Ollama lo lascia pensare
di default, e con 60 token di tetto li spende tutti nel ragionamento; sul
server, col tetto di 20 s, sarebbe stata una ricaduta sul cloud a OGNI
chiamata, e `/ai` avrebbe mostrato «ricadute» senza dire perché. La rotta
OpenAI-compatibile di Ollama non ha un interruttore affidabile per il
ragionamento, quindi il ponte **traduce** `/v1/chat/completions` sull'API
NATIVA `/api/chat` (`to_native_chat`: `think:false` salvo `think` esplicito
nel body, `response_format` → `format`, `max_tokens` → `num_predict`,
immagini data-URI → `images`, mai streaming) e riporta la risposta nella
forma OpenAI che `api/_ai.js` legge (`from_native_chat`: choices,
finish_reason da `done_reason`, usage dai conteggi nativi; un
`<think>…</think>` residuo si toglie, un `<think>` troncato è tutto
ragionamento → contenuto vuoto con `finish_reason:'length'`). Il finto
Ollama dei test risponde 500 sulla rotta compatibile: se il ponte tornasse
a usarla, il test cade. `LOCALE_RAW_BASE=…/<branch>/bot` davanti
all'installer prova il ponte di un ramo prima del merge (l'installer del
ramo scaricava il ponte di `main`, cioè quello vecchio). **E il quarto,
quello che spiegava tutti gli altri timeout: la porta aperta ma sorda.**
Dopo ogni riavvio del ponte, per ~28 s ogni connessione a 127.0.0.1:8088
moriva in «Operation timed out» (non «refused») — poi la quarta prova
passava. `HTTPServer.server_bind` chiama `socket.getfqdn(host)`, una
reverse-DNS di 127.0.0.1, FRA il bind e il listen: sul Mac mini, col
resolver appena passato a Tailscale, ~28 s; e su macOS un socket bound ma
non in listen SCARTA il SYN (Linux risponde RST). È il motivo per cui
l'installer «impaziente» dei 10 s aveva dichiarato morto un ponte vivo.
`ThreadedServer.server_bind` salta la lookup (`server_name` non lo usa
nessuno), backlog a 32; il test patcha `socket.getfqdn` e pretende che
l'avvio non lo chiami (l'`HTTPServer` nudo lo chiama: verificato). **Il quinto, sull'https del Funnel: acceso, risolto, e appeso — e la
prima diagnosi era sbagliata.** `tailscale funnel status` diceva «Funnel
on», il DNS pubblico rispondeva, e `curl` DAL MAC verso il proprio nome
`.ts.net` restava senza ServerHello anche dopo 120 s. Prima ipotesi:
Let's Encrypt emette il certificato alla prima richiesta e un client che
chiude a 15-20 s interrompe l'emissione. Smentita dai fatti: `tailscale
cert <nome>` ha scritto i file SUBITO e il curl locale restava appeso
lo stesso. Il fatto verificato: dallo STESSO Mac, `curl --resolve
<nome>:443:<IP dell'ingresso del Funnel>` risponde `{"ok": true}`.
Cioè il percorso pubblico — quello che fa Vercel — funziona; quello che
si inceppa è il giro del Mac su sé stesso (MagicDNS → IP del tailnet →
listener locale di tailscaled), e la sua causa NON è stabilita: non
serve alla produzione. Regola: la prova di un tunnel si fa sul percorso
che userà il server, non su quello comodo. L'installer ora chiede a un
resolver pubblico (`dig +short … @1.1.1.1`) l'IP dell'ingresso e prova
`/health` con `--resolve` su quello; un record pubblico ancora assente
viene detto come tale, mai come guasto; `tailscale cert` resta (costa
niente, e stampa l'errore vero quando «HTTPS Certificates» è spento nel
tailnet — mai `/dev/null` come file: «already exists and is not a
regular file»). Il sandbox non può provare nulla di tutto questo
(policy di egress: 403 sul CONNECT verso `*.ts.net`); il telefono su
rete mobile è l'altra prova onesta. E le env su Vercel le mette
l'operatore: il token del ponte non passa da una chat, e comunque la
connessione Vercel di Claude non può né leggere né scrivere le env di
produzione (403 su entrambe, provato). 63 check.

**Il merge con l'Innesto 3.0 e la Segretaria di Codex (22/09/2026).** Su
`main` erano intanto arrivati l'Innesto 3.0 (`api/portal/ingest.js`: Opus 5,
lo strumento `proposta`, thinking adattivo, la scala dei 400 di forma, 100 s
di tetto) e `api/segretaria/_prepare.js`. Due decisioni: (1) **`portal.ingest`
è `direct`** come il proxy del Doc Parser — strumento, thinking e la scala
dei 400 sono del cloud e non passano dalla porta OpenAI-compatibile del
locale, quindi `localOk:false`; il file chiama in diretta col SUO tetto
(`AI_MS`) e **si conta** con `recordUsage` (Opus 5: la voce più cara del
registro, ora visibile in `/ai`). Il registro pinna `claude-opus-5` e
`tests/ai` pretende che un `direct` che scrive il modello a mano lo scriva
UGUALE al registro (il costo si calcola col nome che arriva). (2) Lo scopo
nuovo **`segretaria.prepare`** (opus 4.8 via `callClaude`: la proposta sul
caso validata da `PROPOSTA` e approvata a mano). Le suite di Codex che
recintano le scritture della preparazione a `operatorTasks|heartbeat`
ammettono ora anche `aiUsage/` — il contatore della centrale è una
scrittura per costruzione, e il recinto resta: qualsiasi altra scrittura fa
cadere il test. Nulla cambia nel comportamento verso il cliente.

**Il primo tap sul locale lo spegneva (23/09/2026 — letto nel `/ai`
dell'operatore, non dedotto).** Con `LOCAL_AI_URL` e `LOCAL_AI_MODEL`
regolarmente in env su Vercel, dopo «🟢 Accendi il locale» `/ai` diceva
«🔴 locale non configurato» e lo scopo in shadow cadeva su «→ cloud (nessun
URL locale)». Il toggle scriveva su `settings/ai` la forma VALIDATA intera di
`local` — `url:''`, `model:''`, `timeoutMs:20000`… — e `loadAiSettings`
faceva `{ ...env, ...doc.local }`: «il documento vince sull'env» valeva anche
per un vuoto, quindi la stringa vuota del documento spegneva l'URL in env. Un
difetto che si accende al PRIMO uso del bottone, invisibile alla suite perché
nessun check metteva insieme env e documento. Ora l'env riempie dove il
documento TACE (`''`/`null` non sono una scelta) e il tap scrive SOLO le voci
che qualcuno ha scritto — mai i default, che maschererebbero l'env
(`LOCAL_AI_TIMEOUT_MS` compreso). Il documento già scritto in produzione si
sana da solo alla lettura. Le due mutazioni riproducono il messaggio visto.

### POST `/api/documents/share`
Admin/landlord (Firebase ID token via `api/_auth.js`). Creates a
`documentShares` doc (token, ownerId, docIds, recipientName, watermark,
expiresAt, views[]) and returns a `/share.html?t=<token>` link for the
commercialista. Landlords can only share their own bundle.

### POST `/api/share/lookup`
Public, no login. Body `{ token }`. Resolves the share under admin creds,
enforces expiry/revocation, returns the listed documents (sanitized) and
audit-logs every view (ip/ua/time) to the share's `views[]` + activityLog.
Backs `share.html`.

### POST `/api/documents/ocr`
Admin/landlord (Firebase ID token). Body `{ fileUrl }` or `{ base64,
mediaType }`. Fetches the file server-side, sends to Claude (haiku), returns
`{ category, text, entities:{ dates, amounts, codiceFiscale, iban,
partitaIva, fiscalYear } }`. Anthropic key stays server-side.

### Dati: LA BONIFICA + L'INNESTO (`js/dataops-engine.js` + portal pages)
Two admin-only portal pages that keep the archive honest. All decision logic
lives in the pure, dependency-free `js/dataops-engine.js`
(`window.BOOM_DATAOPS`, 85 unit tests in `tests/dataops/test.mjs`) — it
decides what gets DELETED and what gets CREATED, so it is testable without a
browser or Firestore.
- **🧹 Bonifica** (`goTo('bonifica')`) — finds test data, stale notifications
  and broken references, then deletes ONLY what the operator ticks. Every
  item carries the reason it was flagged, in Italian. `isProtected()` locks
  anything with legal or monetary weight (paid payments, signed/registered
  contracts, documents with a file, admin users): shown, explained, never
  preselected, and skipped by "select all". Preselection is limited to
  severity `alta` + unprotected. Orphan hunting uses an index built ONLY
  from collections actually loaded — a missing key means "I didn't read it"
  and nothing is declared orphan (an empty in-memory array is treated as
  not-loaded, since the portal loads in two waves). Before any delete it
  downloads a JSON backup of exactly what is about to disappear (Firestore
  has no trash), then batches the deletes, prunes `S`, drops the data cache
  and writes an `activityLog` entry. Two-step arm on the button, with the
  cascade (payments of a deleted contract, contracts of a deleted property)
  surfaced BEFORE execution.
- **🌱 Innesto** (`goTo('innesto')`) — paste a contract / an owner's email /
  a WhatsApp message, or drop a PDF or photo, and get a proposal already in
  the portal's exact schema: landlord → property → tenant → contract →
  rent schedule. Each entity says whether it is NEW or matches an existing
  record and why (`findMatch`: same CF / email / IBAN / address / name, also
  reversed word order; below 70 it proposes nothing — a visible duplicate
  beats a contract attached to the wrong person). Real validation before
  anything is written: codice fiscale checksum (omocodia-aware), IBAN
  mod-97, date coherence, canone sanity — errors block, warnings don't. The
  schedule is generated by the SAME `generateMonthlyPayments()` used by
  magic-sign, so the two paths can never duplicate one.
  **Il fascicolo a più letture (31/08, dal caso Via Simeto)**: il contratto
  nasce solo con ENTRAMBE le gambe (immobile + inquilino), ma un PDF vero
  spesso non le porta tutte — e prima quel salto era MUTO ("Innesto
  completato" senza contratto) e senza uscita anche quando la persona/casa
  esisteva già in anagrafica. Ora: (1) la sezione mancante è un **fantasma**
  con select dall'archivio + «Compila a mano» (`innestoPick`/
  `innestoAddSection`; l'aggancio scelto vince sempre sul match riderivato,
  anche per l'immobile); (2) una seconda lettura **integra** la proposta
  aperta (`mergeProposal` nel motore: riempie SOLO i buchi, un campo pieno
  — magari corretto a mano — non si tocca MAI; il bottone diventa «Leggi e
  integra», una lettura vuota non butta via niente); (3) `deriveProposal`
  fa l'aritmetica dichiarata (deposito = mensilità × canone, canone⇄immobile,
  nome dall'indirizzo — mai una stima); (4) a contratto creato si atterra
  sulla pagina Contratti, e un contratto saltato ha card rossa PRIMA e toast
  warning DOPO che nominano la gamba. `js/dataops-engine.js` è network-first
  nel SW (cache `boom-v18`): il motore non può divergere dalla pagina.
  **Innesto 3.0 (14/09/2026)** — dopo la lettura (vedi `/api/portal/ingest`):
  (1) **più file, incolla, scatta**: drop zone `multiple`, Ctrl+V di uno
  screenshot, `capture="environment"` da telefono, chip per file, progresso
  con i secondi e la fase (transito / lettura); (2) **la card dice cosa ha
  letto**: un verdetto per documento (tipo, pagine, illeggibile e perché),
  il riassunto, il costo stimato (`INNESTO_RATES`, $/M token); (3) **ogni
  campo cita** la frase del documento (`evidence` → `evMap`, percorsi del
  modello ricondotti alla forma piatta da `innestoEvPath`), un campo
  DERIVATO dice «calcolato: …», un valore senza citazione lo dichiara;
  campi core sempre visibili, il resto dietro «＋ altri campi»; (4) **LA
  MODIFICA PROPOSTA** (STUDIO_SCRIVANO §3, soffitto 1 chiuso): chi esiste
  già in archivio non genera un doppione e non resta com'era — la card
  mostra prima → dopo (`diffRecord`): un buco si riempie con la spunta già
  accesa, un valore che CAMBIA parte spento e lo confermi tu; la scrittura
  va nella collection del record (`users`/`landlords`/`properties`, `_col`
  sul pool) nei DUE schemi users (`codiceFiscale`+`cf`, `birthDate`+`dob`…),
  firmata `updatedBy:'innesto'`; (5) **co-conduttori** con la loro card,
  aggancio e riga `coTenants[]` sul contratto (cf, dob, tenantIndex,
  userId); (6) **parità con saveContract**: il contratto nasce con
  `tenantSignToken`/`landlordSignToken`, `canone{}` (mesi di locazione da
  `monthsSpan`, non i «11 mesi e 30 giorni» di monthsBetween), `durata{}`,
  identità delle parti (`tenantCF/Dob/Pob/Doc*`, `landlord*`), catasto in
  testo, APE, rendita, `studenti{}`, `cohabitants`, `otherClauses`, poi
  `generateMonthlyPayments`, `generateContractDeadlines` e
  `generateContractPDF` (best-effort); (7) **il documento RESTA**
  (STUDIO_SCRIVANO §4 passo 1): i file letti si archiviano su
  `documents/<uid>/innesto/` e in `documents` con categoria/cartella dello
  Smistatore, legati a contratto/immobile/persona; un documento d'identità
  entra anche negli `identityDocs` del contratto e del profilo
  (`arrayUnion`, mai una riscrittura); spegnibile dalla barra. Motore:
  `pruneProposal`, `cfBirth`/`cfBirthDateMatches`/`cfMatchesName` (il CF
  che CONFERMA data e nome: data invertita = errore, CF di un'altra persona
  = avviso), `validatePIva`, `monthsSpan`, `diffRecord`/`applyDiff`,
  `LABELS` in una copia; controlli: deposito > 3 mensilità (art. 11 L.
  392/78), durate per tipo (transitorio 1–18, studenti 6–36, 3+2 = 36),
  esigenza mancante, studenti senza corso. Test: `tests/dataops/test.mjs`
  (174 check) + `tests/innesto/run.mjs`.

**Conferma Scrivano unica (18/09/2026)** — `scrivanoProposals.application`
prenota la conferma in transazione; ogni record primario e il suo riferimento
sono salvati insieme. Due tab o una riapertura non ricreano contratto/rate.
Guasti su archivio o identityDocs restano visibili con esito per file e accesso
al contratto registrato. Un'interruzione conserva la prenotazione: recupero
esplicito sui record, mai un nuovo import o rigenerazione automatica del piano.
Prove `tests/innesto/confirmation.mjs`: concorrenza, interruzione dopo contratto,
ricevuta persa e collegamenti respinti; non certificano il recupero automatico.

### POST `/api/portal/ingest` — L'INNESTO 3.0 (14/09/2026)
Admin/owner/landlord (Firebase ID token). Body `{ text?, files?:[{ base64? |
fileUrl?, mediaType, name }] (≤8, ≤8 MB l'uno, ≤20 MB in tutto), context:{
hint?, known:{ landlords[], tenants[], properties[] } } }` (il vecchio corpo
a UN file `base64/fileUrl/mediaType` è ancora accettato) → `{ ok, proposal,
derived, checks, files[], evidence[], notes[], confidence, summary, usage }`.
**Writes nothing** — creation happens client-side after the operator reviews
and confirms. `ANTHROPIC_API_KEY` stays server-side.

**LA LEZIONE DEL 14 SETTEMBRE 2026** («quando leggo dei file non riesce mai a
leggerli bene»): nei log di produzione delle 08:30 c'era la risposta —
`why=truncated len=3365 fenced=1 stop=end_turn`. Il modello aveva FINITO
(`end_turn`, non `max_tokens`), ma il JSON scritto a mano libera in un recinto
`` ```json `` non chiudeva le graffe (basta una virgoletta dentro una nota) e
`_modeljson.js` lo diagnosticava come troncato: all'operatore arrivava il
rimedio SBAGLIATO («documento troppo lungo, allega meno pagine») per un
guasto di forma. A monte, tre difetti di classe: (1) 120 campi chiesti come
testo libero a un modello sono una lotteria; (2) leggeva `claude-haiku-4-5`
con `max_tokens: 2000` — un contratto registrato all'AdE letto col modello
più piccolo, mentre l'inventario legge con Opus 5 «perché vale sul
deposito»; (3) la funzione NON era in `vercel.json`, quindi girava col
maxDuration di default della piattaforma. Ora:
- **Il JSON arriva già parsato** (`INGEST_TOOL`: lo strumento `proposta`,
  NON strict, con `INGEST_SCHEMA` come `input_schema` — ogni oggetto
  `additionalProperties:false` e `required` completo, «manca» = "" — e
  `tool_choice` forzato su di lui): l'API consegna l'input di un `tool_use`
  come OGGETTO, valido per costruzione, senza compilare nessuna grammatica
  (vedi le TRE lezioni del 21/09 qui sotto: la prima via era
  `output_config.format`). `parseModelJson` resta come rete per il solo caso
  in cui il modello risponda a parole; `stop_reason` è letto e detto — `refusal` → `ai_refused`,
  `max_tokens` → `ai_truncated` (solo lì si parla di taglio), 429 →
  `ai_rate_limited`, abort → 504 `ai_timeout`, ognuno con il rimedio in
  `detail`. Ripiego server-side sui rifiuti (`fallbacks:'default'` + beta
  `server-side-fallback-2026-07-01`): se la piattaforma lo rifiutasse con un
  400 si riprova UNA volta senza — la lettura non dipende da un beta.
- **`claude-opus-5`**, thinking adattivo, `max_tokens 16000`, prompt di
  sistema in cache (`cache_control`). `vercel.json`: `maxDuration 120`,
  `AI_MS` 100 s (il test pretende `AI_MS < maxDuration`).
- **Più file in una lettura**: ogni file è un blocco `document`/`image`
  preceduto da «DOCUMENTO n — nome»; il testo incollato è l'ultimo documento;
  un PDF oltre `MAX_PAGES` (60) viene tagliato con pdf-lib alle prime 60 e lo
  si dice nelle note. HEIC → 400 col rimedio («Più compatibile» su iPhone):
  Anthropic non lo legge e Chrome non lo converte.
- **Lo schema è il dizionario** (`js/contract-fields.js`): tenant e landlord
  con documento (tipo/numero/ente/data), permesso di soggiorno, società
  (kind/ragione sociale/P.IVA), `coTenants[]`, catasto a caselle (sezione/
  foglio/particella/sub/categoria/rendita), tabelle millesimali, piano/scala/
  interno/vani/accessori/ammobiliato/APE, contratto con durata, cadenza,
  cedolare (null = non detto), esigenza e di chi è, blocco studenti,
  conviventi, clausole, luogo/data di firma, ISTAT.
- **Ogni valore cita la fonte**: `evidence[] {path, quote, file, page}` —
  percorso validato contro lo schema, indice di documento fuori range → null.
  `files[]` porta il verdetto per file (tipo dalla tassonomia `CATS` dello
  Smistatore, pagine, `legible`, a quale parte appartiene un documento
  d'identità): «non riesce a leggerli» diventa una riga per documento.
- **Server-side**: `pruneProposal` (solo le sezioni con un'ANCORA — un
  booleano di default non fa nascere una card «Contratto»), `normalizeProposal`
  (forma del modello E forma piatta, idempotente), `deriveProposal` con
  `FIELDS.parseCadastral` (una copia sola) e derivazioni DICHIARATE,
  `validateProposal`. `usage` porta modello, token (cache compresa) e ms: il
  portal ne fa il costo stimato della lettura.
- **La cura del 413 (28/08) resta**: foto ridotte client-side; la SOMMA dei
  file inline sta sotto `INNESTO_INLINE_MAX` (3 MB) e il resto TRANSITA da
  `documents/<uid>/innesto-tmp/` (cancellato nel `finally`); `fileUrl` solo
  su `https://firebasestorage.googleapis.com`, mai un proxy. Nei log la
  forma, mai il contenuto.
- **Il tetto delle pagine è per GIRO** (`MAX_TOTAL_PAGES` 100 — il limite
  dell'API è a richiesta, non a file): due contratti da 60 pagine passano il
  taglio per file e l'API li rifiuta insieme con un 400, che usciva come
  «errore (400), riprova» — il rimedio sbagliato per un guasto deterministico.
  Si rifiuta PRIMA di spendere (`too_many_pages`, coi nomi e le pagine di
  ogni file, e la via d'uscita: la seconda lettura integra la prima). Il 400
  «prompt is too long» del modello (finestra di contesto, che non si può
  contare in locale) diventa `ai_too_long` col rimedio — meno pagine, due giri
  — mai un «riprova». Test: `node tests/innesto/run.mjs` (131 check).

**LA LEZIONE DEL 21 SETTEMBRE 2026 — lo schema con 99 unioni** («ho provato a
caricare un pre-agreement, mi dà errore 400… non penso sia così pesante»). Non
era il file: era la RICHIESTA. La prima versione dell'Innesto 3.0 scriveva ogni
campo facoltativo come `anyOf [tipo, null]`, 99 volte, e l'API compila lo
schema in una grammatica con limiti DOCUMENTATI per richiesta (structured
outputs → *Schema complexity limits*): **16 parametri con unione** (anyOf o
type array) e **24 parametri fuori da `required`**. Quindi OGNI lettura, con
qualunque documento, moriva con 400 «Schemas contains too many parameters with
union types» — dal deploy dell'Innesto 3.0 in poi — e il ramo lo vestiva da
guasto momentaneo («errore (400). Riprova; se ricapita, incolla il testo»), così
l'operatore incolpava il PDF. Era esattamente il punto «non verificato» della
PR: nessuna lettura vera contro l'API dal sandbox, e il finto Anthropic dei
test accetta qualunque schema. Tre correzioni:
- **«Manca» è `""`, mai `null`**: tutte le chiavi restano in `required`,
  zero unioni, zero facoltativi (su 120 campi né «nullable» né «facoltativo»
  stanno nei limiti). Il motore (`num/str/date/yesno`) trattava già `""`
  come null. Anche i numeri viaggiano come **stringhe di cifre** ("1100",
  "65.5"): `0` non può fare da sentinella (`filled(0)` è vero: «0 mq»
  sarebbe un dato) e un number nullable sarebbe un'unione. Booleani =
  `"si"/"no"/""`, enum con `""` in coda. Il test conta unioni e
  facoltativi con lo stesso criterio dell'API e pretende ZERO
  (`SCHEMA_LIMITS` pinnato a 16/24, contatore verificato per mutazione).
- **Gli enum non hanno maiuscole garantite** (dichiarato nei docs): si
  confrontano in minuscolo anche server-side (`kind`, `party`,
  `propertyType`).
- **Un 400 che non è «troppo materiale» è DETERMINISTICO**: riprovare non
  cambia nulla. Se il messaggio parla del documento (PDF cifrato/rotto) →
  422 `ai_bad_document` col rimedio all'operatore; altrimenti → 500
  `ai_bad_request` che dice «rifiutata la RICHIESTA del server, non il
  documento» col messaggio dell'API dentro. Entrambi in `DETERMINISTIC`
  dello Scrivano (il worker non li riprova). Nei log il messaggio d'errore
  dell'API a 600 caratteri: era clippato a 200, e la causa vera stava dopo.

**Integrazione coordinata del 21/09**: il rilascio Innesto `2d8ddb9`, derivato da `842abcbb`, viene integrato sopra `4955110` per conservare anche gli aggiornamenti WhatsApp, i legami lead/conversazione, il recupero dei listener e la revisione Oggi.
Il segmento Oggi revisionato resta identico; i dieci file esclusivi Innesto restano uguali alla consegna sorgente. La registrazione delle suite conserva entrambe le famiglie di test; la verifica del candidato integrato richiede una nuova CI.

**Revisione Innesto prima del rilascio integrato (21/09)**: solo un riferimento BOOM univoco collega automaticamente il deal; una ricerca per email propone candidati da confermare con immobile e periodo. Le risposte di letture precedenti non cambiano la proposta corrente; creazione e conversione attendono un'associazione verificata.
Gli Office mantengono i byte originali ZIP; email, testo e DOC si archiviano dentro un vero ZIP con l'originale, usando JSZip già presente e le regole Storage invariate.
Il parser XLSX conserva le colonne vuote; DOC rifiuta catene OLE cicliche o fuori file; MIME applica il charset ai byte una sola volta e CP1252 conserva euro/accenti anche sul runtime Node.
Prove sintetiche RED/GREEN in `tests/innesto/review.mjs` e `tests/doctext/run.mjs`; nessuna lettura cliente, chiamata AI o attestazione di produzione derivata dai test locali.
Il seguito della revisione mantiene leggibili DOC con byte finali estranei o stream non usati corrotti: vengono letti soltanto WordDocument e la table selezionata, con limiti invariati sulle catene utilizzate.
Il blur senza modifica non ricrea la pagina; Riprova mostra subito la ricerca in corso. Se manca la libreria ZIP e serve un contenitore, la conferma si ferma prima di ogni scrittura conservando materiale e proposta per riprovare.
Le regressioni sintetiche coprono entrambi i DOC irregolari, la table selezionata ciclica ancora respinta, il focus senza cambiamento e l’assenza di scritture se ZIP non è pronto.

**LA SECONDA LEZIONE DEL 21 SETTEMBRE 2026 — «continuo a rifiutarmi per
grandezza anche un semplice file»** (stesso giorno, ore dopo il fix dello
schema). Nei log di produzione NESSUNA chiamata a `/api/portal/ingest` dopo
il fix: il rifiuto avveniva nel PORTAL, prima di spedire. Tre cancelli
nostri, nessuno della piattaforma: `f.size > 8 MB` misurato sulla FOTO A
GRANDEZZA PIENA prima di ridurla (uno scatto di iPhone da 9-12 MB rifiutato,
mentre la stessa foto sarebbe partita come JPEG da 400 KB); 8 MB per file
anche sul server (Anthropic accetta 32 MB a richiesta, base64 compreso); e
un intake che accettava SOLO PDF e immagini. Ora: (1) **le foto non hanno un
cancello** — si riducono a 2000px prima di scegliere la via (HEIC compresa:
Safari nel canvas, Chrome via `heic2any` da jsDelivr caricato SOLO al
bisogno); gli altri file valgono fino ai 25 MB dello Storage di transito
(`validUpload`), il server ne legge fino a **20 MB per file e per giro**
(`MAX_FILE_BYTES`/`MAX_TOTAL_BYTES`), e un 413 dell'edge (body oltre 4,5 MB)
si ritenta UNA volta con tutto in transito invece di dire «8 MB»; ogni
rifiuto residuo porta il numero e il rimedio. (2) **Qualsiasi formato**:
`api/_doctext.js` (che apre gli ZIP con `api/_unzip.js`, il lettore del
Pendolare, cui aggiunge solo `zipEntryBytes` — mai un secondo lettore)
riduce a testo Word (.docx), Excel (.xlsx), OpenDocument, Word
97-2003 (.doc — il lettore OLE nato in `tests/_doc.mjs` vive qui), email
.eml (MIME multipart, quoted-printable, base64, RFC 2047), HTML, RTF,
testo/CSV/Markdown/JSON; il modello li riceve come blocco di testo
etichettato «DOCUMENTO n (Word, N caratteri)», tetto 150.000 caratteri per
documento dichiarato nelle note. **Il tipo lo dicono i BYTE** (`sniffType`:
firma → nome → dichiarazione): un browser manda `""` per .eml e .md e
`octet-stream` per quasi tutto, e un JPEG etichettato HEIC è un JPEG. I
file di testo puro NON transitano (storage.rules accetta immagini, PDF e
ZIP): vanno inline, e sono piccoli; gli Office SONO zip e transitano come
tali. (3) **Le creazioni in più**: lo schema ha `material` (che cos'è il
materiale nel suo insieme), `lead` (il messaggio di un cliente: nome,
recapiti, la richiesta con le SUE parole, zona, budget, lingua, chi scrive)
e `preagreement` (i termini di una proposta / pre-accordo: riferimento
BOOM-…, provvigione e quando è dovuta, quota energia, deposito alla firma,
dovuto alla firma, validità) — sempre a zero unioni e zero facoltativi.
Nel portal la card **Lead** crea un lead nello schema del sito (`source:
'innesto'`, mai un doppione per email o numero in qualunque forma) e da lì
Brain → notify-pending → Commerciale; la card **Proposta** cerca la
proposta nel console (per `ref` o per email del cliente): se c'è, **il
contratto NON nasce da qui** (nasce DA quella, `→ Contratto dalla
proposta` = `/api/preagreement/convert`, con identità, documenti, cadenza e
mandato che porta con sé — un secondo contratto sullo stesso deal è il
doppione più caro); se non c'è, con la spunta nasce una proposta via
`/api/preagreement/create` (la STESSA API della console) e il link finisce
negli appunti. `CATS` dello Smistatore ha `proposta` e `messaggio`.
Test: `node tests/doctext/run.mjs` (32), `tests/innesto/run.mjs` (172),
`tests/dataops/test.mjs` (192).

**LA TERZA LEZIONE DEL 21 SETTEMBRE 2026 — la grammatica troppo grande**
(la sera, al primo pre-agreement caricato dopo i due fix). Risposta
dell'API, riportata dall'operatore parola per parola: *«The compiled grammar
is too large, which would cause performance issues. Simplify your tool
schemas or reduce the number of strict tools»*. Oltre ai 16/24 documentati
c'è un tetto INTERNO sulla grammatica compilata — i docs lo dichiarano
(*Additional internal limits*) senza un numero — e uno schema da 148
parametri, pur a zero unioni e zero facoltativi, lo supera. Cioè: con
`output_config.format` l'Innesto 3.0 NON HA MAI letto un documento in
produzione, e dal sandbox non si poteva sapere (nessuna chiave API, e il
finto Anthropic dei test accetta qualunque schema). La via non è ridurre
lo schema a tentativi ciechi (ogni tentativo = un deploy): è **non compilare
niente**. Il JSON viaggia come chiamata di UNO strumento non strict
(`tools: [INGEST_TOOL]`, `tool_choice: {type:'tool', name:'proposta'}`):
l'input di un `tool_use` arriva dall'API già come oggetto — valido per
costruzione, come prima — e lo schema, con le sue descrizioni, guida il
modello campo per campo senza grammatica e senza tetto. L'aderenza allo
schema è del modello, non della grammatica: il motore leggeva già "",
`null`, numeri e booleani allo stesso modo, e `sanitizeFiles` accetta un
indice arrivato come "1". Scala dei 400 di forma, nessuno costa un token:
il beta del ripiego non riconosciuto → senza ripiego; la chiamata FORZATA
rifiutata (con il thinking la piattaforma può non ammetterla) → `tool_choice`
auto, e se il modello rispondesse a parole resta la rete di `parseModelJson`.
`strict: true` sullo strumento è vietato per costruzione: compilerebbe la
STESSA grammatica. Test (mutazioni: strumento strict, blocco `tool_use`
ignorato, ritorno a `output_config.format` — tutte prese): la forma della
richiesta, il ripiego ad auto, la rete sul testo, il 400 della grammatica
detto come richiesta del server, le giunzioni sulla sorgente; lo Scrivano
legge con lo stesso strumento.

**LA LEZIONE DEL 22 SETTEMBRE 2026 — «ho incollato i dati catastali da
collegare a una proprietà e non ha rilevato nulla», e i 23 secondi.** Nei
log di produzione: `ok via=tool files=0 pages=0 in=1917 out=2130 ms=23445
sections=-` — il testo era arrivato al modello e la risposta era senza
sezioni; e le letture di PDF da 2-3 pagine facevano 43-50 s con `out` fra
4.600 e 5.300 token: a ~100 token/s il tempo era quasi tutto OUTPUT, e ~900
di quei token erano le ~150 chiavi con `""` che il `required` completo
imponeva a ogni lettura — un residuo della grammatica del 21/09, che non
c'è più. Quattro mosse:
- **«Riguarda»** (portal, la riga sotto l'indicazione): immobile ·
  proprietario · inquilino, tendine dai pool VERI. Il server riceve nome e
  indirizzo (`context.target`, mai il solo id) come blocco RIGUARDA nel
  prompt — fatti dichiarati, non deduzioni — e il portal forza l'aggancio
  PER ID (`innestoApplyTarget` → `_innesto.links`): ciò che viene letto
  diventa la MODIFICA PROPOSTA sul record che c'è già (`diffRecord`, i
  buchi si riempiono con la spunta accesa), non una card «nuovo» da
  ricollegare a mano. Dal fascicolo immobile, **Innesto da documento** apre
  l'Innesto già puntato su quella casa (`innestoOpenFor`). Un record
  dichiarato ma non letto ha la sua card che lo dice, invece di sparire.
- **L'immobile è ancorato da QUALUNQUE identificativo catastale**
  (`ANCHORS.property`: foglio, particella, sub, categoria, rendita in
  entrambe le forme, il blob, la classe energetica — mai i default), e il
  prompt dice che i DATI NUDI (catasto senza indirizzo, un CF, un IBAN)
  sono una lettura valida.
- **Lo schema è SPARSO e lo sforzo è `medium`**: nessun `required` (una
  chiave omessa = manca; il motore leggeva già `""` e `undefined` allo
  stesso modo), prompt e strumento dicono di OMETTERE le vuote;
  `output_config: { effort: 'medium' }` (Opus 5, senza beta, con gli
  strumenti) taglia il thinking — «effort controls thinking volume, not
  visible response length»: la lunghezza la taglia lo schema sparso.
  Costante su ogni richiesta, perché cambiarlo invalida la cache. Il fast
  mode (`speed:'fast'`, fino a 2,5× i token/s) è in research preview su
  richiesta all'account manager: non attivabile da qui, è la leva successiva.
- **Il vuoto si spiega**: `filled=N` nel log e `stats.filled` nella
  risposta (i valori che il modello ha scritto nelle sezioni): «non ha
  riconosciuto nessun dato» ≠ «letti 3 valori ma nessuno ancora una
  sezione»; e `material` da solo non è più una proposta (prima usciva
  «Proposta pronta» a card zero).
Dal sandbox nulla è misurato (nessuna chiave): il guadagno VERO si legge
nei log (`ms=`, `out=`) alle prossime letture. Test: `tests/innesto/run.mjs`
(187 — RIGUARDA nel prompt e clippato, risposta sparsa → immobile ancorato,
vuoto onesto), `tests/innesto/render.mjs` (21 — la riga, il payload, la
modifica proposta sul record dichiarato), `tests/dataops/test.mjs` (195 — le
ancore, mai i default).

### LO SCRIVANO — la porta dal telefono (`api/scrivano/*` + `sc:` su Telegram, 14/09/2026)
STUDIO_SCRIVANO §4, **passo 4**: i passi 1–3 (il documento resta, la classe
dello Smistatore, la modifica proposta) sono nell'Innesto 3.0; questo è il
quarto — «mandi qualsiasi cosa al bot e ottieni ENTRAMBE le metà: archiviato
*e* proposto, con la card sul telefono». Il principio: **il tap è la firma
sulla spesa, la conferma nel portal è la firma sulla scrittura.** Qui non
nasce mai un contratto, una persona o un immobile: solo la PROPOSTA.
- **L'offerta** (`api/scrivano/_offer.js`): quando lo Smistatore archivia un
  documento di una classe che l'Innesto sa leggere (`SCRIVANO_KINDS`:
  contratto, documento d'identità, visura, APE — **esclusi di proposito**
  rli/cedolare/istat/cessione: sono EVENTI su un contratto che c'è già e
  oggi farebbero un doppione, finché l'Innesto sa solo CREARE), la risposta
  porta il bottone **🌱 Leggi e proponi nel portal** (`sc:<docId>`, ≤ 64
  byte per costruzione: un id troppo lungo NON riceve il bottone, mai una
  tastiera morta in silenzio). UNA copia per tutte le porte: il webhook
  Telegram mette il bottone nella propria risposta; per le porte che non
  sono Telegram (WhatsApp ed email — le porte di Codex, PR #234) la card
  parte da DENTRO `smistaDocument` (best-effort, `offer:false` per
  spegnerla): chi chiama `smistaDocument` eredita l'offerta senza saperlo.
  `dupResult` porta ora `catKey`, così anche un doppione può essere offerto.
- **Il docId dal bot è DETERMINISTICO** (`tg_<sha1(file_unique_id)>`): lo
  stesso file inoltrato due volte non archivia e non paga due volte («Già in
  archivio», col bottone).
- **Il tap NON legge dentro il webhook** (`api/telegram/_scrivano.js` →
  `enqueueRead`): una lettura con Opus 5 dura fino a 100 s, Telegram
  RITENTA l'update se il webhook non risponde in fretta (= due letture) e su
  Vercel il lavoro dopo la risposta si perde (la lezione del 13/09). Il tap
  scrive `scrivanoProposals/<docId>` `status:'queued'` (id = il documento →
  un secondo tap non raddoppia niente e lo dice), il messaggio perde la
  tastiera e dice «In coda».
- **Il worker** (`api/scrivano/worker.js`, cron `* * * * *`, maxDuration
  120, auth come i cron PFS, `?dry=1`): UNA lettura per run (`pickNext`: la
  più vecchia; una `reading` col lease scaduto da 4' torna eleggibile — il
  worker morto a metà non blocca la coda), scarica i BYTE archiviati dal
  nostro Storage (`readFiles` con `fileUrl`, host inchiodato), costruisce il
  contesto come il desktop (`knownFromStore`: users per ruolo + landlords +
  immobili «nome — indirizzo») e legge col **CUORE dell'Innesto**:
  `ingestRead` esportata da `api/portal/ingest.js` — stesso prompt, stesso
  schema strutturato, stessa sanificazione, stessi errori col rimedio; il
  handler HTTP è diventato una porta sottile sopra la stessa funzione. Poi
  la card **«Proposta pronta»** (parti, immobile, termini, errori da
  correggere, sicurezza, tempo) col bottone URL
  `https://www.boomrome.com/portal#innesto=<docId>` (sempre `www`, la
  lezione «Redirecting...»). Battito `teamHealth/scrivano` (🖋 in /team,
  approval `parziale` come la Segretaria: il tap è il click).
- **I guasti**: un errore DETERMINISTICO (`too_many_pages`, `ai_too_long`,
  HEIC, file troppo grande, rifiuto, taglio) chiude subito con la card del
  rimedio, senza riprovare a vuoto; un guasto momentaneo (500, timeout,
  429) si riprova UNA volta (`MAX_ATTEMPTS` 2), poi si dice.
- **Nel portal** (`#innesto=<docId>`): al boot e sul popstate
  `innestoSeedFromHash()` legge l'id PRIMA che `goTo` riscriva l'hash (il
  frammento sopravvive al giro di login), carica `scrivanoProposals/<id>`
  e lo semina con lo STESSO post-processing di una lettura dal portal
  (`innestoIngest`, estratta da `innestoAnalyze` in una copia: verdetti per
  file, citazioni, merge a più letture). Il documento è GIÀ in archivio:
  `readDocs` porta `{ archived }` e alla conferma `innestoArchiveDoc` non
  ricarica niente — aggiorna il doc esistente con `contractId/propertyId/
  userId` (`innestoBy`) e, per un documento d'identità, fa l'union negli
  `identityDocs` di contratto e profilo (`source:'scrivano'`).
- Rules: `scrivanoProposals` admin-only (lezione propertyLocks).
- Test: `node tests/scrivano/run.mjs` (51 check — il giro VERO sui handler
  reali con Firestore in memoria, Telegram e Anthropic finti: bot → id
  deterministico + bottone → tap = coda, mai una lettura nel webhook → worker
  → i byte archiviati ad Anthropic, contesto del desktop, output strutturato
  → card col link → secondo run idle → tap dopo la lettura = card senza
  rileggere; guasti deterministici vs momentanei; l'offerta ereditata dalle
  altre porte; giunzioni sulla sorgente). Le tre guardie — rimedio subito
  sui deterministici, offerta solo fuori da Telegram, secondo tap che non
  raddoppia — verificate per mutazione. Più `tests/innesto/run.mjs`: il
  documento già archiviato si LEGA senza put su Storage e senza doppioni.

## Lo Smistatore (document intake — api/documents/_smista.js)

"Mando qualsiasi cosa per il commercialista e si archivia da sola." One
shared pipeline (`smistaDocument`): Claude haiku classifies the file
(PDF/image) against the REAL property list, picks fiscal year + contract,
uploads to Storage and files it in `documents` with keyword-rich categories
that `taxpack-engine.docMatchesRequirement` already matches — so filing an
F24 IMU automatically ticks the pacchetto-commercialista checklist. Docs
with no confident property match get `needsFiling:true` (folder
99_DaSmistare), surfaced by the Contabile's morning report.

Intakes:
- **Telegram** (`api/telegram/webhook.js`): send ANY photo/PDF to the bot
  (caption = optional hint, e.g. "F24 IMU via Cavour"); replies with what
  it understood and where it filed it. Authorized chat only.
- **WhatsApp** (`api/homie/message.js`): server pronto per PDF/immagini di
  tenant/landlord risolti; il ponte Mac non produce ancora `mediaUrls`,
  quindi l'ingresso degli allegati non è operativo.
- **Email** (`api/documents/scan-inbox.js`, cron daily 03:50): forward an
  email with attachments to the BOOM mailbox — trusted senders (operator's
  addresses + `DOC_MAIL_FROM`) and verified landlord/tenant relations. Emails
  remembered in `docImports`; per-run AI budget; Telegram recap.

**Le porte (10/09/2026, Lotto 2 della Segretaria unica — `STUDIO_SEGRETARIA_UNICA_2026-09.md` §5).**
Un documento può arrivare da chi NON è l'operatore: l'allegato WhatsApp
(prima salvato in `attachments` e mai letto) e l'email di un proprietario
(prima esclusa, perché fidata solo per indirizzo). Codex, incaricato delle
porte, si è fermato in PR #234 con due obiezioni giuste: la pipeline creava
un id casuale (un retry di Homie = due documenti) e non aveva un vincolo sul
match (uno sconosciuto poteva finire sotto un immobile). `smistaDocument`
accetta ora `docId` — controllato PRIMA di chiamare il modello e di caricare
su Storage: un doppione non paga nulla, un 409 in gara è un doppione — e
`relation` `{kind: landlord|tenant|unknown|operator, label, propertyIds[],
contractIds[]}`: con landlord/tenant il modello vede SOLO gli immobili del
mittente e la scelta è rivalidata sul server (un immobile → default
dichiarato `relationDefault`; più immobili senza scelta valida →
`needsFiling` coi `relatedPropertyIds`); con `unknown` il documento **non
finisce MAI sotto un immobile**, `needsFiling` forzato e la scelta del
modello resta visibile come `suggestedPropertyId`. Senza `relation` è lo
Smistatore di sempre. Le porte WhatsApp ed email per relazione usano
questa interfaccia. Test: `node tests/documents/smista.mjs`
(gara 409, scarto della scelta fuori relazione e dedupe verificati per mutazione).

La porta WhatsApp chiama lo Smistatore solo per tenant/landlord verificati;
lead/PFS/client/sconosciuti conservano l'allegato nel messaggio, senza modello
né Storage né documento. Il server è pronto, ma il ponte Mac → `mediaUrls`
resta da realizzare: questa PR non rende operativo l'ingresso dei media.
Le relazioni condivise sono in `api/documents/_relation.js`; l'email conserva
la fiducia dell'operatore. Retry duplicati rimborsano il budget email e nomi
URL malformati usano il nome grezzo. `npm test -- whatsapp porte smista`
verifica i handler e, per mutazione, esclusioni, retry e conservazione del dato.
