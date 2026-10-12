# Infrastruttura — stack, struttura, deploy, variabili d'ambiente, CI, guasti di classe, convenzioni

> Dettaglio e storia di quest'area, spostati da CLAUDE.md il 12/10/2026 senza
> riscrivere nulla: stesse sezioni, stesso ordine. Le novità dell'area si
> aggiungono QUI (3-8 righe nella sezione giusta: cos'era, cosa cambia, dove
> sta il test). La mappa del sistema è in `CLAUDE.md`, le priorità in `ORA.md`.

# BOOM Roma — Project Guide

Premium rental management platform for Rome's apartment market. Serves tenants, landlords, and admins with listings, contracts, document management, and Apple Wallet passes.

**Live site**: boomrome.com

## Tech Stack

- **Frontend**: Vanilla HTML/CSS/JS (no framework, no build step)
- **Database & Auth**: Firebase (Firestore + Firebase Auth)
- **Backend**: Vercel Serverless Functions (Node.js, CommonJS)
- **Hosting**: Vercel — static HTML served directly, no build pipeline
- **Apple Wallet**: passkit-generator v3.5.7
- **Email**: Nodemailer (Gmail) for backend, EmailJS for client-side
- **PDF/Charts**: jsPDF, html2canvas, PDF-lib, Chart.js (loaded via CDN)
- **AI**: Anthropic Claude API for document parsing (proxied through `/api/parse-docs.js`)

## File Structure

```
/                         All HTML pages served from root (56 files)
/api/                     Vercel serverless functions
  generate-pass.js        POST — creates Apple Wallet .pkpass files
  reminder-cron.js        Cron (*/15 * * * *) — Firebase sync + email reminders
  parse-docs.js           POST — Anthropic API proxy for document parsing
  /pfs/                   PFS radar: scan-inbox (email alerts via IMAP),
                          scan-market (portal scraping), sync-searches
                          (auto-search generation), _ingest (shared pipeline),
                          _health (heartbeats + Telegram alerts)
/js/
  firebase-config.js      Firebase SDK init (project: boom-property-dashboards)
  boom-portal.js          Shared client lib for the 3 portals (auth guard,
                          realtime listener, toast, loader, confirm, SW reg)
  taxpack-engine.js       Pure Italian rental-tax engine (checklist, totals,
                          cedolare calc, zip manifest). window.BOOM_TAXPACK
  dataops-engine.js       Pure engine behind Bonifica + Innesto: test-data
                          classifier (with the `protected` lock), orphan
                          detection, CF/IBAN validation, entity matching,
                          proposal normalization. window.BOOM_DATAOPS
  fiscal-engine.js        Pure obligations engine: per-property/contract +
                          company (Egidi) fiscal deadlines + amounts.
                          window.BOOM_FISCAL
  boom-geo.js             How true is this pin — exact (street+number) /
                          street / zone / none, read from listing.geo.
                          window.BOOM_GEO. See "Precisione dei pin".
  dispo-engine.js         Quando è DAVVERO libera questa casa: now / date /
                          unknown, più il cervello del messaggio unico
                          (più immobili in una frase). window.BOOM_DISPO.
                          Vedi "Le date di disponibilità".
  radar-engine.js         Il Radar 2.0, puro: impronta (gemelli cross-portale),
                          fiuto (punteggio occasione), vedette (ricerche
                          libere), valutatore (fascia canone sui FIRMATI),
                          inferZone (zona dedotta dal titolo, mai indovinata).
                          window.BOOM_RADAR. Vedi "Il Radar 2.0 — La Centrale".
  inventario-engine.js    Cosa c'è in casa e in che stato: lessico chiuso
                          delle stanze, il video che NON emette giudizi
                          ("buono" solo da un umano), il confronto
                          consegna⇄riconsegna che non imputa un danno su una
                          condizione mai dichiarata. window.BOOM_INVENTARIO.
                          Vedi "L'inventario dal video".
  ../api/_pdfbrand.js     La testata dei PDF in una copia sola: marchio VERO
                          incorporato, filo d'oro, piede legale su ogni
                          pagina, wa() WinAnsi. Usata da inventario e verbale.
  contract-pdf.js         L'impaginato del CONTRATTO (Allegato B transitorio +
                          Allegato C studenti, modelli CAF verbatim) in UNA
                          copia: window.BOOM_CONTRACT_PDF nel portal (jsPDF
                          CDN 2.5.1) e import ESM in api/sign/_contractpdf.js
                          (jsPDF npm, STESSA versione pinnata). build() →
                          { doc, sigAnchors, hashSeed }; upload/hash/patch
                          restano ai chiamanti.
  ai-registry.js          La Centrale AI, il registro PURO: i 27 scopi che
                          chiamano un modello (file, modello cloud di default,
                          modalità testo/visione/documento/audio, se può
                          andare in locale e perché), le tre modalità
                          cloud/shadow/local, la validazione di `settings/ai`
                          (rifiuta, mai aggiusta), il listino prezzi e il
                          verdetto di promozione. window.BOOM_AI.
                          Vedi "La Centrale AI".
  ../api/_ai.js           La porta UNICA verso qualunque modello: instrada
                          (cloud · ombra · locale sul Mac), mette il tetto,
                          ricade sul cloud, conta in aiUsage/aiShadow.
firestore.rules           Firestore security rules (role-based)
storage.rules             Storage security rules (role-based file access)
firebase.json             Firebase deploy config (firestore + storage rules)
/css/
  boom-core.css           Marketing site design system (used by index, etc.)
/pass-assets/             Apple Wallet pass resources (icons, logos, strips)
  viewing/  tenant/  referral/  landlord/
/public/
  deals_v2_commandcenter.html
```

## Key Files

