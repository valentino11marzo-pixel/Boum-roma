# Fisco e proprietari — Fascicolo Fiscale, iter ASPI, Valutazione, rendiconto, conservazione, banca

> Dettaglio e storia di quest'area, spostati da CLAUDE.md il 12/10/2026 senza
> riscrivere nulla: stesse sezioni, stesso ordine. Le novità dell'area si
> aggiungono QUI (3-8 righe nella sezione giusta: cos'era, cosa cambia, dove
> sta il test). La mappa del sistema è in `CLAUDE.md`, le priorità in `ORA.md`.

### Il Fascicolo Fiscale (`api/fiscal/fascicolo.js` + `js/canone-engine.js`)
UN PDF, tre pagine, generato DAL CONTRATTO alla firma completa (dentro
`_finalize.js`, best-effort) e rigenerabile dalla console (`POST
{contractId, zonaCod?, parIdx?, mag?, mq…}` — override PERSISTITI su
`contract.canoneScheda`, la rigenerazione è stabile). Storage
`contracts/<id>/fascicolo-fiscale.pdf` → `contract.fascicoloFiscaleUrl`,
linkato nell'email CAF.
1. **SCHEDA PER L'ATTESTAZIONE DI RISPONDENZA** (accordo Roma 25/07/2023 +
   DM 16/01/2017): parti, catasto, superficie convenzionale coi
   coefficienti ufficiali, i 20 parametri ARPE derivati dalle feature REALI
   di immobile/annuncio (mai inventati — la mappatura è dichiarata sul
   documento), maggiorazioni provate (transitorio +10, classe energetica,
   attico; ammobiliato solo se `settings/canoneAccordo.pArr` è calibrato) e
   il VERDETTO: il canone pattuito rientra nella fascia di oscillazione o
   sfora di quanto (mai nascosto).
