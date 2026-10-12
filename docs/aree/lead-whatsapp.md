# Lead e WhatsApp — ingresso dei contatti, Lead Brain, WhatsApp, richiamo, risposte rapide, Miniera

> Dettaglio e storia di quest'area, spostati da CLAUDE.md il 12/10/2026 senza
> riscrivere nulla: stesse sezioni, stesso ordine. Le novità dell'area si
> aggiungono QUI (3-8 righe nella sezione giusta: cos'era, cosa cambia, dove
> sta il test). La mappa del sistema è in `CLAUDE.md`, le priorità in `ORA.md`.

### POST `/api/homie/inbound`
Webhook called by the Mac-side Homie agent when it filters a new lead from Immobiliare/Idealista/WhatsApp/intake. Auth via `X-Homie-Secret` header. Writes to the `leads` collection. Same schema cockpit-preview.html + portal.html already read — no fork.

### POST `/api/homie/action`
Webhook for Homie's proposed actions (reply draft, schedule viewing, qualify, archive). Writes to `action_queue` collection. Supports idempotent retries via `contextHash` field and auto-apply for high-confidence tier-1 actions.

### GET/POST `/api/leads/scan-inbox` (cron */10 min)
Server-side ear on the portals: reads the Gmail mailbox over IMAP for
Immobiliare/Idealista/Casa.it/Subito REQUEST emails ("hai ricevuto una
richiesta" — saved-search alerts stay with pfs/scan-inbox), extracts the
prospect via Claude haiku (never invents), matches the listing against the
real catalog, dedupes per email-message (memory doc `heartbeat/leads-inbox-memory`) AND per person
(same email/phone in 7 days — so Homie's Mac-side ingestion never
duplicates), and writes the same `leads` schema as `/api/homie/inbound`.
Heartbeat `pfsRadarHealth/leads-inbox`. Auth like the PFS crons; `?dry=1`.
Downstream: `api/telegram/notify-pending` (every minute) now ALSO pings
brand-new leads instantly — context card + one-tap "Apri WhatsApp" (wa.me)
when there's a phone — while the Commerciale's AI reply draft follows via
the usual approval card.

### Lingua delle risposte (`api/_lang.js`)
`replyLang(src)` decides IT vs EN from what the person ACTUALLY wrote
(Italian function words + accents vs English markers), falling back to an
explicit `language` flag and finally to **English** — BOOM's house language.
Used by the Telegram lead card's pre-filled WhatsApp message, the
Commerciale's drafts and its follow-up template. Fixes the bug where
`leads/scan-inbox` stored `language:'it'` by default, so every pre-filled
reply came out in Italian even for an English-speaking expat; the scanner now
stores `null` when the language is unknown.

### GET/POST `/api/leads/brain` (cron */10 min, offset :03)
IL LEAD BRAIN — server-side replacement for Homie's per-lead Sonnet grading
(~2k tok/lead + ~10k/day AI-blocking injections). Stage 0: free rules
(injection/newsletter regex → dead+archived, property-rented lookup,
deterministic score from phone/email/message depth/expat-EN/employment/
budget/move-in signals; confident highs and lows graded without AI — only
the ambiguous middle band proceeds). Stage 1: ONE batched haiku call per
run (≤20 leads/call, `stage0()` exported+tested, hard daily cap 12 calls in
`heartbeat/lead-brain-budget`). Never auto-archives a reachable human (unlike
Homie's score<45 rule): spam dies, thin-but-real stays C. Writes grade/
gradeReason/intent/confidence on the lead; dead → status archived (the
Commerciale never spends tokens on them). notify-pending shows 🔥A/🟢B/🟡C,
sorts A first, never pings dead. Heartbeat `teamHealth/lead-brain` (/team).

### POST `/api/apply-lead`
Public lead-capture for the apartment-detail APPLY/RESERVE/WAITLIST flow.
Fired (non-blocking) when a visitor passes the quick eligibility check. Body
`{ name, email, phone, listingId, listingName, listingPrice, zone, kind,
waitlist, income, guarantor, household(solo|couple|family|flatmates),
occupation(employed|self-employed|student|relocating), moveIn, durationMonths,
company(honeypot) }`. Same hardening as `/api/canone-lead` (honeypot, per-IP
rate limit, clip/num sanitizers). Writes to `leads` in the exact portal/
cockpit schema (`status:'new'`, `source:'web'`, `intent:apply|reserve|waitlist`,
qualification snapshot in `message` + `raw`) so every serious applicant lands
in the pipeline even if they never open Stripe. Returns `{ ok, id }`.

**LA LEZIONE DEL 30 SETTEMBRE 2026 — «chi fa apply non lo vedo: né nei lead,
né via email».** Letto nei log e nella casella, non dedotto: due candidature
vere (16:38 e 16:43 UTC) → 200, lead scritto, conferma partita al CANDIDATO.
Fra quel lead e l'operatore c'erano tre buchi, chiusi insieme:
- **Nessuna email a BOOM.** La porta scriveva solo al candidato. Ora ogni
  candidatura arriva anche all'operatore (`LEADS_NOTIFY_EMAIL` →
  `ADMIN_NOTIFY_EMAIL` → valentino@boom-rome.com), IT, con fascia di
  reddito, garante, firmatari, ingresso, tasto WhatsApp precompilato e
  **Reply-To sul candidato** (`sendEmail` accetta ora `replyTo`). Le due
  email partono in parallelo sotto lo stesso tetto di 8s, DOPO la scrittura;
  `ackEmailAt`/`operatorEmailAt` si timbrano solo se l'email è partita
  davvero (prima `ackEmailAt` si scriveva anche a timeout vinto). Il testo
  del candidato è escapato in entrambe.
- **La finestra a caso** (`api/leads/_fresh.js`). Brain e notify-pending
  leggevano `status == 'new', limit 50` SENZA ordine: Firestore restituisce
  i primi 50 per id automatico (casuale). Un lead resta `new` finché
  l'operatore non risponde, quindi oltre 50 aperti una candidatura nuova
  poteva non essere votata né notificata su Telegram MAI (gli stessi 50 id
  bassi occupavano la finestra a ogni giro). `pendingNewLeads()` affianca
  alla lettura storica la finestra recente ordinata per `createdAt`
  (timestamp E stringa ISO — `recover-checkouts` scrive stringhe, e
  Firestore confronta per tipo); Brain 7 giorni, notify-pending 3. Solo
  indici a campo singolo.
- **Il portal cieco.** I lead si leggevano una volta sola nel carico pigro
  del boot: a portal aperto la candidatura non compariva. `startLeadsListener`
  (admin, stessa query del boot) li tiene vivi: toast «Nuovo lead: X → casa»,
  notifica del browser a scheda nascosta, badge e Oggi aggiornati; ridisegna
  solo la pagina Lead (mai l'intera Oggi).
- **La qualificazione buttata via.** `apartment-detail.html` manda reddito e
  garante come FASCE di testo (`1500-2500`, `yes-italy`) e `signers`; la
  porta accettava solo un numero e `=== true`. Ora `incomeBand`,
  `guarantorType`, `signers` restano in `raw` e nel messaggio (mai un
  numero inventato dalla fascia); `income: 0` della pagina classica non
  stampa più «income €0/mo».
Un'applicazione **non** crea un cliente: il lead diventa cliente dalla
conversione (proposta → contratto → profilo inquilino). Test:
`node tests/apply/run.mjs` (handler veri su Firestore in memoria che ordina
per NOME come quello vero: la finestra a caso riprodotta con la lettura
vecchia, Brain e card Telegram sul lead nuovo, listener del portal in vm).

### POST `/api/search/save`
Public save-search endpoint for the apartments discovery page. Body
`{ email, label?, criteria{q,budgetMax,moveIn,beds,baths,furnished,video,
zones[],feats[]}, resultCount?, company(honeypot) }`. Validates email,
honeypot + per-IP rate limit (same hardening as `/api/canone-lead`), writes
to the `savedSearches` collection under admin creds (`status:'active'`,
`lastNotified:null`). Returns `{ ok, id }`.

### GET `/api/search/matcher` (cron 3×/day)
The saved-search alert engine. Matches every active `savedSearches` doc
against rentable `listings` (mirrors the discovery page's pass()); first
run per search SEEDS silently (`notifiedIds`) so subscribers only hear
about listings that appear AFTER saving; later runs email a digest (max 6
homes) via Nodemailer with /listing/:id links + one-click unsubscribe
(`/api/search/unsub?id&e` → status:'unsubscribed'). `?dry=1` reports
without emailing. Auth: Vercel cron Bearer CRON_SECRET.

### POST `/api/homie/wa-outbox`
WhatsApp OUTBOX for the Mac-side Homie agent: approved WhatsApp replies go
out AUTOMATICALLY. Executor marks the action executed (wa.me link kept as
manual fallback); Homie polls `{op:'pull'}` (approved-and-unsent, executed
<48h, max 10/pull), sends via wacli/send_whatsapp.sh, then `{op:'ack',
actionId, ok, error?}` — delivery state lives on the action doc
(`waSentAt`/`waSendError`); outcomes must be checked before retry. Auth
`X-Homie-Secret`.

**Registro degli esiti (21/09/2026):** `agent/messages.send` prima chiamava
«inviato» anche il solo link WhatsApp. Ora risultato (`whatsapp.status`),
`messageLog.delivery` e `activityLog.details.delivery` distinguono WhatsApp
`prepared` da email `sent`; i titoli dicono quale canale è stato preparato/inviato.
Sono esiti storici dello strumento: la ricevuta WhatsApp resta sull'azione,
tramite ack Mac. Flusso e retry invariati. Test: `segretariaconferma`.

**Ritiro e scadenza coerenti (18/09/2026):** ogni pull legge una pagina di 50
azioni e salva con CAS in `heartbeat/wa-outbox` il prefisso controllato prima
delle claim; un diniego non nasconde i candidati successivi. Restano una verifica
di proposta e dieci payload per pull. `_wa-delivery` condivide la soglia 48h:
una bozza mai ritirata scaduta o senza data verificabile diventa `needs_review`.
Ricevute terminali/claim conservate, nessun reinvio incerto o attivazione Mac;
il flusso legacy conserva i limiti precedenti. Prove: `segretariaconsegna`,
`segretariaesecuzione`, conferma/UI e sei mutazioni di scadenza e paginazione.

**Invio singolo selezionato (21/09/2026, attivazione separata):** `wa-outbox-single`
isola una proposta già approvata: inspect senza scritture, claim con revisione/impronta
e ACK del solo bersaglio; endpoint o protocollo sconosciuti non ricadono nel pull.
Il worker `wa_outbox_single.py` conserva HOLD e lock/registro esistenti, non avvia
il servizio ordinario, non recupera altre ricevute e non reinvia esiti incerti.
Nessun mirror generico o nuova autonomia: esecuzione esplicita dopo approvazione.
Prove sintetiche: `segretariainviosingolo`, `homieinviosingolo`; istruzioni e limiti
in `docs/HOMIE_INVIO_SINGOLO.md`. Il trasporto installato non cambia con il commit.

**Risposta claim incerta (21/09):** un 5xx, timeout o status 0 può arrivare dopo
il commit: il worker restituisce `claim_outcome_unknown`, senza mittente o retry.
Solo i rifiuti 400/401/405/409 sono `claim_rejected`; il 404 resta indisponibilità.
Le altre risposte inattese richiedono riconciliazione, senza inventare ricevute.
Prove: worker `test_19`, test JS/Python con claim realmente acquisito e risposta
persa/500/503/504/0, più mutazione della vecchia classificazione.

**CAS senza riscrivere dati (21/09):** i controlli versione in conferma,
esecuzione, consegna e ritiro di vecchie approvazioni usano `fields: {}`.
`fsCommit` conserva la maschera vuota e le precondizioni nello stesso batch;
non materializza null né riconverte timestamp/mappe per verificare la versione.
Una maschera assente sostituirebbe il documento: non ometterla o saltare il no-op.
Prove RAW con encoder vero, claim reale e corse: `segretariafirestorenoop` e
`segretariafirestorenoopmutazioni`; scritture di contenuto e veti invariati.

### POST `/api/homie/message` — da WhatsApp a lead, senza far pensare nessuno
La CHIAVE DI VOLTA che permette a Homie di smettere di analizzare (mandato
completo + prompt da incollare: `bot/HOMIE.md`). Finché Homie leggeva ogni
messaggio con Sonnet era lui a decidere "questa è una persona che cerca
casa" e a creare il lead; senza quel pensiero, un WhatsApp da un numero
sconosciuto finiva in `conversations` e **basta** — il Lead Brain non lo
vedeva, `notify-pending` non lo mandava, il Commerciale non scriveva nulla
(tutti interrogano `leads`). Il cliente spariva dal telefono e sopravviveva
solo nell'Inbox del portale, che richiede un desktop.
`api/homie/_lead.js` rende la decisione **deterministica e gratis**:
- inbound da un numero che non è già un contatto BOOM → doc `leads` nello
  schema che leggono già `homie/inbound` e `leads/scan-inbox`, e da lì parte
  la macchina esistente (Brain in batch → ping Telegram → Commerciale);
- `isNoise()` scarta SOLO il non-messaggio (un 👍, un "ok") — allo spam pensa
  già `stage0` del Brain, gratis: qui non si giudica se la persona è seria;
- inquilini/proprietari/clienti PFS (risolti per telefono) **non** entrano in
  pipeline: scrivono per la caldaia, non per affittare;
- un lead che esiste si ARRICCHISCE invece di duplicarsi — `mergeMessage()`
  accumula i pezzi di una chat ("ciao" · "cercavo un bilocale" · "per
  settembre"), così `replyLang` vede la lingua vera e il Commerciale scrive
  sul contesto completo, non sul "ciao";
- **`direction:'out'` marca il lead `contacted`**: se l'operatore ha già
  risposto a mano, il Commerciale tace — due voci sulla stessa conversazione
  sono una figura che non si recupera;
- `phoneVariants()` — WhatsApp consegna SEMPRE l'internazionale
  (`+393334444444`), i portali salvano il nazionale (`3334444444`): cercare
  una forma sola sdoppiava la stessa persona in due lead con due risposte
  diverse. Ora la lettura prova tutte le forme e la scrittura normalizza
  ALLA PORTA (`buildLead` + `leads/scan-inbox`), così il problema smette di
  rigenerarsi.
`notify-pending` tratta i lead WhatsApp come **vivi**: niente grazia di 4
minuti per il grade (quella persona sta digitando adesso), header
"💬 ti ha scritto su WhatsApp", e il messaggio precompilato è una RISPOSTA,
non una presentazione — "Grazie per il tuo interesse" sotto il messaggio che
ti ha appena scritto legge come un contatto a freddo.
**`/api/homie/inbound` ora deduplica** (prima faceva `fsCreate` e basta:
andava bene finché Homie era l'unica fonte). Nella finestra in cui Homie
cambia mandato la stessa persona arriva da DUE porte — l'inoltro grezzo
parte all'istante, `inbound` dopo l'analisi, quindi il duplicato lo creava
proprio `inbound`. Deduplicando lì, **qualunque ordine** produce un lead solo
e i due lati non hanno bisogno di essere coordinati: si possono tenere accesi
insieme per giorni.
Test: `node tests/whatsapp/run.mjs` (Firestore finto in memoria, si guida il
handler vero; copre entrambi gli ordini della transizione, verificati per
mutazione).

### GET/POST `/api/leads/match-listing` — LA RICERCA ROVESCIATA
L'asimmetria che nessuno sfruttava: si pubblica un annuncio e si **aspetta**
che degli sconosciuti lo trovino, mentre in archivio ci sono persone che tre
settimane fa cercavano esattamente quello — e a cui non lo dice nessuno. BOOM
faceva marketing al traffico freddo avendo una lista calda. I lead sono un
asset che si raffredda; questo lo riscuote, a **costo zero** (nessun modello,
solo aritmetica su dati già presenti).
**Il trucco**: un lead non ha un modulo compilato, ma ha due segnali migliori
di qualunque form — (1) **la casa che ha chiesto È il suo briefing** (chi
scrive per un trilocale da €1.400 a Pigneto cerca quello: zona, taglia,
fascia ±15%), e (2) **le sue parole** ("bilocale a Trastevere sotto i 1200").
`leadCriteria()` li deriva; `scoreLeadForListing()` punteggia con la stessa
aritmetica di `homie/_match.js` (budget 50 · camere 30 · zona 20) così i due
motori non danno verdetti diversi sulla stessa casa.
**Tre mestieri tenuti separati** — mescolarli era il difetto trovato dai test:
il **veto** decide chi è eleggibile, la **soglia** se la casa gli calza (sul
punteggio BASE), la **freschezza** solo l'ordine. Moltiplicando tutto, un
match perfetto di due mesi fa spariva sotto soglia, indistinguibile da uno
mediocre.
**I veti** (più importanti del punteggio: la casa sbagliata alla persona
sbagliata costa la reputazione, non un'occasione, e parte dal TUO numero):
lead morto · già inquilino · senza recapito · **la casa che aveva già
chiesto** · già avvisato per questa casa (`notifiedListings`) · oltre
`MAX_AGE_DAYS` 120 (a Roma una ricerca di 4 mesi fa è finita) · fuori budget
oltre il 20%. Ogni veto **dice perché**: un'esclusione silenziosa è
indistinguibile da un bug.
Risposta: persone ordinate, col motivo, e **il messaggio già scritto nella
LORO lingua** (`replyLang`) che nomina la casa che avevano chiesto — la
differenza fra "abbiamo una novità" e "ti sei ricordato di me". POST
`{listingId, notify:[ids]}` segna chi hai contattato, altrimenti in due
giorni la funzione da utile diventa fastidiosa.
**Nel bot**: parte **da sola** dopo ogni pubblicazione (proattiva: non si
chiede, si dice quando serve), più `/chicerca <ID>` e la frase naturale "chi
cerca Pigneto?". La parola *interessati* NON è stata riusata — significa già
"chi ha scritto per questa casa" (`/interessati`), e ri-puntare una parola con
un significato consolidato è il modo più rapido per rendere inaffidabile uno
strumento; il confine è pinnato nei test da entrambi i lati.
Auth: `X-Wizard-Secret`/`X-Homie-Secret` (il bot) o Bearer admin.
Test: `node tests/reverse/run.mjs`.

### GET/POST `/api/leads/richiamo` + `/richiama` — IL RICHIAMO
Lo scenario dell'operatore: *"sparisco una settimana, poi dico: ricontatta
tutti quei numeri con gli orari — e non perdo neanche un lead"*. La Miniera
ha misurato il buco (544 ultime parole del cliente senza risposta); questo
lo chiude SU ORDINE. `/richiama <casa|ID>` (Telegram, webhook server) →
tutti quelli che hanno chiesto QUELLA casa (+ gli affini via `_reverse.js`,
coi suoi veti); `/richiama recenti [gg]` → i lead recenti senza seguito.
Anteprima su Telegram con i numeri, il messaggio tipo e gli ESCLUSI col
motivo; **UN tap (✅) = la firma sull'intera campagna**: WhatsApp a chi ha
un numero (via il postino `wa-outbox`, ~10 ogni 5′ — ritmo umano), email
agli altri (Nodemailer, personale, mai un template marketing), ognuno nella
SUA lingua (`replyLang`), con il link `book?listing=` con gli slot VERI.
- `api/leads/_richiamo.js` — motore + operazioni in un posto solo (pattern
  `_apply.js`): `vetoRichiamo` (morti, archiviati, convertiti, contatti
  BOOM veri da contracts/users/pfsClients in TUTTE le forme del numero, chi
  ha già una visita in agenda, cooldown 7gg, oltre 120gg — ogni esclusione
  DICE perché), `channelFor` (numero→WhatsApp, altrimenti email),
  `buildCampaign` (interessati + affini senza sovrapposizioni, tetto 60),
  `prepareCampaign`/`sendCampaign`/`cancelCampaign`. Idempotenza per
  costruzione: `pending→sending→sent`, un secondo tap → 409, MAI un doppio
  invio; il cooldown nasce sul lead a invio riuscito (`lastRichiamoAt`).
- `api/leads/richiamo.js` — porta HTTP sottile (auth come match-listing;
  maxDuration 60). `api/telegram/_richiamo.js` — comando + callback
  `rk:`/`rx:` (≤64B) nel webhook; casa risolta per nome SENZA indovinare
  (ambiguo → elenco, mai un match a caso — la lezione di interpret).
- `richiamoCampaigns` admin-only in firestore.rules (lezione propertyLocks).
- Test: `node tests/richiamo/run.mjs` — veti per mutazione, 401 senza
  scritture, giro VERO prepare→tap→`wa-outbox` (handler reale)→email
  (nodemailer mockato via loader), idempotenza, cooldown che protegge dal
  secondo richiamo, comando che non indovina mai.

### Le risposte rapide di WhatsApp (`js/whatsapp-replies.js` + `/risposte`)
La conversazione resta l'unico pezzo che la macchina non fa: il Commerciale
propone la PRIMA risposta, il Gestore i solleciti, il journey le email — ma
tutto quello che viene dopo si scrive a mano, di corsa, dal telefono. Queste
sono **15 risposte rapide da caricare** in WhatsApp Business, più 15 nel mazzo (`/scorciatoia` in chat),
più i due messaggi automatici e le etichette. Coprono l'intero giro: cliente
EN e IT, inquilino in casa, proprietario, aziende/enti, La Réunion, e i
messaggi che accompagnano un link personale.
- **Una copia sola**: i testi vivono in `js/whatsapp-replies.js` (UMD →
  `window.BOOM_WA`, come boom-geo). `risposte.html` (`/risposte`, in sidebar
  Console, noindex+no-store) li mostra col tasto **Copia**, la ricerca, il
  filtro ⭐ prima fila e il segno "già caricata" (localStorage avvolto: Safari
  privato LANCIA). `docs/WHATSAPP_RISPOSTE_RAPIDE.md` si **genera**
  (`node scripts/wa-export.mjs`) — un documento riscritto a mano divergerebbe
  al primo cambio di prezzo, e un documento vecchio è peggio di nessuno perché
  sembra vero.
- **Le regole dure** (`tests/whatsapp/replies.mjs`, 78 check): un link dentro
  una risposta salvata deve essere una rotta VERA del sito — dedotta dal repo
  (file, cartella, rewrite/redirect, sitemap), non da una lista a mano; i
  prezzi citati sono agganciati a `api/_catalog.js` (se il Virtual Viewing
  passa a €99 il test si accorge che WhatsApp promette ancora €89); il link
  recensione passa la STESSA validazione delle email (`api/reviews/_lib.js`:
  la scatola delle stelle, non la scheda Maps); i segnaposto sono
  `[MAIUSCOLO]` — uno minuscolo si mimetizza in una frase e parte così.
- **Quattro nate dalla MISURA, non dal ragionamento** (agosto 2026, 1.004
  conversazioni vere lette dal misuratore): `/enwho` chi può abitarci —
  coppia, amici, figli, animali — **255 conversazioni su 1.004, una su
  quattro**, ed era scoperta; `/enfeat` arredo e servizi (95); `/endeal`
  trattativa (20); `/enres` residenza (17). Il catalogo scritto a
  ragionamento non le aveva: è il motivo per cui si misura prima di
  installare.
- **LA DOTTRINA DELL'UPSELL** (agosto 2026, riscrittura completa su richiesta
  dell'operatore: «premium, atipico, diretto»). Sette regole, tutte visibili
  nel testo di ogni messaggio: (1) non si vende il servizio ma **cosa saprai
  domani** — nessuno compra una "visita virtuale", compra il non mandare
  3.000€ a uno sconosciuto fidandosi delle sue foto; (2) **l'ancora è la
  perdita**, non il prezzo (€49 contro la clausola d'uscita non letta), e ogni
  risposta DICHIARA contro cosa vende (`sell.anchor`, mostrata in pagina);
  (3) il prezzo sparisce dentro una transazione già in corso — *scalato dalla
  commissione, rimborsato se non consegniamo*; (4) la prova è un **meccanismo**
  ("filmo la casa all'ingresso e all'uscita"), mai un aggettivo; (5) una porta
  sola, aperta una volta; (6) generosità asimmetrica — il primo passo è gratis
  e vale davvero; (7) prima persona singolare.
  **L'invariante che la tiene in piedi**: ogni servizio vendibile in
  conversazione deve avere la SUA risposta (`sell.service`), che ne dice il
  prezzo esatto e porta la garanzia accanto — senza, quel numero è solo una
  richiesta di soldi. Il test l'ha già usato per smascherare una dichiarazione
  falsa (`/prciao` diceva di vendere il pacchetto €349 mentre apre col calcolo
  gratuito: la porta è `/prpack`).
- **RISCRITTE SULLA VOCE VERA** (`scripts/wa-voce-locale.mjs`, agosto 2026 —
  29.255 messaggi dell'operatore). Le prime versioni erano scritte con la voce
  di chi le redige, non di chi le manda, e l'operatore le ha bocciate: «sono
  inutili». I numeri gli hanno dato ragione — **metà dei suoi messaggi sta
  sotto 17 caratteri**, 3 su 4 sotto 38, e **un link compare nell'1%**: testi
  da 800 caratteri pieni di link non erano risposte, erano muri. Ora si sta
  sotto i 400 (mediana 262) e il link è un'eccezione che deve valere il tap.
  La mossa che chiude è **chiamare** (11 volte fra i messaggi ripetuti), quindi
  la proposta di chiamata sta nelle risposte d'apertura. I **sei messaggi che
  già riscriveva a mano** ogni volta sono diventati sei scorciatoie
  (`enlead` 11× · `engone` 13× · `enlink` 15× · `enserv` 18× · `enblock` 11×),
  e i servizi quasi mai proposti — Virtual Viewing 1×, Deal Assistance 1×,
  Contract Check 2× su 180 giorni — hanno la loro occasione naturale
  (`enabroad`, `encheck`) invece di restare nel listino.
  **Avvertenza sul campione**: l'archivio wacli è il WhatsApp PERSONALE
  dell'operatore, quindi i conteggi delle intenzioni sono gonfiati dalle chat
  private (il `chi_abita 255×` vale meno di quanto sembra); i messaggi
  RIPETUTI, invece, sono inequivocabilmente lavoro.
- **Quindici, non cinquanta** (`bench: true` su tutto il resto). L'app ne
  accetta 50, ed è esattamente la trappola: cinquanta scorciatoie non si
  ricordano, quindi non si usano, quindi lo strumento muore nel telefono.
  Si installa ciò che serve QUESTA settimana — le sei che già riscrivevi a
  mano, più costi, documenti, chi può abitarci, arredo, visita, estero,
  contratto altrui, ricerca su misura, italiano e proprietario — e le altre
  restano nel mazzo: la pagina
  si apre già filtrata sulle 14, le rare si cercano e si copiano al volo.
  La promozione è un attributo, non una riscrittura: se una del mazzo torna
  spesso, si toglie `bench` e si carica.
- **Cosa NON entra**: i link personali (visita, Scheda, Magic Sign,
  pre-accordo, pagamento) sono per una persona sola e li genera il portale;
  nelle risposte `/op…` stanno come `[LINK]`. E niente che la macchina già
  faccia da sola, altrimenti si scrive in due sulla stessa conversazione.
- Da verificare a mano una volta: il link recensione in `/enrev` (deve essere
  lo stesso di `REVIEW_URL`) e `settings/payout`, senza cui il bonifico
  citato in `/enpay` non compare in `/casa`.

### GET/POST `/api/homie/miniera` — LA MINIERA (lo storico diventa un verdetto)
La risposta a "come rendiamo Homie game changer?": **si misura prima di
scegliere** (studio completo: `STUDIO_HOMIE_GAME_CHANGER.md`). Sul Mac ci
sono MESI di conversazioni WhatsApp (wacli); in Firestore ci sono gli ESITI
(lead → visite → contratti firmati) e le APPROVAZIONI (`action_queue`).
Uniti per telefono sono il dataset conversazione→esito che nessun
competitor ha — e il VERDETTO che ne esce decide quale potere costruire.
- **Lato Mac** (`homie-bridge/agent-os/bin/miniera.sh` +
  `miniera_extract.py`): estrae TUTTO lo storico wacli (tollerante alle
  varianti di campo), riduce ogni conversazione a UNA riga — conteggi,
  tempi, latenza di prima risposta, direzione dell'ultima parola, campioni
  corti (≤240/1200 char) — **mai l'archivio integrale** (D2); gruppi
  esclusi alla porta; salta gli invariati (hash `msgCount:lastTs`, parità
  cross-linguaggio testata); POSTa a lotti da 100. Il Mac fa SESSIONE,
  ogni giudizio sta nel motore server (regola di `bot/HOMIE.md`).
  **Trappola vera trovata dai test**: la parte utente di un JID WhatsApp è
  un internazionale SENZA `+` (`393331234567@…`) — nuda dentro
  `normalizePhone` raddoppiava il prefisso (`+39393…`) e il join mancava
  la persona; guarita a entrambe le porte.
- **Motore** `js/miniera-engine.js` (UMD `BOOM_MINIERA`, puro): join per
  telefono in TUTTE le forme (parità con `homie/_lead.js` testata),
  precedenza ruoli (chi ha firmato è un tenant, non più un lead), funnel,
  conversione per bucket di latenza (tassi SOLO dove il campione regge —
  lezione D4 del Perito), lingue via `replyLang`, orari Roma, obiezioni,
  **libro dei silenzi** (unanswered: l'ultima parola è del cliente, chiunque
  sia, col ruolo in chiaro; coldOpen: re-ingaggio con i VETI prima del
  punteggio — mai inquilini/proprietari/PFS, mai firmati, mai lead morti,
  mai oltre 120gg, mai senza un segnale vero), thread d'oro,
  `approvalStats` (la materia prima della scala della fiducia),
  `verdict()`: classifica motivata dei poteri candidati (Segugio, visite
  auto, velocità, playbook, dossier; radar-proprietari dichiarato NON
  misurabile dalle chat), `tgSummary` HTML-escapato.
- **Il misuratore della domanda** (`js/wa-demand-engine.js`, `BOOM_WADEMAND`,
  dentro lo stesso `op:'study'`): gli STESSI dati, seconda domanda — non
  "che potere costruire" ma **quali risposte rapide servono davvero**. 22
  intenzioni a grammatica chiusa (IT/EN, zero token) sui messaggi dei
  clienti: thread ridotti dal Mac (che portano l'esito) + `leads.message`
  (che esistono anche a Mac spento). Le nostre uscite (`action_queue`)
  stanno in un corpus SEPARATO: misurare la domanda con le nostre parole la
  gonfierebbe. **Si ordina per TEMPO RISPARMIATO, non per frequenza** — una
  domanda che arriva 40 volte e si liquida in dieci secondi vale meno di una
  che arriva 12 volte e ogni volta costa quattro minuti; il costo non si
  inventa, è la lunghezza VERA della risposta che la copre (~200 car/minuto
  col pollice, e fra due risposte si prende la più lunga, mai la somma).
  Conta per CONVERSAZIONE (tre "deposito" nella stessa chat = una risposta
  che avresti mandato una volta). Sotto 30 conversazioni classificate escono
  i conteggi e NESSUNA percentuale (lezione D4). Due uscite che valgono
  quanto la classifica: le **buche** (intenzione con volume e nessuna
  scorciatoia che la copra → una risposta DA SCRIVERE: oggi residenza,
  arredo/servizi, chi abita, trattativa) e l'**ignoto** (`unmatched`, con le
  frasi vere — una classificazione silenziosa è indistinguibile da un
  difetto). Finisce in `teamReports/miniera-<data>.domanda` e in un secondo
  messaggio Telegram dopo il podio. **La guardia che tiene in piedi tutto**
  (`tests/whatsapp/demand.mjs`): ogni intenzione deve dimostrare di matchare
  una frase vera — due difetti reali di questo tipo sono già stati presi
  così, un `\b` in coda a una radice tronca (`residenz`) e un `\\b` scritto
  in un pattern: entrambi non matchano MAI e sotto-contano in silenzio,
  cioè il rapporto esce sano e dice che nessuno chiede quella cosa.
- **Porta** (auth `X-Homie-Secret`): GET → stato + mappa id→hash (sync
  incrementale); POST `op:'threads'` → upsert idempotente in
  `minieraThreads` (id = sha1(chatId), admin-only in firestore.rules — la
  lezione propertyLocks); POST `op:'study'` → legge gli esiti reali,
  esegue il motore, scrive `teamReports/miniera-<data>`, recap Telegram
  col podio. Heartbeat `pfsRadarHealth/miniera` (allerta esistente dopo 3
  run falliti). maxDuration 60.
- Lancio dal Mac: `bash homie-bridge/agent-os/bin/miniera.sh` (`--dry`
  conta senza mandare). Test: `node tests/miniera/run.mjs`.