| File | Purpose |
|---|---|
| `portal.html` | Main admin/user app (~21K lines). Single-page app with all CRUD, dashboards, analytics. **Read first.** |
| `proppass.html` | Apple Wallet pass generator UI. Four pass types: viewing, tenant, referral, landlord. |
| `pass-delivery.html` | La CARTA D'IMBARCO (STUDIO_AVIATION_2026-08.md, S2): la pagina STAMPA il biglietto (emissione in puro CSS), rotta ROM→codice zona dal lessico curato (mai inventato), e dice la verità — visita annullata (`meta.voided`) o non confermata (`when` assente) = Wallet spento e detto. Palette scalo #FFD700. Test: `node tests/scalo/run.mjs`. |
| `index.html` | Landing page / homepage. |
| `apartments.html` | Property listings page (discovery). La griglia è una FOTOGRAFIA di build (`design/pages-deco/costruisci-ad.py` su snapshot locali); in pagina l'**idrante** rilegge Firestore e aggiorna stato/prezzo/data delle card di build, e l'**innesto** COSTRUISCE la card per gli annunci nati dopo la build (es. wizard Telegram di sera) — stessa grammatica del builder, registrata nel setaccio via `window.__muroInnesta`: filtri e conto la vedono. Senza innesto un annuncio era "pubblicato e invisibile" (`/listing/:id` vivo, vetrina muta). **Il Solari del prezzo è UN montatore** (`window.__solariPrezzo`, 28/08): il tabellone split-flap del badge prezzo era montato solo sulle card di build — le carte innestate restavano col testo piatto e l'idrante, aggiornando un prezzo, DISTRUGGEVA il tabellone riscrivendolo come stringa; ora build, innesto e idrante montano lo stesso Solari (test: celle presenti anche sull'innestata). Test: `node tests/vetrina/run.mjs`. |
| `apartment-detail.html` | Dynamic single-property page (loads from Firestore). |
| `boom_doc_parser.html` | AI document parser UI (uses Claude API). |
| `risposte.html` | Le risposte rapide di WhatsApp Business (`/risposte`, admin, noindex): 48 messaggi pronti col tasto Copia, i due messaggi automatici, le etichette e la libreria link. Rende `js/whatsapp-replies.js` — nessun testo duplicato nella pagina. |
| `watermark-studio.html` | Standalone watermark tool for interns/team. 100% client-side (no Firebase): upload photos, customize the BOOM mark live (6 styles: firma, sigillo, editoriale, pattern, cornice, custom logo), drag to position, batch ZIP export. |
| `media-studio.html` | Pro media production tool (superset of watermark-studio; photo *processing* is 100% client-side). Layered compositor: auto-enhance (histogram analysis, backlight-aware), shadows/highlights tone recovery, color grading (5 looks + manual + saveable custom looks), unsharp-mask sharpening, horizon straighten + vertical keystone (perspective) correction, live histogram, crop/aspect per channel with focal framing + composition guides, branding system (watermark + badge + listing info bar + scrim), draggable text layers, social templates, thumb reordering (order = publish order, first = cover), multi-format batch export with smart ×2 upscale, one-click **Media Kit** ZIP (all formats + AI copy + README), Ken Burns video reel generator (MediaRecorder, MP4-first, optional music track via WebAudio), AI listing copywriter (via `/api/media/caption`). **Simple/Pro UI modes** (localStorage), session autosave/restore (IndexedDB). **Catalog bridge**: browse `listings` (public read), open a listing's photos (`?listing=<id>` deep-link from portal rows 🎨 + photo-lab), prefill info bar from `zone/price/bedrooms/sqm`, and publish curated photos back — uploads under `listings/enhanced/<id>/` (sweep-safe per `api/photos/enhance.js` `isEnhancedUrl`), additive `imagesOriginal` union, `photosEnhancedAt/By: 'studio:<email>'`, cover = first thumb. **Publish rails**: reel → `videoUrl` (MP4 only, upload `listings/enhanced/<id>/video/` — dedicated storage.rules match, video/* <100MB; apartment-detail renders non-YouTube urls via its `<video>` branch/`exVid()`); AI copy (tipo portale) → `description`/`descriptionIt` with sweep discipline (`descriptionOriginal` preserved, `descriptionSource:'studio:<email>'`); live **pagella** chip mirrors `gradeListing()`; portalPubs status shown to admins (photos/video/description are in the Pubblicista's `coreContent` → updates queue themselves). Publishing requires admin (Firestore/Storage rules enforce). Linked from portal sidebar → Console → Media Studio. |
| `vercel.json` | Deployment config, rewrites, cron schedule. |
| `js/firebase-config.js` | Firebase project config (`boom-property-dashboards`). |
| `js/boom-portal.js` | Shared portal lib — `window.BoomPortal` API. |
| `owner-dashboard.html` | Landlord/owner SPA. Firestore-backed, filtered by `ownerId`. |
| `tenant.html` | Tenant SPA. Realtime property + maintenance feed. |
| `client-portal.html` | PFS client swipe app. Reads `pfsClients` collection. |
| `pfs-command.html` | **La plancia unica del PFS** (admin): TUTTO il flusso Property Finding in una pagina. Pipeline per stage (giorni-in-stage, chip lenti in ambra) → fascicolo cliente a drawer (criteri, ricerche, mazzo con esiti/rimozione, attività, link portale con codice BM…, WhatsApp, cambio stage con la STESSA scrittura del portal) → creazione cliente (nasce col portale attivo) → feed radar con fiuto 💎/badge cluster/filtro occasioni + azione «→ Proponi a…» (push curato via `api/casafari/import`, conferma sulle agenzie) → strip occasioni (radarState) → ricerche automatiche + **vedette** (stessa collection della Centrale) → triage swipe, ⌘K, brief AI, salute fonti. |
| `chiamate.html` | Il Centralino (admin, `/chiamate`). Ogni chiamata deviata in segreteria: audio, trascrizione, azione consigliata, WhatsApp one-tap con bozza. Backed by `api/phone/*`. |
| `radar.html` | **La Centrale del Radar** (`/radar`, admin). Polso del mercato per zona, feed 💎 occasioni, candidati mandato, vedette (CRUD), Valutatore, gemelli cross-portale, salute fonti. Vedi "Il Radar 2.0". |
| `inventario.html` | L'inventario dal video (`/inventario`, admin/owner/landlord, noindex): filma il giro, i fotogrammi si estraggono sul telefono, Claude propone l'elenco stanza per stanza, l'operatore corregge → PDF (allegato del verbale) + confronto automatico alla riconsegna. Motore: `js/inventario-engine.js`. |
| `sw.js` | Service worker (network-first HTML, cache-first static). |

## Brand & Design

- **Primary background**: `#08080A` (near-black)
- **Accent gold**: `#D4AF37`
- **CSS variables** (defined in portal.html, reused across pages):
  ```css
  --gold: #D4AF37;
  --gold-light: rgba(212,175,55,0.15);
  --gold-dark: #B8960C;
  --bg: #000;
  --bg-card: #0A0A0A;
  --bg-elevated: #141414;
  --bg-input: #1A1A1A;
  --border: rgba(255,255,255,0.08);
  --text: #FFF;
  --text-secondary: #999;
  ```
- **Typography**: Helvetica Neue 300, Inter fallback. Wide letter-spacing (2-6px) for luxury feel.
- **Dark mode only** — all pages use dark backgrounds with gold accents.

## Deployment

- **Platform**: Vercel
- **Build**: None — static files served as-is
- **outputDirectory**: Must be `"."` (root), NOT `"public"`. All HTML lives in root.
- **Deploy**: `git push` to main triggers automatic Vercel deployment
- **Cron**: `reminder-cron.js` runs every 15 minutes (configured in vercel.json)
- **Functions timeout**: 60s max for reminder-cron
- **Function configuration limit (21/09)**: Vercel rejects more than 50
  `functions` rules before building. The exact glob
  `api/homie/{conversation,message}.js` keeps both endpoints at 60s in one
  rule; all other function settings stay unchanged. Validate matching paths
  and the Git preview when adding a rule. Same move for
  `api/preagreement/{submit,sign-for}.js` (the 51st rule would have blocked
  the production deploy, not a test); `tests/mandato/run.mjs` §9 pins the
  ≤50 count and resolves rules through brace expansion.
  The single-delivery endpoint uses the exact group
  `api/homie/{wa-outbox,wa-outbox-single}.js`, both at 60s.
  The 22/09 Centrale AI release also groups
  `api/fiscal/{fascicolo,pack,foglio}.js` and adds `api/ai/status.js` at 30s.
  The combined configuration has 49 rules for 54 configured paths;
  all live settings, memory and includeFiles remain unchanged.
  `npm test -- vercelfunctions` compares the current live baseline plus the
  single endpoint, keeps the original 51-rule regression fixture and rejects
  overlaps, lost settings and new overrides on default-configured handlers.
  `sign-for` stays at 60s; `segretaria/preparation.js` keeps its default.