2. **DATI REGISTRAZIONE RLI** — i quadri da ricopiare sul modello AdE.
3. **SCADENZARIO** del contratto (le deadline a sistema).
`js/canone-engine.js` è il motore PURO condiviso (75 zone dell'accordo con
fasce A/B/C €/mq/mese, soglie subfascia B≥3/C≥7, regola del cap: gli
aumenti non superano il max di fascia, le riduzioni sì; `matchZone` non
tira mai a indovinare — ambiguo → null). Stessa aritmetica di
`scheda-canone.html` (il calcolatore/preventivatore admin). Tutto testo
PDF passa da `wa()` (WinAnsi-safe — la lezione del certificato FES).
**In console**: la PA admin mostra il VERDETTO LIVE mentre scrivi il
canone (✓ in fascia / ⚠ fuori, col max asseverabile — serve una property
con mq selezionata) e la ⚙ calibra `settings/canoneAccordo` (pArr
ammobiliato, pDur 3+2) — UN doc letto da console E Fascicolo. Nel portal
ogni riga contratto ha **📑 Fascicolo** (genera/apre il PDF; se zona o mq
mancano li chiede e li persiste su `contract.canoneScheda`) e **✓ RLI
registrato** (stampa `rliRegisteredAt`, chiude la scadenza "Registrare
RLI", rigenera il fascicolo — il loop registrazione si chiude in un tap).
La scheda di pagina 1 ricalca la scheda di calcolo VERA dell'associazione
(`reference/caf/2023_scheda_calcolo_canone_ARPE.docx`): stessi
coefficienti di superficie, stessi 20 parametri nello stesso ordine,
stesse maggiorazioni A–H, transitorio +10%. Le due opzioni a percentuale
LIBERA del modulo (>120mq "possibilità di diminuzione fino a −15%",
immobile vincolato/A1-A8) non sono automatizzate di proposito: sono
concessioni da negoziare, non dati derivabili.

**LA SCHEDA È IL MODULO ARPE, 1:1** (8/09/2026 — «sarà quello che mando
all'ARPE, no ASPI»). Pagina 1 era *modellata* sul foglio dell'associazione
ma non ERA quel foglio: titolo diverso («SCHEDA PER L'ATTESTAZIONE…»
invece di «SCHEDA DI CALCOLO DEL CANONE…», intestazione «Allegato 2/B»
assente), testata BOOM in cima, righe DECORRENZA/Stipulato/Registrato che il
modulo non ha, etichette della superficie riscritte («Superficie utile
calpestabile», «Box / posto auto esclusivo»), la riga CARATTERISTICHE
compressa in una frase, la griglia A–H su due colonne invece delle tre del
modulo con transitorio e vincolato dentro la griglia, il blocco del calcolo
in altra forma, e in coda un «l'organizzazione ATTESTA…» che sul modulo
non esiste (il modulo dice il contrario: «SCHEDA NON VALIDA AI FINI
DELL'ATTESTAZIONE» — è il foglio che le PARTI firmano; l'attestazione la
rilascia ARPE dopo). Ora `drawSchedaArpe()` riproduce il modulo sezione per
sezione con la SUA geometria (larghezze delle tabelle in twip / 20, tabelle
flottanti «X SI / NO» e «SI | NO» nella posizione del modulo, corpo 7–8pt,
pie' di pagina del modulo; unico refuso normalizzato: «VALIDI» → «VALIDA»).
Nessuna testata BOOM su quella pagina. `schedaFacts()` è PURA: tutto ciò
che la pagina stampa (bracket di superficie, pertinenze coi coefficienti,
parametri, A–H, zona/fascia/subfascia, il calcolo riga per riga, i due
importi) esce di lì e si testa senza aprire il PDF; `SCHEDA_TEXT` esporta
OGNI etichetta fissa e `tests/fiscal/scheda.mjs` la cerca parola per parola
dentro il `.docx` del modulo (anti-deriva: un'etichetta «migliorata» fa
cadere il test). **La scheda esce anche DA SOLA**: stessi fatti → PDF di
una pagina su `contracts/<id>/scheda-canone-arpe.pdf` →
`contract.schedaCanoneUrl` (+`schedaCanoneAt`), perché ad ARPE va la scheda,
non le pagine RLI/scadenzario che sono nostre. Viaggia come
`BOOM_Scheda_calcolo_canone_ARPE.pdf` nel Fascicolo completo a Valentino,
come `Scheda_calcolo_canone_ARPE.pdf` nel Foglio di registrazione, come
`03_Scheda_calcolo_canone_ARPE.pdf` nel Pack, ed è l'allegato «scheda»
dell'iter ASPI (che ricade sul fascicolo intero solo per i contratti nati
prima). Nel portal: **📐 Scheda ARPE** accanto a 📑 Fascicolo (apre il PDF
a sé; se non esiste lo genera col fascicolo). Due cose che il modulo
impone di DIRE anche se non ha la riga: il tetto dell'accordo (con
transitorio +10% la riga stampa 2.153,80 ma il massimo resta 1.958,00: la
nota lo spiega invece di lasciare due numeri in contraddizione) e il
pattuito sopra il massimo (sforamento esatto in nota, mai nascosto).
**Anche il calcolatore stampa il modulo** (`scheda-canone.html` →
«Stampa / Salva PDF»): la sua vista di stampa era una terza scheda —
titolo «SCHEDA PER LA ATTESTAZIONE…», riga Decorrenza/Stipulato/Registrato,
blocco «ATTESTA» — cioè un foglio diverso da quello che il fascicolo manda
ad ARPE. Ora è lo stesso modulo, sezione per sezione, con gli stessi numeri
del server (verificato: 89,00 mq · MEDIA 15,40/22,00 · 1.958,00 · nota del
tetto) — pre-verifica e fascicolo non possono più contraddirsi.
**Zona mai indovinata dalla via** (stessa release): `matchZone` cadeva
sulla ricerca per parola singola e «Via DELLA Lungaretta» diventava DELLA
VITTORIA, «Porta Pinciana» PORTA PORTESE, «Via del Monte» MONTE MARIO — un
COD. ZONA falso su un foglio che va ad ARPE. Ora le parole di
toponomastica sono stop-word (`STOP_WORDS`): ambiguo → null, e la zona la
mette l'operatore dal bottone. Senza zona o mq il foglio resta il modulo
vuoto, con parametri e pertinenze compilati perché sono fatti.

### L'iter ASPI (`api/fiscal/registra.js` + `api/fiscal/_aspi.js`) — registrazione & asseverazione in UN tap
LA DECISIONE È PRESA: il CAF/associazione è **ASPI** (referente Roberto
Ubertini, geometra — Roma, via S. Nicola da Tolentino; fa anche gli APE),
il canale è l'**email strutturata**. Prima l'operatore riceveva il
fascicolo CAF nella PROPRIA casella e lo inoltrava a mano, ricordando ogni
volta il corredo: identità + contratto per la registrazione (costo pratica
**€37**), più APE + planimetria + scheda di calcolo canone per
l'attestazione di rispondenza (**€100**). Ora:
- **`POST /api/fiscal/registra`** (Bearer admin). `op:'status'` → la
  fotografia per il pannello: checklist per ENTRAMBE le varianti (solo
  registrazione / registrazione+asseverazione), prezzi/costi in vigore,
  destinatario, stato invii. `op:'send' {contractId, kind, note?, bill?}`
  → l'invio vero.
- **`aspiChecklist()`** (esportata+testata) dice prima cosa parte e cosa
  manca. UNA sola voce blocca: il PDF del contratto (una richiesta di
  registrazione senza contratto è rumore). Tutto il resto — documento del
  locatore, APE, CF — avverte, non blocca (lezione `checkSlot`), e i
  mancanti viaggiano DICHIARATI nell'email ("Non ancora nel fascicolo") e
  persistiti su `aspiRequestMissing`. Il canone FUORI fascia sulla scheda
  è un warn esplicito: ASPI non può attestarlo. Per l'asseverazione, se il
  Fascicolo Fiscale manca **nasce all'invio**.
- **`sendAspiRequest()`**: email al referente con TUTTI gli allegati
  (contratto firmato — o generato, dichiarandolo — certificato FES,
  identità, e per l'asseverazione fascicolo/APE/planimetria/visura/delega;
  budget 18MB, i link Storage nel corpo restano come rete), operatore
  SEMPRE in copia (l'email è il registro), stato sul contratto
  (`aspiRequestedAt/Kind/To/Missing/Count` + `registrationStatus:'sent'`,
  che accende i badge della pagina Burocrazia — mai degradando un
  `'registered'`).
- **I €37/€100 diventano SERVIZI col markup** (il pattern del
  concordato-pack): all'invio nasce la fattura al cliente —
  `invoices/aspi_<kind>_<contractId>`, **idempotente per costruzione**
  (fsCreate con id deterministico → 409 al re-invio: ripremere Invia
  rimanda l'email, MAI una seconda fattura) — con l'importo di
  `settings/registrazione` (default: registrazione **€89**, asseverazione
  **€189**, completo €278; costi pratica 37/100/137 tracciati accanto).
  Da lì il 💳 link di pagamento esistente incassa con carta.
- **Manopole in `settings/registrazione`** (admin-only in LETTURA nelle
  rules — contiene l'email personale del referente, lezione
  settings/company): email, referente, cc, prezzi, costi, billTo
  (landlord|tenant), autoInvoice, e **`auto`** — l'opt-in "zero tap": con
  auto:true la richiesta parte DA SOLA alla firma completa (dentro
  `_finalize.js`, dopo il fascicolo CAF, best-effort e time-boxed).
  Default **false**: un invio a terzi che costa denaro resta una decisione
  dell'operatore. I default vivono in `ASPI_DEFAULTS` (una copia sola,
  console e server non possono divergere).
- **Nel portal**: bottone **🏛 ASPI** sulla riga contratto (dettaglio) e
  **🏛 Invia ad ASPI** in Burocrazia → pannello che legge TUTTO da
  op:status (mai un prezzo hardcodato nel client), radio variante,
  checklist live, checkbox fattura, nota, ✎ per cambiare destinatario.
  `✓ RLI registrato` resta il tap che chiude il loop quando ASPI conferma.
- Test: `node tests/aspi/run.mjs` (35 check).

**Il documento si attacca DOVE MANCA** (`api/fiscal/allega.js`, 23/08):
il pannello diceva onestamente dove caricare ogni pezzo ("console
pre-agreement → Fascicolo ARPE", "manda il link /scheda") — ma era un
rimando, e con dieci fascicoli al mese quel rimbalzo fra console *è* il
lavoro. Ora ogni voce della checklist è una **porta**: 📎 sulla riga, il
file va esattamente dove serve (APE/planimetria/visura/delega →
`properties.dossier` — si caricano UNA volta per immobile e li ereditano
i contratti futuri; identità/esigenza → `contract.identityDocs`, la
stessa lista di /scheda e del pre-agreement, con `kind:'extra'`
sull'attestazione) e la risposta riporta **entrambe le checklist
aggiornate**: la voce passa da ✗ a ✓ senza cambiare pagina. La chiave È
quella della checklist; le voci non allegabili (il contratto si genera,
la scheda si calcola, i CF sono dati) vengono **rifiutate** invece di
ricevere una destinazione inventata.

**La scheda si stampa SEMPRE** (fascicolo pagina 1, stessa release): fino
al 23/08 senza zona o mq degradava a "SCHEDA NON CALCOLABILE" — e
l'operatore restava senza foglio proprio quando gli serviva stamparlo e
completarlo a mano. Ora esce sempre il **modulo fedele** all'originale
dell'associazione (`reference/caf/2023_scheda_calcolo_canone_ARPE.docx`):
superficie convenzionale, i 20 parametri, la griglia **maggiorazioni A–H**
con le caselle, zona/fascia/subfascia, e i due importi finali. Ciò che il
sistema non sa diventa una riga vuota da compilare. **Il canone PATTUITO
si stampa tale e quale**: il massimo di fascia è un riferimento
dell'accordo, non un tetto che il foglio impone al prezzo deciso dalle
parti; se lo supera il documento lo dice in nota — la valutazione
dell'attestazione resta all'organizzazione. Numeri all'italiana
**deterministici** (`itNum`): `toLocaleString` su runtime con ICU ridotta
stampava `1250,00` invece di `1.250,00` — su un foglio che va all'AdE il
punto delle migliaia non è un dettaglio (la lezione già pagata su
/executive).

### La Valutazione BOOM (`api/fiscal/valutazione.js`)
Il canone che BOOM propone al proprietario non nasce dalla tabella
dell'accordo: nasce dal mercato. Questo è quel documento, **a parte** dalla
scheda e per costruzione un'altra cosa — dichiara in testa che **NON è
l'attestazione di rispondenza**, stampa il canone **deciso** senza tetto né
ricalcolo, e porta la fascia dell'accordo solo come *riferimento dichiarato*
(il proprietario ha diritto di sapere dove passa quella linea). Si fonda su
dati veri già in casa: `marketStats/<zona>` del Perito (mediana e p25–p75
del **chiesto**, assorbimento in giorni, ribassi 30gg), i canoni **FIRMATI**
da BOOM in zona (il dato che nessun portale ha), le dotazioni, e il
posizionamento €/mq contro la mediana. Vale la disciplina del Perito:
**sotto campione non esce un numero** — meno di 3 contratti firmati o un
campione di zona povero producono "campione insufficiente", mai una mediana
travestita da dato. Bottone **💶 Valutazione BOOM** sulla riga contratto.

**Il documento per i proprietari che chiedono una valutazione** (9/09/2026
— «la scheda calcolo brandizzata boom diventa un documento per i
proprietari»). Il modulo 1:1 va ad ARPE; al proprietario va QUESTO: pagina 1
il parere di mercato, **pagina 2 la scheda di calcolo brandizzata BOOM**
(`drawSchedaBoom`, esportata): superficie convenzionale riga per riga con
i coefficienti, i 20 parametri con quelli che l'immobile ha davvero, la
subfascia con la soglia che la decide, il canone base (valore × mq), le
maggiorazioni A–H applicate, la regola del tetto quando scatta, e i due
numeri affiancati — **massimo attestabile** dell'accordo e **canone
proposto** — con la frase che li mette in relazione («rientra: attestabile
come concordato, cedolare al 10%» oppure «supera di €X: è un canone di
MERCATO, non attestabile»). Gli STESSI fatti del modulo (`schedaFacts` +
`resolveCanoneInput`, una copia sola: dotazioni REALI di immobile e
annuncio, override persistiti): la scheda del proprietario e il modulo ARPE
non possono divergere. Ciò che manca si scrive «da completare» (zona, mq,
catasto), il massimo diventa «non calcolabile» con l'elenco di cosa manca
— mai un numero. **Si genera anche SENZA contratto**: bottone
**💶 Valutazione** nel modale dell'immobile (admin) →
`openValutazione(null, undefined, {propertyId})` → `POST {propertyId,
canone}`; il documento si ricorda sull'immobile (`valutazioneBoomUrl/At/
Canone`) e, quando c'è, sul contratto. Testata e piede dal marchio vero
(`_pdfbrand`: `masthead` + `stampFooters`), come inventario e verbale — la
testata scritta a mano è sparita. La risposta porta `scheda: {gaps, fascia,
cMax, fits, nP, sc}` e il portal lo dice nel toast («scheda da completare:
catasto»). Test: `node tests/mandato/run.mjs` §8.

**La sanatoria del PDF stantio** (`ensureContractPdf`, stessa release):
il rail di firma ora RIGENERA da solo un `generatedPDF` con
`clauseVersion` < 2 quando NESSUNA firma è viva — prima un contratto
creato con l'impaginato vecchio mostrava al firmatario il modello
superato in "View full contract PDF" e solo un ⚠ nel dettaglio del
portal suggeriva di rigenerare a mano. La guardia resta assoluta: con
una firma viva il documento è congelato, qualunque versione porti.
Copre invito (send-link/send-sign), prima apertura di /sign (lookup) e
conversione. Il modello in vigore è VERBATIM il contratto tipo
dell'associazione (`reference/contratto_tipo_STUDENTI_Roma_2023.doc`,
prot. RA/2023/0044852 — stesso MD5 del file del referente).

**PDF al primo clic** (22/09/2026): il loader idle di `portal.html` poteva
non avere ancora caricato jsPDF quando `generateContractPDF` lo cercava,
restituendo subito errore. `boomEnsureJsPDF()` avvia e condivide la richiesta
con il preload; il generatore attende. Errore CDN o attesa oltre 20 secondi
liberano il tentativo: il clic successivo riprova, senza ricaricare il portal.
Test: `tests/contractpdf/loading.mjs`, handler e renderer reali, IO simulato,
PDF effettivo, nessuna scrittura su errore e mutazione senza attesa.

### Rendiconto proprietario (`GET/POST /api/owners/rendiconto`, cron 1° del mese 06:10 UTC)
Il 1° del mese ogni proprietario riceve il rendiconto del mese CHIUSO:
per ogni suo immobile i canoni incassati (data + via), le rate del mese
aperte, gli ARRETRATI totali, le manutenzioni del periodo — PDF nel
design BOOM (pdf-lib, `wa()`) su Storage `rendiconti/<ownerId>/` + email
IT nel design system con PDF in allegato. Email risolta users →
landlords → contract.landlordEmail; senza email → segnalato nel recap
Telegram, MAI perso in silenzio; proprietario senza movimenti → salta.
Idempotente per (proprietario, mese) via `rendiconti/<ownerId>_<YYYY-MM>`
(fsCreate 409 → skip; collection admin-only in firestore.rules — la
lezione propertyLocks). `?dry=1`, `?month=YYYY-MM`, `?ownerId=`; auth
come i cron PFS. Heartbeat `teamHealth/rendiconto`.
Test: `node tests/rendiconto/run.mjs`.

### Conservazione (`GET/POST /api/ops/conservazione`, cron il 2 del mese 05:40 UTC)
L'archivio legale FUORI da Firebase, senza nuovi servizi: il 2 del mese i
contratti FINALIZZATI nel mese chiuso vengono raccolti (contratto firmato,
certificato FES, fascicolo fiscale, marca temporale .tsr, pack
registrazione), zippati (`api/_zip.js`, INDICE.txt in testa con l'elenco e
gli eventuali file irraggiungibili) e spediti IN ALLEGATO alla casella
operatore — Gmail è la copia fuori piattaforma. Volumi >20MB spezzati in
più email. Idempotente per mese via `heartbeat/conservazione-<YYYY-MM>`
(collection già admin-only nelle rules deployate — nessuna dipendenza da
un deploy futuro). `?dry=1`, `?month=YYYY-MM`; heartbeat
`teamHealth/conservazione`. Test: `node tests/conservazione/run.mjs`.

## La Banca (open banking — api/banking/* + banca.html)

PSD2 bank feed for the Contabile via **GoCardless Bank Account Data** (ex
Nordigen, free tier, covers Italian banks; consent renews every ~90 days —
BOOM never sees bank credentials). Collections: `bankAccounts` (linked
accounts + consent expiry + balance snapshot), `bankTransactions` (one doc
per movement, stable content-hash ids → every sync/import re-run is a
no-op), `bankRequisitions` (consent audit).

| Endpoint | What it does |
|---|---|
| `POST /api/banking/institutions` | bank picker (`{q}` search); `configured:false` when GC keys missing |
| `POST /api/banking/connect` | creates end-user agreement (max history the bank allows, up to 540gg) + requisition → `{link}` to the bank's consent page; redirect back to `/banca?ref=<id>` |
| `POST /api/banking/finalize` | stores authorized accounts after the redirect |
| `POST /api/banking/sync` | **cron daily 04:15** (before the Contabile). Pulls movements (first run backfills full history), dedupes via batchGet, categorizes (prima nota rules in `_lib.js`), reconciles credits against pending `payments`: exact amount + due-date window + unique candidate + (tenant-name or month or unique-amount) → payment marked paid (`paidVia:'bank'`); weaker matches → `matchSuggestions`, confirmed by one tap in /banca. Heartbeat `teamHealth/banca`; Telegram when a consent is ≤7gg from expiry. |
| `POST /api/banking/export` | estratto conto / prima nota CSV for the commercialista — Italian format (semicolon, DD/MM/YYYY, decimal comma, UTF-8 BOM); prima nota adds per-category period totals |
| `POST /api/banking/scan-inbox` | **cron daily 04:05 — the primary feed now that GoCardless is closed to new signups.** Reads the Gmail mailbox over IMAP (same infra as pfs/scan-inbox). Three tiers: (1) **movement-alert emails** ("Hai ricevuto un bonifico di €1.200 da…") — amounts live in the BODY, extracted via Claude haiku, but ONLY from recognized bank sender domains (`KNOWN_BANK_DOMAINS` + `BANK_MAIL_FROM`) so a tenant writing "ti ho fatto il bonifico" never becomes a transaction; (2) **statement attachments** — CSV parsed directly, PDF via Claude document block; (3) forwarded emails, same handling. "Statement available behind login" emails yield an empty extraction and are remembered so the AI call is never repeated. Processed emails → `bankImports`; tx-level dedupe makes re-runs no-ops; per-run AI budget. Telegram recap when something lands. Heartbeat `teamHealth/banca-mail`. Setup: attiva nell'home banking gli avvisi email di movimento (e, se disponibile, l'invio dell'estratto come allegato). |
| `POST /api/banking/import` | manual fallback: paste the home-banking CSV (column auto-detect for the common Italian exports), same dedupe+reconcile pipeline — works with zero API setup |
| `POST /api/accounting/scadenzario` | unified deadline book derived live: company (IVA/LIPE/CCIAA/Redditi from `invoices` by quarter) + one group per property owner (registro, IMU, cedolare, ISTAT + contract renewals ≤120gg). `format:'ics'` → calendar file (stable UIDs, re-import updates). |

All admin-gated via `api/pfs/_guard.js`. **Console**: `banca.html` (`/banca`,
admin-only, noindex) — linked accounts + consent status, recent movements
with one-tap match confirmation, CSV/ICS export, manual import. The
Contabile's morning report includes the bank picture (riconciliati/da
confermare/consensi scaduti).
