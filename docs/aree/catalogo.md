# Catalogo — bot Telegram (wizard), feed e Pubblicista, foto, date di disponibilità, pre-blocco, pin

> Dettaglio e storia di quest'area, spostati da CLAUDE.md il 12/10/2026 senza
> riscrivere nulla: stesse sezioni, stesso ordine. Le novità dell'area si
> aggiungono QUI (3-8 righe nella sezione giusta: cos'era, cosa cambia, dove
> sta il test). La mappa del sistema è in `CLAUDE.md`, le priorità in `ORA.md`.

### POST `/api/wizard/publish`
Publish bridge for the Telegram listing wizard bot. Auth via `X-Wizard-Secret`
header (env `WIZARD_SECRET`, falls back to `HOMIE_SECRET` / `X-Homie-Secret`).
Accepts either the raw Firestore REST `{ fields: {...} }` payload the bot
already builds, or a plain JSON listing object. Optional `?id=<docId>` (or
`body.id`) makes it an upsert; otherwise Firestore auto-IDs. Writes to
`listings` under admin credentials — direct unauthenticated writes to
firestore.googleapis.com are denied by `firestore.rules` (admin-only).
Returns `{ ok, id, url }`.

### POST `/api/wizard/describe`
AI listing-copy for the Telegram wizard bot. Auth via `X-Wizard-Secret`
(same secret as `/api/wizard/publish`). Body is the structured listing
(`type, zone, sqm, floor, beds, bathrooms, furnished, price, features[], …`);
returns `{ ok, en, it }` — a polished bilingual description from Claude
(`claude-haiku-4-5-20251001`). The `ANTHROPIC_API_KEY` stays server-side; the
bot can't call Claude directly. Bot falls back to a template if this is
unavailable — and that template now humanises the feature codes (it used to
join the raw DB keys, publishing "washing_machine, double_glazing" on the
listing page and inside `/llms-listings.txt`, i.e. straight to crawlers).

**Sweep** — `GET ?mode=sweep[&limit=N]` (cron 03:35 UTC, auth like the other
wizard crons: Bearer `CRON_SECRET`, `X-Homie-Secret`, or an admin ID token).
A listing page with no text is invisible to search and uncitable by AI answer
engines, which reward specific facts over filler. On 2026-07-28 the live
catalog had **10 empty descriptions and 10 carrying the bot's template**; the
sweep rewrites them nightly (6/run, time-boxed, ordered available-and-mute
first). **It never rewrites a human's words**: length is the wrong test — the
real catalog's human copy runs 66–203 chars while the template reaches 203, so
a "too short" rule would delete *"perfect for Luiss students"* and keep
*"Features include ac, balcony"*. Only EMPTY text and the template's own
signature qualify (`isBoilerplate` / `copyGap` / `copyOrder`, exported +
tested), and anything overwritten is preserved in `descriptionOriginal`.

### GET/POST `/api/wizard/health` (cron */10 min)
Watchdog del bot Telegram sul Mac mini. **LA LEZIONE DEL 7 AGOSTO 2026**: per
12 giorni launchd ha lanciato `boom_listing_wizard.py` DIRETTAMENTE invece di
`wizard_heartbeat.py` — il `sed` di installazione documentato in
`bot/README.md` non era mai stato eseguito. Risultato: auto-aggiornamento mai
partito, codice sul Mac fermo a due settimane prima, e **questo guardiano ha
taciuto tutto il tempo**, perché "documento heartbeat assente" era codificato
come stato neutro ("wrapper non ancora deployato"). Il guasto peggiore e una
macchina appena installata producevano lo stesso silenzio verde.
Tre correzioni, tutte nello spirito di `pfs/_health.js` (dove lo stesso
giorno abbiamo corretto il difetto OPPOSTO — una fonte bloccata che gridava
96 volte). Regola unica: **si parla quando c'è una decisione da prendere, una
volta sola per condizione**.
- **Il battito non dipende più dal wrapper.** `_fallback_heartbeat()` in
  `boom_listing_wizard.py` lo scrive comunque, e porta **`launcher`**
  (`sys.argv[0]`, DERIVATO): se il server legge `boom_listing_wizard.py` sa
  che il wrapper è stato saltato → **un** messaggio con il comando per
  rimediare, poi silenzio; lo stato si azzera da solo quando è sistemato.