- **I `.md` non vanno sul sito (12/10/2026)**: con `outputDirectory: "."`
  ogni file del repo diventava una pagina, e `www.boomrome.com/AGENTS.md`
  rispondeva 200 (così CLAUDE.md, gli studi e gli audit). Da oggi
  `.vercelignore` esclude `*.md`: nessuna pagina e nessuna funzione ne legge
  uno a runtime (i bot sul Mac scaricano da GitHub, non dal sito). Il repo
  resta pubblico: l'esclusione toglie la copia sul dominio, non quella su
  GitHub. `tests/contesto` fa cadere la CI se la riga sparisce.


## Environment Variables (Vercel)

```
# Firebase (for reminder-cron.js server-side auth)
FIREBASE_API_KEY
FIREBASE_ADMIN_EMAIL
FIREBASE_ADMIN_PASS
FIREBASE_PROJECT_ID          # boom-property-dashboards

# Apple Wallet pass signing
PASS_CERT_BASE64
PASS_KEY_BASE64
PASS_KEY_PASSPHRASE

# Email (Nodemailer)
GMAIL_USER
GMAIL_APP_PASS
LEADS_NOTIFY_EMAIL           # optional — dove arriva l'avviso di ogni candidatura
                             # dal sito (/api/apply-lead); default
                             # ADMIN_NOTIFY_EMAIL → valentino@boom-rome.com
REGISTRATION_EMAIL           # optional — dove arriva il Foglio di registrazione
                             # (email pulita a firma completa); default
                             # CAF_EMAIL → valentino@boom-rome.com

# AI document parsing
ANTHROPIC_API_KEY
OPENAI_API_KEY               # optional — Whisper transcription for the
                             # wizard bot's voice notes (/api/wizard/transcribe)

# La Centrale AI — il modello LOCALE sul Mac (api/_ai.js, vedi "La Centrale AI")
LOCAL_AI_URL                 # optional — base URL OpenAI-compatibile del server
                             # sul Mac (https del tunnel; http SOLO su rete
                             # privata). È il default di deploy: se
                             # settings/ai.local.url è scritto, vince quello
LOCAL_AI_MODEL               # optional — modello testo (es. qwen3:14b)
LOCAL_AI_VISION_MODEL        # optional — modello con visione (es. qwen2.5vl:7b);
                             # senza, ogni immagine resta in cloud
LOCAL_STT_URL                # optional — server Whisper OpenAI-compatibile
                             # (POST /v1/audio/transcriptions)
LOCAL_STT_MODEL              # optional — es. large-v3-turbo
LOCAL_AI_TIMEOUT_MS          # optional — tetto per chiamata locale (default 20000)
LOCAL_AI_TOKEN               # bearer del tunnel (llama-server --api-key, un
                             # reverse proxy): SOLO in env, MAI in Firestore
LOCAL_AI_CF_ID               # optional — service token di Cloudflare Access
LOCAL_AI_CF_SECRET           #            (se il tunnel è cloudflared + Access)

# Cron auth
CRON_SECRET

# Homie Mac bridge (inbound webhooks)
HOMIE_SECRET                 # shared secret sent as X-Homie-Secret header

# Telegram listing wizard bot
WIZARD_SECRET                # shared secret sent as X-Wizard-Secret header
                             # (optional — falls back to HOMIE_SECRET)

# PFS radar (api/pfs/*)
PFS_IMAP_USER                # optional — alert mailbox if ≠ GMAIL_USER
PFS_IMAP_PASS                # optional — its app password (IMAP read)

# La Squadra (api/employees/*)
ACCOUNTING_EMAIL             # optional — recipient of the Contabile's monthly
                             # close email (falls back to GMAIL_USER)

# La Banca — open banking (api/banking/*)
GOCARDLESS_SECRET_ID         # GoCardless Bank Account Data (ex Nordigen).
GOCARDLESS_SECRET_KEY        # NOTE: GC closed NEW signups (2026) — only
                             # usable with a pre-existing account. Without
                             # them /banca works via the email statement
                             # scanner (scan-inbox) + manual CSV import.
BANK_MAIL_FROM               # optional — extra sender filters for the bank
                             # statement email scanner (comma-separated,
                             # e.g. "intesasanpaolo.com,fineco.it")

# Canone via BOOM + journey (api/payments/pay.js, api/journey/_run.js)
RENT_FEE_PCT                 # optional — service fee % on card rent payments
                             # (default 2.5)
RENT_FEE_MIN                 # optional — fee floor in EUR (only with RENT_FEE_PCT)
RENT_FEE_BUFFER              # optional — margine sopra il costo Stripe misurato,
                             # in euro (default 0 = si va a pari)
RENT_FEE_MAX_PCT             # optional — tetto di sicurezza in % (default 4)

# Canone automatico SEPA (api/payments/_sdd.js, sdd-setup.js)
SDD_FEE_EUR                  # optional — commissione flat forzata per addebito
SDD_FEE_BUFFER               # optional — margine BOOM sopra il costo medio
                             # misurato (default 1.50 — qui il default NON è
                             # zero: margine richiesto esplicitamente)
SDD_FEE_MAX_PCT              # optional — tetto in % della rata (default 1.5)
SDD_LEAD_DAYS                # optional — anticipo addebito sulla scadenza
                             # (default 7: SEPA regola in ~5 giorni lavorativi)
REVIEW_URL                   # the REAL Google review link (g.page/r/…) used
                             # by the journey's T+3 and exit emails; falls
                             # back to a Google search for the profile

# Lo Smistatore (api/documents/_smista.js + scan-inbox)
DOC_MAIL_FROM                # optional — extra TRUSTED senders whose email
                             # attachments get auto-filed (comma-separated,
                             # e.g. "commercialista@studiorossi.it"). The
                             # operator's own addresses are always trusted.
VIEWINGS_CALENDAR_EMAIL      # optional — where viewing calendar invites are
                             # sent (defaults to GMAIL_USER)
BUSY_ICS_URLS                # optional — ICS address(es) of the operator's
                             # REAL calendar (Google Workspace: Calendar →
                             # Settings → your calendar → Integrate calendar),
                             # comma-separated. Busy events remove slots from
                             # the public booking grid. Fail-open: an
                             # unreachable calendar never blocks bookings.
                             # NOTA: l'indirizzo SEGRETO non compare quando
                             # l'admin Workspace ha disattivato la condivisione
                             # esterna (Admin console → App → Google Workspace
                             # → Calendar → Impostazioni di condivisione). In
                             # quel caso o si riabilita, oppure si usa
                             # l'indirizzo PUBBLICO di un calendario condiviso
                             # in modalità "solo disponibilità" — dropBoomEchoes
                             # copre gli UID anonimizzati di quella modalità
TELEGRAM_BOT_TOKEN           # already used by api/telegram/*; pfs health alerts
TELEGRAM_CHAT_ID

# Il Centralino (api/phone/*)
TWILIO_ACCOUNT_SID           # via A (segreteria): download audio (basic auth)
TWILIO_AUTH_TOKEN            # + lookup chiamata; senza, si tenta il download
                             # nudo e l'eventuale 401 finisce ANNOTATO sul doc
ELEVENLABS_WEBHOOK_SECRET    # via B (receptionist): signing secret del
                             # post-call webhook ElevenLabs (HMAC t=,v0= sui
                             # byte grezzi). Senza, la porta rifiuta tutto.
```

## API Endpoints

### GET `/api/reminder-cron`
Triggered by Vercel cron every 15 min. Authenticates with Firebase, queries pending reminders, sends emails via Nodemailer.

### Le regole IN VIGORE ≠ le regole nel file (31/08/2026)
Il difetto più caro trovato in questa tornata, e nessuna suite poteva
vederlo: **tutte leggono `firestore.rules`, cioè l'INTENZIONE, e nessuna la
realtà.** In produzione `publicGeo` (la griglia dei tempi del Pendolare, che
scheda e /skyline devono leggere da anonimi) rispondeva `PERMISSION_DENIED`
— la regola era nel repo e non era mai stata deployata, perché il
`FIREBASE_TOKEN` della CI era **scaduto** e il job `deploy-rules` falliva a
ogni push mentre i merge continuavano. È esattamente il difetto che quel job
era nato per impedire (la lezione `propertyLocks`), tornato dal lato di chi
lo doveva prevenire. L'ultima regola arrivata in produzione è quella del
**23 agosto**; il messaggio di CI ora dice cosa fare invece di limitarsi a
fallire (rigenerare con `npx firebase-tools login:ci`; fix duraturo: service
account + `GOOGLE_APPLICATION_CREDENTIALS`, `--token` è deprecato).
`tests/regole/run.mjs` è il canarino: interroga Firestore **da anonimo** con
la chiave pubblica che sta già nelle pagine e misura le DUE direzioni —
quello che il sito deve poter leggere (catalogo, publicGeo) e quello che non
deve MAI uscire (contratti, pagamenti, anagrafiche, lead, lucchetti,
telefonate, proposte, segnalazioni). Senza rete si auto-skippa; se Firestore
risponde e la risposta non è quella dichiarata, è un guasto.

### La CI rossa che nessuno leggeva (31/08/2026)
Trenta run di fila fallite su main. Due cause distinte, entrambe invisibili:
il `deploy-rules` qui sopra, e la suite `anteprima` che moriva **solo sul
runner** — `design/pages-deco/anteprima.py` portava
`R = '<home di chi l'ha scritta>'`, il percorso assoluto del proprio sandbox.
È la STESSA lezione già pagata il 19/08 e già scritta in `tests/_browser.mjs`
(«un percorso cablato vale come SUGGERIMENTO, mai come dichiarazione»),
tornata sei giorni dopo in un altro linguaggio, dove quella nota non si
legge. Il danno peggiore non è il rosso: su una macchina dove quel percorso
ESISTE lo script non fallisce, legge un ALTRO albero e costruisce la pagina
sbagliata dichiarandola giusta (verificato per differenza). E il chiamante
stampava il traceback di Python come **Uint8Array di byte**, illeggibile —
due giri di correzioni spesi al buio. `tests/radici/run.mjs` chiude la
classe: nessun file eseguito da `npm test`, né alcuno di quelli che quei
file **lanciano**, può portare la casa di qualcuno dentro una stringa (i
commenti che raccontano il difetto restano — sono la memoria che lo tiene
lontano).

### Le tre reti del server (`api/_modeljson.js` · `api/_budget.js` · storageUpload)
Tre difetti trovati il 31/08/2026 **nei log di produzione**, non ragionando:
tutti e tre di CLASSE, tutti e tre chiusi in un posto solo.