- **`build` invece di `BOT_VERSION`.** La costante scritta a mano è rimasta a
  `'3.0'` mentre il file cambiava cinque volte: come segnale di obsolescenza
  era inservibile proprio quando serviva. `source_build()` è lo sha1 dei byte
  veri sul disco — cambia da solo, nessuno può dimenticarsene.
- **Il silenzio ha una scadenza.** Documento assente → si annota
  `missingSince` e si tace per 24h (copre l'installazione nuova), poi **un**
  messaggio. E lo stato si registra SEMPRE, non più dentro `if (sent)`: un
  guardiano che ricorda solo quando Telegram risponde tace proprio quando il
  canale è il problema.
`wizardVerdict()` è pura ed esportata (decide se consumare l'attenzione
dell'operatore, quindi si testa). Auth come i cron PFS.
Test: `node tests/wizard/health.mjs`.

**Il difetto gemello nel wrapper**: `_self_update()` girava SOLO all'avvio,
poi `run_polling()` blocca per sempre e `KeepAlive` riavvia solo sui crash —
cioè **un bot sano non si aggiornava mai** e la freschezza del codice
dipendeva dai guasti. Ora il thread del battito ricontrolla ogni ora e, se è
arrivato codice nuovo, esce con `os._exit(0)`: launchd lo rialza dopo 15s col
codice aggiornato. Ogni ramo di `_self_update` LOGGA il proprio esito
(`applied/same/short-download/compile-failed/net-failed`) — prima lo skip su
download corto non lasciava traccia, quindi "non ha aggiornato" e "non ha
potuto" erano indistinguibili.

**E `salute.html` era cieco**: leggeva `h.consecutiveFailures` mentre ogni
scrittore scrive `consecutiveErrors` (`pfs/_health.js`, `employees/_lib.js`),
quindi il ramo "guasto" non è mai scattato — `scan-market` falliva da 1145
giri e la pagina *Salute* lo mostrava verde. Un carattere, la pagina che
doveva dire la verità.

### POST `/api/wizard/interpret`
Natural-language listing edits for the wizard bot. Auth `X-Wizard-Secret`.
Body `{ text }` (operator message in Italian, e.g. "metti il deposito a due
mesi per Pigneto"). Reads the real catalog, asks Claude haiku for an update
plan, sanitizes against a field whitelist (an hallucinated field/id can never
pass), derives money fields (`depositMonths` → EUR `deposit`, price change →
deposit recompute, twins size/bedrooms) and returns
`{ action:'update', id, name, updates, summary[] }` or
`{ action:'none', note }`. Never writes — the bot shows the summary with a
✅ Conferma button and applies on tap.

**Il bot chiama questo endpoint per ULTIMO, non per primo** (wizard v3.1).
Ogni messaggio libero pagava un `claude-sonnet-5` con TUTTO il catalogo nel
prompt (~1.500 token di input a messaggio) — compresi "affittato Cavour" e
"quanto costa Pigneto?", che una regex risolve per zero; il parser locale
esisteva ma era solo il paracadute per quando l'endpoint era giù. Ora il
router in `_nl_process` è: **domanda** → risposta letta dal catalogo (prezzo,
deposito, interessati, video, foto, giorni sul mercato, indirizzo, stato,
"quali sono liberi") → **modifica piana** → regex (anche arredamento, mq,
camere, bagni, piano, date IT→ISO, commissione, più modifiche in una frase) →
**tutto il resto** sale qui, dove il modello serve davvero (refusi nei nomi,
case nuove dettate a voce, anafore). Nessuna capacità persa; su una giornata
tipo **85% dei messaggi costa zero**, e `/status` mostra lo split a runtime.
Due guardie, entrambe trovate dai test prima della produzione: una DOMANDA
non diventa mai una scrittura ("Levico è affittato?" contiene "affittato" e
avrebbe marcato l'immobile affittato per una domanda) e una CASA NUOVA non
diventa mai una modifica ("trilocale a Prati, 80mq" agganciava un
*Trilocale* esistente e gli riscriveva i metri).
**La terza guardia è arrivata DALLA produzione (28/08/2026)**: "Tiburtina
libera dal 1 settembre 2026" è tornata dal modello come CASA NUOVA con
€900, 35mq e un indirizzo MAI pronunciati — e una card 🆕 confermata di
fretta l'ha pubblicata sul sito vero (aggravata dal difetto gemello:
`PENDING_NL` era UNO slot per chat, e incollando più righe il ✅ della card
vecchia applicava il piano del messaggio successivo — ora ogni card porta
il suo token, `_pending_put`/`_pending_pop`, e un piano sostituito dice
"rimanda la frase" invece di applicare quello di un'altra card). La guardia:
`_create_invents` — un annuncio non nasce con numeri che l'operatore non ha
detto; prezzo e metri dei fields devono comparire nel testo, o la create si
rifiuta e si chiede.
Test: `python3 tests/wizard/local_brain.py`.

### GET/POST `/api/wizard/video-radar` (cron Monday 07:00 UTC)
Weekly LISTING QUALITY radar ("pagella"). Grades every AVAILABLE listing
0-10 (video 3, ≥8 photos 2, rich description 2, availableDate 1,
depositMonths 1, concordato known 1 — `gradeListing()` exported) and
messages the admin chat with each incomplete listing's score, gaps and the
bot command for the biggest one. Silent when the catalog is all 10/10.
Auth like `/api/wizard/health`.

### POST `/api/wizard/transcribe`
Voice-note transcription for the wizard bot (operator dictates a listing).
Auth `X-Wizard-Secret`. Body `{ base64, mimeType? }` (Telegram ogg/opus,
≤4MB) → `{ ok, text }` via OpenAI Whisper when `OPENAI_API_KEY` is set;
501 `transcribe_unconfigured` otherwise (the bot tells the operator voice
isn't set up — never a silent failure).

### POST `/api/wizard/upload`
Photo-upload bridge for the Telegram wizard bot. Auth via `X-Wizard-Secret`
(same secret as `/api/wizard/publish`). Body `{ base64, path?, contentType? }`
(base64 may be a data: URI). Uploads to Firebase Storage under admin
credentials (forced under the `listings/` prefix) and returns
`{ ok, url, path }`. Lets the bot store photos without holding Firebase admin
creds; the bot falls back to a direct Storage upload if this is unavailable.

### GET `/api/feed/immobiliare.xml?k=<feedKey>[&gz=1][&core=1]`
Il catalogo BOOM nel formato feed di Immobiliare.it (specifiche raccolte in
`docs/feed-immobiliare.md` — la doc del portale tecnico è pubblica ma il
sandbox non raggiunge il dominio). Modello PULL: l'endpoint emette sempre il
feed fresco (`?gz=1` → `feed.xml.gz` pronto per l'FTP batch); a consegnarlo
è il Mac di Homie (Immobiliare vuole gli IP pubblici dei chiamanti e Vercel
non ne ha di fissi). Regole implementate: identità unique-id+email agenzia,
`date-updated` ISO (se la loro data è ≥ non aggiornano), transaction R/EUR,
ISTAT Roma 058091, e la precisione dei pin NON si spaccia (`map="exact"` e
indirizzo visibile solo su via+civico verificati da boom-geo). I nodi in
attesa dell'XSD completo (superficie, locali, descrizioni) stanno nel blocco
EXTENDED, escludibile con `?core=1`. `feedKey` derivato da HOMIE_SECRET.
Env: `FEED_AGENCY_EMAIL` (username agenzia sul portale). Attivazione: team
Support tecnico Immobiliare (FTP batch o credenziali REST + X-IMMO-SOURCE).
Test: `node tests/feed/run.mjs`.

### Il Pubblicista (`api/publisher/*` + `bot/PUBBLICISTA.md`)
Il binario di pubblicazione verso i portali INDIPENDENTE dalle loro
risposte: il feed Immobiliare è pronto ma l'attivazione dipende da un
Support che non risponde, e Idealista apre il real-time solo ai software
partner (Miogest/Gestim — nessuna spec pubblica; verificato 2026-08). Il
server pensa, il Mac di Homie esegue attraverso QUALUNQUE porta sia aperta:
- `api/publisher/_state.js` — motore puro esportato+testato. UNA funzione
  (`coreContent`) alimenta sia `publishHash` sia il payload, quindi hash e
  contenuto non possono divergere; i campi volatili non toccano l'hash e
  l'ordine foto sì (la prima è la copertina). `worklist(listings, pubs)`:
  **remove → create → update** (una casa affittata online genera lead da
  rifiutare: si toglie PRIMA di aggiungere), fallimenti ripetuti
  (3× sullo stesso hash) PARCHEGGIATI invece che ritentati a vuoto — e
  l'edit dell'operatore (hash nuovo) li sblocca da solo. `payloadFor`:
  feature umanizzate IT/EN (mai `washing_machine` grezzo — la lezione del
  template wizard), `showExactAddress` da boom-geo (il toggle del pannello
  segue la precisione VERA del pin), hints per portale (immobiliare:
  typologyId+ISTAT+`xmlNodePath` del nodo REST; idealista: vocabolario),
  MAI un campo inventato. `publishable` importata dal feed: vetrina, feed
  e Pubblicista non possono divergere.
- `GET/POST /api/publisher/queue` — auth come i cron PFS. GET `?portal=`
  → worklist con payload completi (kill switch `settings/publisher`,
  globale e per portale). POST rapporto → stato su
  `portalPubs/<portale>_<listingId>` (admin-only in firestore.rules — la
  lezione propertyLocks), l'hash registrato è quello ECHOED dall'azione
  (se l'operatore edita mentre il Mac lavora, il diff se ne accorge al
  giro dopo), heartbeat `pfsRadarHealth/publisher-<portale>` con la regola
  degli occhi di Homie: giro a vuoto = salute, `blocked:true` (login/
  captcha) = guasto → allerta Telegram esistente dopo 3 run. Recap
  Telegram solo quando qualcosa è cambiato davvero.
- **Le due porte** (`bot/PUBBLICISTA.md`, il mandato completo): Porta A =
  feed/REST quando il Support attiva (batch `?gz=1` via FTP, oppure PUT
  del nodo singolo `?id=<listingId>` sul feed — aggiunto apposta); Porta
  B = OGGI, Playwright sul Mac contro i pannelli agenzia PROPRI
  (Immobiliare/Getrix, Idealista pro) con profilo persistente: è
  l'automazione del proprio back office, la stessa cosa che fa un
  gestionale. Regole d'oro: mai inventare, ritmo umano, captcha/2FA =
  STOP e rapporto `blocked` (mai aggirare), ogni esito riferito.
  Cambiare porta = cambiare SOLO il trasporto: coda, stato e diff restano.
- **Il braccio sul Mac** (`bot/boom_publisher.py` + `com.boom.publisher.plist`):
  `--login` (una volta, profilo persistente), `--dry`, `--check` (launchd
  30′ → notifica macOS quando c'è lavoro; mai un browser senza operatore),
  `--assist` (la sessione di OGGI: campi pronti dal payload, l'operatore
  compila e conferma con l'URL pubblico → rapporto automatico),
  `--auto` riservato ai selettori mappati (oggi ricade su assist).
  Logica pura testata: `python3 tests/publisher/runner.py`.
  PREREQUISITO: rules con `portalPubs` deployate (FIREBASE_TOKEN o deploy
  manuale) — senza, il POST del rapporto non registra lo stato.
- Test: `node tests/publisher/run.mjs` (33 check — hash, worklist,
  parcheggio, payload onesto, verdetto, e il loop VERO GET→POST→GET su
  Firestore in memoria con lo stub PATCH che rifiuta `exists=false` sui
  doc esistenti, come il Firestore vero).

### `/api/photos/enhance` — the unified photo brain
One pipeline, three doors:
1. **Console** (`photo-lab.html`, renders the catalog unauthenticated; auth on
   action): `POST { listingId, mode:'audit'|'apply' }` with a Firebase ID
   token (role admin/owner/landlord).
2. **Telegram wizard bot** (`bot/boom_listing_wizard.py` → `photos_enhance()`):
   same POST with `X-Wizard-Secret` (or `X-Homie-Secret`) — the SAME shared
   secret as every other wizard→server call; no Firebase login needed. The
   bot auto-applies after publish (≥2 photos), plus `/fotolab <ID>` and the
   NL "migliora le foto" intent.
3. **Nightly sweep cron** (03:20 UTC, `GET ?mode=sweep&limit=N` with Bearer
   CRON_SECRET): finds listings never curated OR whose curation was clobbered
   (a wizard re-publish replaces the whole `images` array) and re-applies, up
   to 3 per run, time-boxed — nothing stays raw forever. **Order = impact**
   (`sweepOrder()`, exported + tested): richest galleries first, ties keep the
   document order. `fsList` hands candidates over in document-ID order — pure
   alphabet — and on a one-photo listing the brain has nothing to decide (no
   cover to pick, no gallery to reorder, no duplicate to drop). With 3 slots a
   night that once left a 25-photo listing raw for three nights while three
   single-photo ones took the slots.

`audit` = Claude Vision (haiku) classifies every photo (photo/render/
floorplan/document, room, needed rotation, quality, coverScore, watermark) →
plan: best real photo as cover, gallery reordered living→kitchen→bedrooms→
bath→exterior with floorplans last, exact duplicates dropped. Zero writes.
Audit accepts an optional `urls[]` override (capped, http(s) only): the Media
Studio's "✨ Ordina con l'AI" asks for a plan over the photos it actually has
on screen — which differ from `sourceUrls()` once a listing was already
enhanced. The studio applies the plan to its thumbs (duplicates moved to the
END, never deleted); the operator refines and publishes.
`apply` = sharp enhancement (EXIF+AI rotation, contrast stretch, per-photo
preset; floorplans never saturated), uploads to `listings/enhanced/<id>/`,
patches `image`/`images`/`photosEnhancedAt`/`photosEnhancedBy`.
**Re-publish healing**: the plan source is always `imagesOriginal` ∪ {current
photos that are neither enhanced outputs nor already tracked} — new raw
photos join additively, our own outputs never re-enter, and `imagesOriginal`
is updated to that union. Reversible; originals never deleted. Heuristic
fallback when ANTHROPIC_API_KEY is absent. sharp is a real dependency
(api/package.json); function has maxDuration 60 + 1769MB in vercel.json.

## Le date di disponibilità (`js/dispo-engine.js` + `/api/listings-availability`)

**Il difetto era in produzione dal primo giorno.** `listings.availableDate` è
sempre stato testo LIBERO, il portal ne suggeriva i formati nel placeholder
(*"Es: Feb 1, Sep 2026, Immediate"*) e la vetrina faceva
`/^\d{4}-\d{2}-\d{2}/.test(raw) ? raw.slice(0,10) : day(0)` — cioè
**trasformava in OGGI tutto ciò che non era ISO, compresi i tre esempi del
placeholder**, e la card stampava *"Available now"* su case libere a
settembre. Lo stesso fallback stava in `api/listing.js` (JSON-LD +
baseline no-JS) e in `api/llms-listings.js`, dove è peggio: un motore di
risposta cita il fatto e lo ripete a chi il sito non l'ha ancora visto. E il
campo che quel codice legge per PRIMO, `availableFrom`, non lo scriveva
nessuna delle tre porte (portal · `/modifica … disponibile` · parser NL).

`js/dispo-engine.js` (UMD → `window.BOOM_DISPO`, importato anche dai file ESM
in `api/**` come boom-geo) è l'unica lettura, condivisa da vetrina, scheda,
JSON-LD, llms, feed Immobiliare, Pubblicista, portal e bot. **Le due regole
dure**, entrambe pinnate nei test:
1. **Ambiguo non diventa MAI "libera ora".** Tre stati (`now`/`date`/
   `unknown`) invece di una data finta; `unknown` in pagina è *"Ask us"*.
   Dire "non lo so" costa una domanda, dire "libera adesso" costa il cliente.
2. **Quando è impreciso si arrotonda TARDI.** *"fine agosto"* → 31, mai il 1°.
   Gli errori non sono simmetrici: sbagliare in avanti fa aspettare, sbagliare
   all'indietro mette in vetrina una casa ancora occupata. Un mese NUDO vale
   solo con preposizione (*"libero da settembre"*) o se è tutta la stringa
   (il campo del portal) — altrimenti *"may be free"* diventerebbe maggio.

**Il messaggio unico** (`parseBatch`): *"Levico dal 1 settembre, Cavour
subito, Pigneto 15/10"* aggiorna tre case in un colpo, IT+EN, costo zero
(nessun modello). Una data sola per più case si **trasmette** solo quando nel
messaggio non c'è una seconda lettura possibile; un messaggio MISTO (due date
esplicite + una casa nuda) **non spalma niente** — la casa senza data resta
indietro e lo dice. Una DOMANDA (*"quali sono liberi a settembre?"*) non
diventa mai una scrittura di massa.

**`/api/listings-availability`** è la porta unica (Bearer CRON_SECRET ·
X-Homie-Secret · X-Wizard-Secret · Bearer admin). `GET` → il quadro completo
coi buchi in testa; `POST {text}` → il PIANO (non scrive senza `apply:true`);
`POST {updates[]}` → scrive. Ogni voce ripassa comunque dal motore: nessun
client può depositare una stringa che le pagine non sanno rileggere. La frase
originale resta in `availableRaw` (disciplina `descriptionOriginal`).

**Il cervello sta sul server, non nel bot.** Il wizard Telegram gira sul Mac
mini e può essere giù (lo è stato): se il multi-annuncio vivesse nel Python,
la funzione sarebbe nata già spenta. Così è viva subito dal portal (modale
**📅 Disponibilità** sulla pagina Listings: stesso box messaggio, stesso
piano→conferma, più la tabella con date editabili) e il bot la eredita — nel
router NL entra **prima** di `/api/wizard/interpret`, quindi il multi-annuncio
non paga il modello; più `/disponibilita` per il quadro.

**La data che si scrive da sola**: alla firma completa `magic-sign/submit`
scriveva solo `status:'rented'` sul listing, buttando via il dato più
affidabile del sistema — il contratto sa `endDate`. Ora stampa
`availableFrom = endDate + 1g`, così una casa affittata porta con sé il giorno
in cui si rilibera (la corsia waitlist della vetrina esisteva già e restava
vuota). Il feed Immobiliare emette `<available-from>` **solo su data certa**
(nodo nel blocco EXTENDED, da confermare sull'XSD) e `availableFrom` entra in
`coreContent` del Pubblicista → l'hash cambia → l'update si mette in coda da
sé per ogni portale.

## La corsia del pre-blocco (`marketLane` in `js/dispo-engine.js`)

**Il grosso del catalogo non si affitta oggi: si PRENOTA.** Sulle 26 case
vere: 4 «si entra ora», **16 occupate con una data di rilascio nota**, 7
affittate e basta. Eppure ogni superficie buttava via quella data — la
vetrina diceva *«Waitlist open»*, la scheda *«the moment it frees up»*,
llms *«currently occupied»*, e il JSON-LD dichiarava `InStock` una casa
con dentro un inquilino. Il dato che vende (IL GIORNO in cui entri) non
arrivava mai a chi programma un trasferimento con mesi di anticipo —
studenti, expat, executive: il cuore del mercato BOOM.

`marketLane()` deriva **tre corsie** da status + data, così l'operatore
non deve tenere allineati due campi e le tre scritture che significano la
stessa cosa convergono: `now` (entri adesso · *Apply*) · **`ahead`**
(occupata ma con una data · *«Free from 1 Sep 2027» · Reserve*) ·
`closed` (occupata e non sappiamo fino a quando · fuori mercato).
`laneCopy()` tiene le parole in UN posto (badge, scheda, CTA, JSON-LD,
llms, email Segugio non possono contraddirsi — la lezione di `pinCopy`).

**Le quattro regole dure** (testate, verificate per mutazione):
- **A.** `waitlist` è SEMPRE prenotabile: è la dichiarazione esplicita
  dell'operatore. Senza data non diventa `closed`, diventa una promessa
  più debole («Reserve ahead»).
- **B.** `available` + data futura è `ahead`, non «libera ora». Sana da
  sola il disallineamento vero trovato in produzione (il Bilocale Prati
  era `available` + «1 Sept 2027» mentre l'operatore lo considerava
  bloccato): **nessuno deve correggere niente a mano**.
- **C.** `rented` entra in `ahead` SOLO con `availableFrom` — la data che
  `magic-sign` scrive dal CONTRATTO alla firma — MAI con la sola
  `availableDate`, testo libero che su una casa affittata è quasi sempre
  il residuo di quando era libera (6 rented su 7 la portano già passata).
  Prenotare su un residuo è la bugia peggiore: il cliente la scopre col
  trasloco pronto.
- **D.** Una data illeggibile non promette niente — né «libera ora» né una
  prenotazione (regola 1 del file, ora applicata anche alla vetrina, dove
  il parser python della build scriveva «Available now»).

**L'anno che nessuno ha scritto** (`yearGuessed`): 10 case su 26 hanno la
data senza anno («1 Aug», «Mar 1»). Il motore sceglie sempre il FUTURO
(regola 2: far aspettare costa meno che mostrare una casa occupata) — ma
ora lo **dichiara**. Se l'operatore intendeva l'anno scorso, quella casa
è libera adesso e il sito la mostra bloccata fino al 2027: il pannello
📅 Disponibilità le elenca in testa con un tap **«✓ Sì, è <data>»** che
trasforma l'inferenza in ISO scritto. `audit()` le espone (`guessed`,
`lanes`), e `/api/listings-availability` GET le mette in cima alla lista
di lavoro, per il portal e per il bot.

Superfici allineate: vetrina (idrante + innesto + builder python) ·
scheda (CTA *Reserve from…* e lead `intent:'reserve'` invece di
`waitlist` — l'operatore distingue «la vuole dal 1 settembre» da «gli
piacerebbe, ma è occupata») · `api/listing.js` (JSON-LD **PreOrder** +
`availabilityStarts`, noscript con la data) · `api/llms-listings.js` ·
`api/search/matcher.js` (**il Segugio ora guarda la data di ingresso
richiesta**: prima chi salvava «mi serve da settembre» riceveva le case
libere adesso e NON quelle che si liberano a settembre) ·
`api/feed/immobiliare.js` (`publishable` = corsia, non etichetta).
Test: `node tests/prenota/run.mjs` (45 check).

Test: `node tests/dispo/run.mjs` (112 check — le stringhe vere del catalogo,
le trappole della lingua, la trasmissione e la sua guardia, le giunzioni
asserite sulla sorgente, e il handler VERO su un Firestore in memoria: senza
credenziali 401, `{text}` senza apply non scrive, una data illeggibile viene
RIFIUTATA alla porta invece di essere scritta a caso).

## Precisione dei pin + perché non c'è il 3D di Google (`js/boom-geo.js`)

**Google Photorealistic 3D Tiles non sono erogabili a questo account.** Dall'8
luglio 2025 i progetti Google Cloud con fatturazione **EEA** sono esclusi da
tile 3D e satellitari: `tile.googleapis.com` risponde `403 PERMISSION_DENIED`
("not available for your account and region"), con **e senza** Referer di
boomrome.com — verificato 2026-07-29. Egidi è italiana: non è una chiave da
sistemare. Il chip "◆ Photoreal 3D" compariva su ogni scheda con pin (la
chiave *esisteva*), scaricava ~3MB di Cesium e falliva **sempre**; lo Skyline
li scaricava a ogni apertura della mappa, anche a chi non toccava nulla.
Rimossi entrambi, insieme a `/api/maps-key`. `js/boom-photoreal.js` e
`tests/photoreal/` restano nel repo non referenziati: se la restrizione cade,
si riarma da lì — **ri-provare quel 403 prima di riesumarlo**.

**La precisione del pin è dedotta, non dichiarata.** Le pagine leggevano
`listing.geoZone`, campo che **nessun annuncio porta** (0 su 19), quindi
`exact = hasCo && !geoZone` era sempre vero: ogni pin si presentava come
indirizzo esatto, il prefisso `≈` non compariva mai e la legenda "≈ zone area"
dello Skyline era decorativa. Tre case del centro dichiaravano lo stesso
centroide (`41.8986, 12.4735` = il centroide `DZONES` di "centro storico") e la
scheda offriva "Street View · the exact entrance" su una via a caso vicino a
Navona. La provenienza però c'era già, in `listing.geo` (`src`, `q`), scritta
dal bake dei geocodici. `pinPrecision()` la legge:

| livello | condizione | cosa è concesso in pagina |
|---|---|---|
| `exact` | `q` con via **e** civico | chip coordinate, "Street View · the exact entrance", **sagoma d'oro** |
| `street` | `q` con via senza civico | "Street View · this street", nessun chip coordinate |
| `zone` | `src:'zone'`, oppure `q` del solo quartiere (`"Prati, Roma"`), oppure coordinate ≤4 decimali senza provenienza | solo "posizione approssimativa in <zona>" + Directions |
| `none` | nessuna lat/lng | nessun chip |

Un CAP a 5 cifre non è un civico. La **sagoma d'oro** si accende solo su
`exact`: su una via senza numero il palazzo sotto il pin è arbitrario, e
illuminarlo come "il tuo" è la stessa bugia in piccolo. `pinCopy()` tiene le
parole in un posto solo così Skyline e scheda non possono contraddirsi;
`pinAudit()` dà il quadro (oggi: 5 exact · 4 street · 7 zone · 3 none).

**Zoom dello Skyline**: con un solo risultato il bounds ha area zero e
`fitBounds` andava diretto a `maxZoom:15.5` — a quel punto, con `pitch:55` e le
etichette POI nascoste di proposito, si vedono i tetti e **tutte le ancore
finiscono fuori quadro**: la mappa si spegne proprio mentre guardi una casa.
Con ≤2 risultati il bounds si allarga fino all'ancora più vicina (Termini,
LUISS, …) e i fili d'oro si accendono da soli dopo 700ms — su una casa sola non
c'è nulla su cui passare col mouse, e su telefono l'hover non esiste.

**I tempi sono VERI** (da 2026-08): il Pendolare (`api/ops/gtfs-tempi.js`,
cron) scarica il GTFS statico di Roma Mobilità in produzione (il sandbox non
lo raggiunge — il server pensa), costruisce il grafo a frequenze (attesa =
metà headway 07–21, corse medie fra fermate consecutive, cambi a piedi),
Dijkstra all'indietro dalle 9 mete e stampa una griglia ~300 m nel doc
`publicGeo/tempi-roma` (lettura pubblica nelle rules). `js/tempi-engine.js`
(`BOOM_TEMPI`, UMD — importato anche dal builder come boom-geo) è l'unica
lettura: scheda (`#vicini`) e `/skyline` mostrano i minuti della griglia e,
dove non copre, DEGRADANO alla vecchia stima dichiarata (`≈ km×4.2+10` /
km secchi) — mai un numero inventato. Heartbeat `teamHealth/pendolare`.
Test: `node tests/tempi/run.mjs` (fixture GTFS in zip vero via api/_zip.js).