- **`api/_modeljson.js` — leggere il JSON di un modello.** L'Innesto è morto
  due volte (`ai_bad_json`) su documenti VERI dell'operatore. La lettura era
  `JSON.parse(raw.slice(raw.indexOf('{'), raw.lastIndexOf('}') + 1))`,
  ricopiata in **otto** file: `lastIndexOf` non cerca la fine dell'oggetto ma
  l'ultima graffa del testo (una nota del modello dopo il JSON e si taglia a
  caso), e una risposta TRONCATA non si distingueva da una malformata. Ora
  una copia sola, con tre regole: (1) si sistema solo la FORMA — recinto
  `` ```json ``, prosa, virgola in coda, commenti, a capo dentro una stringa;
  (2) **una risposta troncata non si ripara MAI** — chiudere le graffe
  consegnerebbe l'ultimo valore letto a metà («Roma, Via Crem») come se
  fosse quello che c'è nel documento, e un dato mezzo letto non si vede;
  (3) **la diagnosi non porta contenuto** — il vecchio log stampava
  `raw.slice(0, 200)`, cioè codice fiscale e IBAN di persone reali dentro i
  log di Vercel (ci sono finiti davvero). Ora: perché, quanto, in che forma.
  All'operatore arriva cosa fare, non `ai_bad_json`.
- **`api/_budget.js` — il tempo che resta.** I cron venivano uccisi a 60s
  (3 volte nelle sole ultime 24h) **benché avessero già** una scadenza
  morbida a 48s: chiedeva «sono in ritardo?» e poi avviava un giro da 45s.
  `runBudget(60_000, riserva).afford(costo)` chiede invece «ce la faccio a
  pagare il prossimo passo?»; il costo dichiarato è quello VERO (il
  `socketTimeout` imapflow, il tetto della chiamata al modello) e i test lo
  legano al numero in vigore. Più `aiSignal(ms)`: **ventuno** file chiamavano
  `api.anthropic.com` senza alcun tetto — una richiesta appesa non falliva,
  teneva la funzione occupata fino al kill di piattaforma (nessun battito,
  nessuna spiegazione). L'invariante di CLASSE è testata scandagliando `api/`
  per intero: una lista scritta a mano invecchierebbe al primo file nuovo, ed
  è il file nuovo quello che sbaglia.
- **`storageUpload` riprova.** Un 503 di Cloud Storage è momentaneo (la guida
  di Google dice di riprovare) ma non si riprovava affatto: nei log una
  Valutazione BOOM già calcolata si è persa perché mancava il posto dove
  metterla. Da questa funzione passano contratto firmato, verbale delle
  chiavi, fascicolo fiscale, rendiconto al proprietario e conservazione. Ora
  3 tentativi con attesa crescente **solo su 429/5xx e rete caduta** — un
  401/403/404 non si aggiusta aspettando — più un tetto di 20s.
- **La scala del CDN** (portal.html): il portale ha riportato due volte
  `"Script error." source:"" line:0`, la forma che il browser dà quando a
  lanciare è uno script di un altro dominio — sappiamo CHE è andato in errore
  e non possiamo sapere in cosa. `crossorigin="anonymous"` lo smaschera, ma
  **solo se il CDN manda l'intestazione CORS**: senza, lo script non carica e
  su portal.html è la pagina bianca. Quindi non si scommette — si scende una
  scala: se la versione CORS non carica si rimette lo stesso script senza
  (com'era prima), un solo tentativo, e solo dopo il cartello. Provata in un
  browser vero contro un finto CDN che NON manda CORS
  (`node tests/scala/run.mjs`).
- Test: `node tests/modeljson/run.mjs` (39) · `node tests/tempo/run.mjs` (33)
  · `node tests/scala/run.mjs` (8).

### I tre guasti del 4/10/2026 (letti nei log di Vercel, non dedotti)
- **Il Commerciale fermo.** `ReferenceError: pickChannel is not defined` in
  49 giri su 49 della finestra dei log (28/09 → 4/10, e verosimilmente da
  prima). Un merge aveva annidato `pickChannel` DENTRO `run()` (e
  `propertyContext`/`alternatives` dentro `proposeFirstReply`), mentre la
  chiamavano due funzioni esterne: le prime risposte cadevano nel `.catch`
  contate come «errore AI», il primo follow-up faceva cadere il giro intero.
  Ora sono funzioni del modulo (`pickChannel` esportata). Nessun test
  eseguiva quel percorso: `tests/guasti/run.mjs` esegue il giro VERO.
- **✍️ Firmo io senza regola.** Il server entra in Firestore come UTENTE admin
  (login con password), non con una service account: le regole valgono anche
  per lui. `operatorSignatures` non aveva un `match` → 403 al primo
  salvataggio della firma (1/10, tre tentativi). Regola admin-only aggiunta;
  la guardia di CLASSE (`tests/guasti`) scandaglia `api/` — fsGet/fsCreate/…,
  `collectionId`, `'coll/' + id`, `` `coll/${id}` `` e le costanti
  `*COLL*`/`*QUEUE*` — e pretende un `match` per OGNI collection (i prefissi
  di Storage si riconoscono da `storage.rules`). È la sesta volta:
  propertyLocks, signTokens, portalPubs, rendiconti, viewings,
  operatorSignatures.
- **La raffica di login.** `getAdminToken` teneva il token ma non il login IN
  CORSO: a token scaduto le ~190 letture parallele di scan-replies facevano
  ~190 `signInWithPassword` → `QUOTA_EXCEEDED: Exceeded quota for verifying
  passwords`, quota dell'INTERO progetto (reminder-cron caduto il 16/09 e il
  2/10, battiti di salute persi). Ora un solo login in volo, condiviso da
  chi arriva nel mezzo; un login fallito non resta in memoria. reminder-cron
  e stripe-webhook (un login per OGNI lettura dell'evento) usano il login
  condiviso; fuori da `homie/_lib` firmano da sé solo le pagine pubbliche
  col ripiego su 403 (elenco pinnato nel test).
Test: `node tests/guasti/run.mjs` (18 check; mutazioni: le versioni di main
di commerciale, `_lib` e reminder-cron cadono, e togliere la regola di
`operatorSignatures` fa nominare proprio quella).

### Le tre letture risparmiate (5/10/2026 — dai log di Vercel, come i guasti del 4/10)
- **La fotografia per il Mac** (`api/agent/_memo.js`). Homie chiama
  `agent/state.snapshot` ~741 volte e `agent/risk.scan` ~719 volte al giorno
  (una ogni due minuti), e ogni risk.scan rilegge fino a ~2.280 documenti per
  dati che cambiano nell'arco di ore. Ora il risultato si calcola UNA volta e
  vale 10 minuti (`MEMO_TTL_MS`): in memoria nell'istanza calda (zero
  letture), nel documento `heartbeat/agent-memo-<chiave>` per un'istanza
  fredda (UNA lettura), come stringa JSON (la conversione Firestore delle
  mappe perde i `null`). Chiave per scope e per orizzonte (`window` 1–730,
  scope in lista bianca: un valore iniettato non crea chiavi nuove); due
  chiamate insieme fanno un calcolo; `fresh:true` ricalcola; la risposta dice
  `cached`/`cachedAt`. Un guasto della memoria non ferma la risposta.
- **Le conversazioni dei seguiti in blocco** (`fsGetMany` in `homie/_lib.js`,
  usato da `segretaria/scan-replies`): ~190 `fsGet` paralleli diventano una
  `documents:batchGet` ogni 100 percorsi. Ciò che il lotto non risolve
  (risposta non valida, errore) si rilegge uno per uno, 8 alla volta — mai
  la raffica di prima; un errore vero di lettura risale come prima.
- **La Scheda dell'inquilino solo all'admin** (`profile/link`). Il link della
  Scheda permette di SCRIVERE i dati della parte (anagrafica, documento): al
  proprietario arrivavano quello dell'inquilino e quelli dei co-conduttori.
  Ora al proprietario: il SUO link, lo stato e i nomi; niente `tenantUrl`
  (`tenantLinkVia:'admin'`), niente `ask.tenant`/`ask.operator`, niente
  messaggio pronto né `schedaUrl` dei co-conduttori. Il portal, sul bottone
  «Chiedi all'inquilino», dice che il link lo manda BOOM.
Test: `node tests/efficienza/run.mjs` (18 check — cache calda/fredda/scaduta,
`fresh`, chiavi separate, calcolo condiviso, lotti da 100, ripiego con
tetto, giunzione di scan-replies; mutazioni: memoria tolta, ripiego senza
tetto, scan-replies di main, scope senza lista bianca) + `tests/scheda`
(owner senza Scheda dell'inquilino, admin invariato) + `tests/signtokens`
(owner senza Scheda dei co-conduttori). Il risparmio VERO si legge nei log
e nella fattura Firestore dei giorni successivi.

## Conventions

- **Serverless deps live in `api/package.json`** (the manifest the Vercel
  builder actually installs from — root `package.json` alone is NOT enough).
  When a new npm package is imported by any `api/**` file, add it to BOTH
  `api/package.json` and root `package.json` (kept mirrored) and regenerate
  `package-lock.json`. Getting this wrong ships functions without their
  dependencies: every endpoint importing a package 500s at module load
  (`ERR_MODULE_NOT_FOUND`) — this took the whole API down for ~2h on
  2026-07-22. `VERCEL_FORCE_NO_BUILD_CACHE=1` is set in the project env
  (build takes ~20s; a poisoned build cache can never recur).

- All pages are standalone HTML with inline `<style>` and `<script>` blocks — no bundler
- Firebase is loaded via CDN `<script>` tags, initialized per-page
- New pages should follow the dark theme with gold accents pattern
- Property-specific pages follow `apartment_[name].html` naming
- Blog posts follow `blog-[slug].html` naming
- **Tests**: `npm test` runs every suite (`tests/run-all.mjs`); `npm test -- money safari`
  runs a subset. No framework, no emulator — each suite drives the REAL handler
  and stubs only the network (`globalThis.fetch` over an in-memory Firestore) or
  the browser. A suite needing something absent (playwright-core) prints `SKIP:`
  and is reported as skipped, never as a failure.

  | Suite | Copre |
  |---|---|
  | `tests/money/run.mjs` | checkout, webhook Stripe idempotenti, conversione PA→contratto; §9b Sprint 1: la guardia sovrapposizioni (regola pura per mutazione: interni, retry, aperti), l'immobile che nasce dalla proposta (id deterministico, mai due), la porta HTTP (409 overlap · 400 no_property+canCreate) e il dryRun che non scrive NIENTE e dice i puntini per parte |
  | `tests/fiscal/test.mjs` | motore scadenze fiscali |
  | `tests/fiscal/canone.mjs` | canone concordato: superficie convenzionale (coefficienti e tetti), fascia dai parametri, regola del cap, match zona che non indovina, parametri solo da feature reali, verdetto fits/fuori |
  | `tests/contractpdf/verbatim.mjs` | le clausole dei modelli A (3+2) e C (studenti, con e senza cedolare) sono quelle dei `.doc` dell'associazione in `reference/`, frase per frase — il lettore `.doc` sta in `tests/_doc.mjs`, le normalizzazioni dei refusi sono elencate, le varianti nostre dichiarate; ha preso «saranno» per «sono» al primo giro |
  | `tests/fiscal/scheda.mjs` | la Scheda di calcolo canone 1:1 col modulo ARPE (Allegato 2/B): ogni etichetta stampata sta nel `.docx` del modulo parola per parola (anti-deriva, con la mutazione che dimostra che il check morde), i fatti dal contratto (bracket di superficie, pertinenze, parametri derivati, subfascia, calcolo riga per riga, cap dichiarato, sforamento), senza zona/mq un modulo vuoto onesto (e «Via della Lungaretta» non è più DELLA VITTORIA), PDF a sé stante di una pagina che stampa davvero quelle parole e NON la testata BOOM |
  | `tests/taxpack/test.mjs` | pacchetto commercialista |
  | `tests/journey/steps.mjs` | **le regole commerciali dell'operatore**: quando parte ogni email e cosa NON deve contenere (T-90 e uscita non vendono, le chiavi non si vendono mai, un prodotto già comprato non si ripropone, il rinnovo non arriva prima del move-in su un transitorio breve) |
  | `tests/journey/review-url.mjs` | solo un vero link "scrivi recensione" (`g.page/r/<id>/review`) entra nelle email; un link Maps "Condividi" viene rifiutato con warning |
  | `tests/dossier/run.mjs` | fascicolo ARPE: un landlord non può scrivere nel fascicolo di un immobile altrui, path sotto `property-docs/<id>/`, slot già pieni non sovrascritti |
  | `tests/preagreement/state.mjs` | stato della proposta: un deal PAGATO non torna mai indietro (né ad `accepted` né a `reserve`) e non apre una seconda Checkout, il link "completa il pagamento" non incassa due volte, la riparazione dalla console non dichiara MAI pagato senza prova (checkout abbandonata ≠ pagamento, sessione di un'altra proposta ≠ pagamento) e la riserva si sblocca solo se il lucchetto è davvero libero. Verificato per mutazione: rimessa la vecchia guardia, 7 check cadono |
  | `tests/photos/sweep.mjs` | photo-lab: chi è candidato allo sweep, quali foto contano come sorgente (i nostri output enhanced mai), e l'ordine con cui le 3 notti si spendono — le gallerie vere prima degli annunci da una foto. Si auto-skippa senza `sharp` |
  | `tests/copy/run.mjs` | descrizioni: lo sweep riscrive i template del bot e le schede mute, ma **mai** le parole di un umano — verificato sulle stringhe vere del catalogo, dove il testo scritto a mano è più CORTO del template |
  | `tests/dispo/run.mjs` | date di disponibilità: una data illeggibile non diventa MAI "libera ora" (il difetto che metteva "Available now" su case libere a settembre), un messaggio aggiorna tutte le case, una data sola non si spalma su chi non è stato nominato, e la porta rifiuta ciò che le pagine non saprebbero rileggere |
  | `tests/geo/run.mjs` | precisione dei pin (`js/boom-geo.js`): portone (via+civico), strada, quartiere o niente — sulle stringhe `geo.q` vere del catalogo, incluso il caso insidioso `src:'nominatim'` su `q:'Prati, Roma'` |
  | `tests/prenota/run.mjs` | la corsia del pre-blocco: una casa occupata con data nota si PRENOTA e la data si vede ovunque (era «Waitlist open»), l'affittata si apre SOLO col contratto (`availableFrom`) e mai su una `availableDate` residua, l'illeggibile non promette niente, e l'anno dedotto dal motore viene dichiarato all'operatore invece di passare per un fatto. Regole C e D verificate per mutazione |
  | `tests/vetrina/run.mjs` | l'innesto della vetrina (Chromium vero su apartments.html servita): un annuncio nato DOPO la build appare, è contato e i filtri veri lo mordono (zona via hash, ricerca libera, cuore); la data testo libero passa dal motore condiviso («1 Sept 2027» → «Free from», mai «Available now»); senza foto di casa nostra o con stato ignoto la carta NON nasce; le card di build continuano ad aggiornarsi. Verificato per mutazione |
  | `tests/scheda/run.mjs` | La Scheda: token derivati (ruolo nella derivazione, timing-safe), precedenza prefill contratto→sign→wizard, lock post-firma, sync profilo su ENTRAMBI gli schemi users, upload con OCR che non blocca mai, /api/profile/link autorizzato |
  | `tests/contratto/run.mjs` | Il dizionario del contratto: ogni lettura dei modelli è dichiarata e ogni voce è letta (anti-deriva nelle due direzioni), la cedolare non torna `=== true` (mutazione), la completezza cambia per modello/owner/società/extra-UE/co-conduttori/durata di legge, la Scheda chiede SOLO ciò che manca a QUELLA parte, un token tenant non scrive mai l'immobile (e lo dice), il co-conduttore scrive solo la sua riga e la firma altrui resta, i numeri RLI (totale per durata < 12 mesi, scadenza da min(stipula, decorrenza)), il foglio pulito senza bottoni né link e con gli allegati veri, 401 senza admin |
  | `tests/scrivano/run.mjs` | lo Scrivano, la porta dal telefono: archiviato con id deterministico e bottone 🌱, il tap mette in coda (mai una lettura nel webhook), il worker legge i byte archiviati col cuore dell'Innesto e manda la card col link `#innesto=<docId>`; mai due letture, guasti col rimedio, le porte di Codex ereditano l'offerta |
  | `tests/doctext/run.mjs` | «qualsiasi cosa» diventa testo: lo ZIP minimo (STORE/DEFLATE, mai una zip bomb), Word/Excel/OpenDocument/.doc/email/HTML/RTF/testo estratti senza dipendenze, il tipo VERO dai byte prima che dal nome (un JPEG etichettato HEIC è un JPEG; una HEIC vera è una HEIC) |
  | `tests/innesto/run.mjs` | l'Innesto e il 413 di piattaforma: il PDF grande transita da Storage e i byte che arrivano ad Anthropic sono ESATTAMENTE quelli scaricati, un host estraneo non viene MAI contattato (l'endpoint non è un proxy), i tetti restano onesti (8 MB, whitelist formati), e il transito si cancella nel finally. Più l'APPLY VERO su Firestore finto: proposta completa → contratto+rate scritti, proposta senza una gamba → il contratto non nasce MA il riepilogo non lo promette e il toast dice quale gamba manca (la lezione del 30/08: "Innesto completato" senza contratto), proprietario già in `landlords` → mai un doppione |
  | `tests/signtokens/run.mjs` | le chiavi di firma fuori dal contratto: deposito `signTokens` admin-only, il contratto letto dalle parti non porta token, nessuna porta HTTP dà il link dell'altra parte, migrazione che cancella i campi in chiaro conservando i link spediti; mutazioni |
  | `tests/notify/run.mjs` | ciclo email contratto (pdf-lib REALE, nodemailer mockato): fascicolo CAF a valentino@boom-rome.com esattamente una volta con anagrafica di entrambe le parti, welcome nella lingua del lettore, invito firma col link giusto e 409 sul locatore sequenziale, conferma scheda one-shot; §1f: ogni firma STAMPA lo stato sulla proposta (rail PA), 🖊 send-sign su contratto già firmato non manda email e ristampa la proposta, mai una proposta fantasma |
  | `tests/aspi/run.mjs` | l'iter ASPI: la checklist blocca SOLO senza contratto (il resto avverte, dichiarato nell'email), l'invio raggiunge il referente con l'operatore in copia e gli allegati veri, la fattura col markup non si duplica MAI (id deterministico), 'registered' non si degrada, l'auto-invio parte solo con la manopola girata |
  | `tests/viewings/avail.mjs` | griglia slot: passi, gap 15', preavviso, orizzonte, maxPerDay, DST, token del link cliente |
  | `tests/viewings/telegram.mjs` | card Telegram visite: callback ≤64 byte, escaping HTML |
  | `tests/viewings/busyics.mjs` | il calendario Workspace nella griglia: impegni ICS bloccano gli slot (TZID, ricorrenze, EXDATE, RECURRENCE-ID, all-day busy/free), eventi BOOM filtrati, maxPerDay immune, cache + fail-open |
  | `tests/viewings/availability-ui.mjs` | la regola della disponibilità: parsing delle finestre (rifiuta 19:00-15:00, sovrapposte, "mattina"), default console == default server, anteprima che non promette slot inesistenti, avviso conflitti (sovrapposizione col nome, fuori finestra, giorno chiuso, non con sé stessa) |
  | `tests/viewings/gap.mjs` | la geometria della giornata: stesso immobile a catena (gap 0), viaggi reali tra zone (clamp 15–45'), video piatto, blocchi legacy identici a prima |
  | `tests/regista/run.mjs` | Il Regista: grammatica dei promemoria (IT/EN, accenti, "il 16/08", range che non sono date), id deterministici ≤64B, inviti calendario dei task, foglio di chiamata (escaping, viaggi, catene, giorno vuoto) |
  | `tests/recovery/run.mjs` | Il Recupero: chi diventa lead (PFS/SERVICE/RESERVE) e chi recap (PA/DEPOSIT/RENT), i test dell'operatore mai, id deterministico, lingua dalle parole del cliente |
  | `tests/reverse/run.mjs` | La ricerca rovesciata: legge budget/taglia/zona dalle parole vere e dalla casa richiesta, e soprattutto **chi non va MAI disturbato** — morti, inquilini, chi quella casa l'aveva già chiesta, chi era già stato avvisato, chi la troverebbe fuori budget |
  | `tests/wizard/health.mjs` | Il guardiano del bot sul Mac: il wrapper saltato lo dice UNA volta (non 96, non mai), il documento assente tace 24h e poi parla, offline batte tutto, il ritorno si sente sempre |
  | `tests/pfs/health.mjs` | Allarmi del radar: una fonte BLOCCATA all'origine parla una volta sola (200 run → 1 messaggio), un guasto vero si dirada invece di gridare ogni 6h (40 giorni → 8 promemoria), i primi due intoppi non svegliano nessuno, e il ritorno si sente sempre |
  | `tests/pfs/eyes.mjs` | Gli occhi di Homie sul radar PFS: nella lista di lavoro non entrano ricerche spente o con URL rotti, la manopola manuale (`urlOverride`) vince sempre, e — la regola che conta — un radar CIECO (403/captcha su tutte le ricerche) non passa mai per un mercato fermo |
  | `tests/whatsapp/replies.mjs` | Le risposte rapide di WhatsApp: un messaggio che si manda a occhi chiusi mille volte non può contenere un link morto (le rotte si deducono dal repo, non da una lista), i prezzi non possono divergere da `api/_catalog.js`, il link recensione apre le stelline e non la scheda Maps, e il documento in `docs/` non può restare indietro |
  | `tests/radar/run.mjs` | Il Radar 2.0: vie diverse non si fondono MAI (il falso gemello nasconde una casa al cliente), stessa-fonte esige un segnale identitario, il fiuto tace senza campione e chiama 'sospetto' le truffe, le vedette vedono solo il futuro e mai due volte la stessa casa, il Valutatore corregge sui canoni FIRMATI e dichiara le basi, e col radar ROTTO l'ingestione PFS spinge comunque — il giro vero su Firestore in memoria, digest email compreso |
  | `tests/whatsapp/run.mjs` | Da WhatsApp a lead senza AI: il rumore resta fuori (👍, "ok") e la persona vera entra, l'inquilino che scrive per la caldaia non inquina la pipeline, un lead per persona anche col numero archiviato in formato diverso (nazionale vs internazionale), una risposta umana zittisce il Commerciale. Guida il handler VERO su un Firestore finto in memoria |
  | `tests/phone/run.mjs` | Il Centralino, entrambe le porte. Segreteria: chiave derivata mai regalata, disclosure GDPR pinnata nel saluto, retry Twilio senza doppioni, Whisper/AI/Telegram giù non perdono MAI la chiamata. Receptionist ElevenLabs: firma HMAC rifiutata (anche stantia) senza scritture, nel lead SOLO le parole del CHIAMANTE (mai quelle dell'agente — la lingua della bozza esce dalle sue parole), audio e trascrizione in QUALSIASI ordine, tools in chiamata con auth e catalogo che esclude gli affittati. Handler veri su Firestore in memoria + giunzioni asserite sui file |
  | `tests/whatsapp/demand.mjs` | Il misuratore della domanda: ogni intenzione dimostra di saper riconoscere una frase vera (un pattern inerte sotto-conta in SILENZIO), "business" non diventa una domanda sui bus, la classifica è per tempo risparmiato e non per frequenza, sotto campione niente percentuali, e ciò che il motore non sa nominare esce con le parole vere |
  | `tests/miniera/run.mjs` | La Miniera: il join aggancia la persona in OGNI forma del numero (parità con `_lead.js`, JID senza `+` guarito), i veti del libro dei silenzi (inquilini/firmati/morti/oltre 120gg MAI nel re-ingaggio), sotto campione NIENTE percentuali (per mutazione), il verdetto motivato coi numeri, parità cross-linguaggio con l'estrattore Python, handler vero su Firestore in memoria |
  | `tests/fiducia/run.mjs` | La scala della fiducia: parte da solo SOLO il provato (campione ≥30 + tasso ≥95%, sulle decisioni dell'OPERATORE — gli auto-invii non si contano), la prima risposta AI mai (nemmeno accesa a mano), le parole legali/di rabbia tornano a un umano, ✋ Ferma e kill switch vincono anche sulle bozze già armate, e coi DEFAULT non parte niente. Giro vero su Firestore in memoria con l'executor reale |
  | `tests/segretaria/run.mjs` | La Segretaria: parla SOLO sulle chat consegnate col 🤖 (e la consegna marca la conversazione che riceverà davvero il traffico — CID persistito e verificato, anche dopo la creazione del lead), mai con inquilini, mai oltre i tetti; l'eco della sua stessa risposta non la spegne, un messaggio manuale dell'operatore sì; un link fuori dominio o una trattativa diventano escalation con card 🖐, MAI un invio. Handler vero su Firestore in memoria |
  | `tests/wizard/local_brain.py` | Il cervello gratis del bot wizard (`python3`): cosa capisce senza modello e — più importante — cosa deve rifiutarsi di capire. Una domanda ("Levico è affittato?") non può diventare una scrittura; un annuncio nuovo dettato non può diventare la modifica di uno esistente. Estrae le funzioni pure dal bot via AST: gira senza `.env`, senza Telegram, senza rete |
  | `tests/apply/run.mjs` | chi fa APPLY dal sito arriva all'operatore: email a BOOM con Reply-To sul candidato (e mai prima della scrittura), fasce di reddito/garante/firmatari che non si perdono, la finestra `status == 'new' limit 50` senza ordine RIPRODOTTA (il lead nuovo ne restava fuori) e chiusa da `pendingNewLeads`, Brain e card Telegram sul lead appena arrivato con gli handler veri, e il listener del portal che lo mostra senza ricaricare |
  | `tests/executive/run.mjs` | BOOM Executive: il professionista in trasferta resta un TENANT nella macchina piena, il datore dichiarato (`employer`) non viene scambiato per l'honeypot (`company`), la voce B2B tace col tenant e parla con l'ente — con la guardia PRIMA della spesa, asserita sull'ordine nel sorgente |
  | `tests/verbale/run.mjs` | verbale consegna chiavi: il PDF vero (WinAnsi-ostile compreso) viaggia in allegato a conduttori/co-conduttori/proprietario/admin, owner solo sui contratti dei propri immobili (403 = zero scritture), firme richieste per entrambi i lati, sul contratto restano solo i NOMI mai i dataURI |
  | `tests/inventario/run.mjs` | inventario dal video (101 check): il video non dichiara mai "buono stato" (solo difetti e oggetti nuovi, e il declassamento viene detto), una condizione non dichiarata alla consegna non diventa MAI un danno alla riconsegna (mutazione), `analyze` non scrive niente, un elenco non riguardato non diventa un documento, e il verbale smette di dire "arredi pattuiti" |
  | `tests/inventario/ui.mjs` | l'inventario in un browser vero a 390px: il video registrato al volo diventa fotogrammi (immagine vera, non quadrati neri), il filmato NON viene mai caricato, l'operatore corregge una riga e quella diventa 'human', il cancello della conferma tiene |
  | `tests/contractpdf/run.mjs` | il PDF del contratto in UNA copia (jsPDF REALE): l'impaginato condiviso produce Allegato B/C con le ancore firma, la conversione PA lo scrive da sola (e con Storage giù il contratto nasce comunque), send-sign sana i pre-fix PRIMA dell'email (ordine asserito sulla sorgente), la prima apertura di /sign è l'ultima rete, e MAI una rigenerazione sotto una firma viva (mutazione) |
  | `tests/sign/lang.mjs` | /sign bilingue guidata in un browser vero (demo mode): default per ruolo (locatore IT, inquilino EN), toggle che ridisegna lo step corrente in entrambe le direzioni, percorso intero tradotto, Skip OTP che non blocca, link WhatsApp presenti. Si auto-skippa senza playwright |
  | `tests/scalo/run.mjs` | LO SCALO lotti 1-4: la carta d'imbarco dice la verità (visita annullata/standby = Wallet spento e DETTO, codici di rotta solo dal lessico — mai inventati, pass viewing per navigazione vera mai blob:), il lessico `js/scalo-codes.js` in UNA copia (alias lungo batte il corto, parole intere, ambiguo → null, bmCode derivato), il flight status di /viewing (countdown SOLO sui momenti veri di _moments, stato temporale mai "già spedito"), il check-in di /book (la carta SOLO sulla confermata — mai sulla pending — con applyApprovalCopy unico posto delle parole), l'idrante di /board (corsie SOLO da BOOM_DISPO.marketLane — closed fuori, illeggibile = ASK mai NOW, ETA dall'iso del motore, fail-open sulla fotografia di build), la rotta di /casa (tappe = FATTI del contratto: signatureStatus, depbal, startDate, endDate−90 — l'aereo sulla prima non compiuta, niente rotta senza contratto) e il timbro di apartment-detail (visibile sempre, batte una volta, fermo con reduced-motion). Lotto 4: il handler VERO di /api/meteo su Firestore in memoria (whitelist che non lascia passare un campo non dichiarato, sotto campione SOLO il nome, cache CDN, solo GET), meteo.html che non tocca mai Firestore, lo sweep della plancia (blip = gli stessi item della strip, angolo dichiarato disposizione), e le og carte PNG verificate nei byte (IHDR 1200×630) |
  | `tests/mandato/run.mjs` | il mandato a firmare: spunta a parte sulla proposta (mai dedotta, solo se offerta ESPLICITAMENTE — assente = non offerto), la foto delle condizioni approvate presa all'accettazione (v2: immobile, parti, modello, date, soldi, oneri, clausole) è la base che conversione e firma verificano (409 con `changed`; il contratto non fa mai da base; v1 ancora valutato con la sua regola), la strada automatica non perde consenso e mandato, al posto del conduttore SOLO col mandato (403), chi ha firmato resta stampato su pagina firme/certificato/scheda ARPE/pack; il consenso della proposta firma anche la scheda 2/B (pagina == server, hash); la Valutazione BOOM esce dall'immobile con la scheda di calcolo brandizzata a pagina 2 e i buchi dichiarati |
  | `tests/ai/run.mjs` | La Centrale AI: coi default TUTTO in cloud, `localOk:false` mai in locale, PDF → cloud, immagine → solo con modello visivo, locale giù → cloud dichiarato, ombra che misura senza toccare la risposta (e non salva un cloud giù), contatori atomici col costo dal listino, nei log mai contenuto, porta HTTP (401/403/400 senza scritture), STT locale-prima, anti-deriva chiamanti⇄registro |
  | `tests/safari/boot.mjs` | nessuna superficie autenticata resta appesa su un loader |
- PWA support via `manifest.json` and `sw.js` service worker — registered on
  the 3 portals via `BoomPortal.registerServiceWorker()`

## Common Tasks

**Add a new apartment page**: Copy an existing `apartment_*.html`, update content and Firestore document ID.

**Add a new API endpoint**: Create a file in `/api/`, export a default handler `(req, res) => {}`. It auto-deploys as a serverless function.

**Modify pass design**: Edit pass type config in `/api/generate-pass.js`. Assets in `/pass-assets/[type]/`.
