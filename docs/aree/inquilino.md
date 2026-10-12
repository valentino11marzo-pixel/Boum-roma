# Inquilino — /casa, journey, verbale di consegna, inventario dal video

> Dettaglio e storia di quest'area, spostati da CLAUDE.md il 12/10/2026 senza
> riscrivere nulla: stesse sezioni, stesso ordine. Le novità dell'area si
> aggiungono QUI (3-8 righe nella sezione giusta: cos'era, cosa cambia, dove
> sta il test). La mappa del sistema è in `CLAUDE.md`, le priorità in `ORA.md`.

### Tenant lifecycle — La tua casa BOOM + Canone via BOOM + journey + Fascicolo ARPE
- **Confronto UX con Claude, 18/09:** `/casa` permette di segnalare il bonifico già eseguito e annullare una segnalazione erronea. `api/payments/report` ammette solo il titolare tenant; legge la versione e salva solo il flag con CAS. Mai `paid` dal client, admin preview esclusa, stato riletto dal server anche dopo errori.
  `payment_reported` ora ferma checkout autenticato, link operatore/pubblico e nuove selezioni del collector SDD; restano fuori garanzia sessioni Stripe già aperte e gare tra canali avviate prima del riscontro.
  Ricevute archiviate raggiungibili da `receiptDocId`, con ID rata verificato e URL HTTPS; nuove archiviazioni espongono il file sulla rata senza sostituire ricevute Stripe. Nessun PDF o associazione inventati.
  Prove `tenantpayments`, `paymentlinks` (inclusi titolarità, conflitto e revoca), mutazioni titolarità/stato, `sdd`. La foto facoltativa rimane nel flusso precedente del portale; non è aggiunta qui.
- **UX pagante, chiarimento 17/09:** una rata, scelta Carta/wallet o Bonifico e solo il pannello del metodo scelto; l'addebito automatico è in un dettaglio secondario. Totali stabili, periodo e importi nella lingua scelta.
  Commissione e totale carta sono stime dichiarate; l'importo esatto appare su Stripe prima della conferma. Il dock porta alla scheda con «Vedi pagamento».
  Cambiare metodo aggiorna solo i due pannelli, preservando bozze e sezioni aperte. Stati dal server e veti contro il secondo pagamento rimangono invariati.
  Bonifico con beneficiario e IBAN configurati; causale del tipo effettivo, errore visibile se mancano dati o riferimento, nessun «Copiato» se gli appunti rifiutano. Il recupero cancella l'errore precedente.
  Prove `tenantpayments`: controller reale, scelta locale, costi, accessibilità dei pannelli, errori/riprova, bozze preservate e guardie.
- **Pagamenti /casa, 17/09:** `?paid` non promuove più una rata a pagata: soltanto snapshot `source:'server'`.
  Refresh limitato a cinque tentativi, attesa/errore/riprova visibili; `sdd=ok` attende il contratto verificato.
  `BOOM_RENT` impedisce carta/bonifico/dock su addebiti in corso, segnalati o ritorni da verificare.
  Elenco per contratto visualizzato, aperti separati da ricevute, limite 120 dichiarato, EN/IT preservati.
  Test `tenantpayments` (controller vero + mutazioni) e regressione `scalo`. Nessun dato reale mutato dai test.
- **`tenant.html` (served at `/casa`)** — REBUILT on real data (the old page
  was a stub with hardcoded payments). BoomPortal auth (role tenant), reads
  own `contracts`/`payments`/`maintenance` + property client-side (allowed
  by firestore.rules). **Casa 2.0: ENGLISH-FIRST** (the BOOM tenant is an
  expat) with IT toggle persisted (`STR` dict + `t()`). Sections: hero
  tiles, next payment (one-tap card pay), storico + ricevute, documenti,
  **Manuale della Casa** (renders `properties.manual`: Wi-Fi with copy
  button, heating, waste days, appliances, access, emergency, rules),
  **Quartiere** (`properties.neighborhood[]` with Maps links),
  manutenzione, Concierge (€149/€119/su misura — WhatsApp-first),
  **Welcome to Rome Kit** card (share), **referral con codice personale**
  (`BOOM-<uid6>`, navigator.share). Linked from Wallet passes + journey.
- **`welcome-to-rome.html` (`/welcome-to-rome`)** — public English expat
  survival guide (codice fiscale, home without horror stories, residency,
  tessera sanitaria, SIM, bank, ATAC) with BOOM tips + CTA + share bar.
  THE viral asset: indexed, og-tagged, made to be forwarded.
- **`manuale.html` (`/manuale`)** — admin editor of the home manual:
  property picker (✓ when filled), Wi-Fi/heating/trash/appliances/access/
  emergency/rules + neighborhood lines (`emoji · nome · nota`), saves to
  `properties.{manual,neighborhood}` client-side (admin rules).
- **`POST /api/payments/pay`** — Bearer ID token (tenant/admin). Body
  `{paymentId}`; a tenant can only pay their own docs. Stripe Checkout with
  TWO line items: the installment + "Commissione servizio BOOM"
  (`rentFee()` exported: RENT_FEE_PCT% of amount, min RENT_FEE_MIN — card
  costs ~1.5%+€0.25 so the default 2.5%/€9 keeps real margin at any rent).
  `service:'RENT'` metadata → webhook branch marks the payment
  `paid/paidVia:'stripe'/paidDate/receiptUrl/serviceFeeEur` (idempotent on
  stripeSessionId), receipt email to tenant + admin heads-up. The bank
  reconciliation path is untouched (a stripe-paid doc is no longer pending
  so batch matching skips it).
- **Saldo deposito** — `convert.js` now also creates
  `payments/depbal_<contractId>` (`type:'deposit-balance'`, due on
  startDate) whenever the PA split the deposit — payable from /casa,
  reminded by the journey's T-7 email.
- **`api/journey/_run.js`** (from reminder-cron, hourly window, once per
  step per contract via `contracts.journey.<step>` flags): T-30 welcome +
  Move-in Pack · T-14 documents/utilities nudge · T-7 Cleaning Premium +
  deposit balance · T-1 keys (INCLUDED, never sold) · T+3 review ask
  (REVIEW_URL) + casa intro · T-90 before end = renewal CONFIRMATION ONLY
  (no upsell; admin notified) · end+3 = thank-you + review + referral.
  Upsells are WhatsApp-first (prefilled wa.me), emails use the shared
  design system (`_notify.js` exports shell/btn/btn2/para/fine).
- **Fascicolo ARPE** — property dossier slots (visura/planimetria/APE/
  delega) uploaded once per property via `POST /api/properties/dossier`
  (admin; Storage `property-docs/<propId>/`, admin-only per storage.rules
  — REMEMBER `npx firebase-tools deploy --only storage`) and stored on
  `properties.dossier.<slot>`. Console rows with a contract get
  **📦 Fascicolo ARPE**: traffic-light checklist (contratto firmato, scheda
  2/B da generare, documenti conduttore, esigenza transitoria, 4 slot
  immobile con upload) + client-side ZIP (JSZip CDN) with INDICE.txt —
  ready to forward to ARPE for registrazione + asseverazione.

### Journey consapevole (contesto nel `_run.js`)
`steps()` riceve `missing`, `late` e `walletUrl`: il T-14 chiede PER NOME
ciò che manca (link `/scheda` derivato — anagrafica e/o foto documento)
invece del generico "se manca qualcosa"; con rate scadute (`late`, una
query payments per run) gli upsell TACCIONO su T-30/T-14/T-7 (non si
vende a chi ha un pagamento aperto) e gli avvisi T-90/uscita
all'operatore segnalano gli arretrati prima di rinnovo/restituzione
deposito. Il **Wallet pass della casa** (`tenantWalletUrl(contractId)` →
`/api/my-pass`, link derivato, pass ricostruito live) viaggia nel welcome
post-firma, nel T-30 e nel T-1 — sempre visibile dentro il journey.
Le visite dal portal (conferma/sposta) ora chiamano
`/api/viewings/confirm` — l'EmailJS browser-side del flusso visite è
stato rimosso: email, pass e inviti iCal partono sempre dal server.
`/scheda?demo=1` (form vuoto con OCR simulato), `?demo=known` (conferma
one-tap), `?demo=landlord` (locatore IT): walkthrough senza API né
contratti veri, come `/sign?demo=1`.

### Verbale di consegna chiavi (`POST /api/contracts/verbale` + `/verbale`)
Il contratto (Art. 3 di entrambi gli Allegati) rinvia a "quanto risulta dal
verbale di consegna" — questo lo genera davvero, SUL POSTO. `verbale.html`
(`/verbale?c=<contractId>`, admin/owner/landlord via BoomPortal, mobile-first,
no-store+noindex) il giorno delle chiavi: chiavi consegnate (stepper),
letture contatori (POD/PDR + foto opzionali, downscale client 1600px),
stato + note, poi le firme sullo schermo del telefono — conduttore
principale, co-conduttori presenti (checkbox "presente e firma"), operatore.
L'endpoint (Bearer; owner solo sui contratti dei PROPRI immobili) genera il
PDF (pdf-lib, `wa()` WinAnsi-safe, dichiarazione art. 1590 c.c., foto 2 per
riga, firme a 2 colonne), lo carica su `contracts/<id>/verbale-consegna_*.pdf`,
marca `contract.verbaleConsegna` (nomi firmatari, MAI i dataURI), lo archivia
in `documents` con categoria `verbale` (il taxpack la riconosce già → la
checklist commercialista si spunta da sola) e lo invia IN ALLEGATO:
conduttori+co-conduttori (EN), proprietario (IT), admin. Bottone 🔑 sulla
riga contratto del portal (✓ quando esiste). Le letture fanno fede per le
volture. Test: `node tests/verbale/run.mjs`.

### L'inventario dal video (`POST /api/contracts/inventario` + `/inventario`)
Il verbale rinviava agli arredi con UNA riga: *"completa degli arredi e delle
dotazioni pattuite"* (`verbale.js`). Vera e inservibile: alla riconsegna, un
anno e mezzo dopo, non dice se la lavastoviglie c'era, se il divano aveva già
lo strappo, se le sedie erano sei — e la trattenuta sul deposito la vince chi
ricorda più forte. Il giro in casa l'operatore lo fa comunque: qui quel giro
diventa un documento.
- **`/inventario`** (`?c=<contractId>` dalla riga contratto, `?p=<propertyId>`
  dalla scheda immobile — funziona anche PRIMA che il contratto esista, che è
  il caso vero del sopralluogo). Mobile-first come `/verbale`: si filma il
  giro, **i fotogrammi si estraggono SUL TELEFONO** (`framePlan` + canvas: un
  video da 100MB non esce da un vano scala, e non serve) e sale solo una
  manciata di JPEG. Nota vocale facoltativa (Whisper via `_stt.js`, la copia
  condivisa col bot wizard) e note scritte: quello che dici entra nel prompt.
  Poi l'elenco editabile — quantità, condizione, nota per riga — e il tasto
  **Genera**. `?p=` senza AI configurata resta usabile: "scrivo a mano".
- **`js/inventario-engine.js`** (UMD → `window.BOOM_INVENTARIO`, importato
  anche dai file ESM come boom-geo) è dove stanno le regole, quindi si
  testano senza browser e senza appartamento:
  1. **Una condizione non dichiarata resta vuota, MAI "buono".** L'asimmetria:
     un trattino non ha mai fatto perdere una causa, un aggettivo inventato sì.
  2. **Il video non emette GIUDIZI.** Dall'AI si accettano solo `danneggiato`
     e `nuovo` — cose che si vedono in un fotogramma; "buono stato" e "segni
     d'uso" vengono riportati a *non dichiarata* **e la pagina lo dice**
     (regola 4: nessun taglio silenzioso). L'operatore invece può dichiararli:
     li ha guardati lui.
  3. **La proposta non è un fatto**: `saveable()` pretende `reviewed`, ogni
     riga toccata passa a `source:'human'`, e `op:'analyze'` **non scrive
     nulla** (asserito nei test: né immobile, né contratto, né archivio, né
     Storage, né email).
  4. Lessico chiuso delle stanze (`salotto`→Soggiorno, `bedroom 2`→Camera 2,
     ma *telecamera* non è una camera), dedupe per stanza, tetti dichiarati.
- **Il confronto è il punto** (`diffInventory`): alla **riconsegna** il PDF
  stampa da sé mancanti / danneggiati / aggiunti. **La regola che protegge
  entrambe le parti**: una voce la cui condizione alla CONSEGNA non era
  dichiarata non può diventare un danno all'uscita — finisce fra i *non
  verificabili*, con scritto perché (verificato per mutazione).
- **Dentro il verbale**: quando l'inventario c'è, `buildVerbalePdf` **sostituisce**
  la formula generica con l'elenco vero (`contract.inventario ||
  property.inventario`), più la riga che spiega cosa significa "non
  dichiarata". Senza inventario il verbale è esattamente quello di prima.
- Scritture: `properties.inventario` / `.inventarioUscita` (e le stesse sul
  contratto quando c'è), PDF su `contracts/<id>/` o `property-docs/<propId>/`,
  fotogrammi come prova sotto `property-docs/<propId>/inventario/`, documento
  in archivio categoria `inventario`, copia email all'operatore. Auth
  object-level come il verbale: un owner solo sui PROPRI immobili.
- Modello: `claude-opus-5` in vision sui fotogrammi (il documento vale sul
  deposito: qui non si risparmia); senza `ANTHROPIC_API_KEY` → **501
  esplicito**, mai un elenco vuoto spacciato per casa vuota.
- **La testata dei documenti, una copia sola** (`api/_pdfbrand.js`): ogni PDF
  si disegnava la propria intestazione a mano — rettangolo nero, la parola
  "BOOM" scritta come TESTO, le due righe Egidi ricopiate in fondo — e il
  marchio vero non compariva da nessuna parte. Ora `masthead()` stampa il
  **marchio VERO** (i cerchi sonori oro, rasterizzati da `boom-mark.svg` e
  incorporati in base64: zero dipendenze, zero rete), il filo d'oro, il
  titolo del documento e la data; `stampFooters()` mette il piede legale su
  TUTTE le pagine e le numera solo quando sono più d'una. `wa()` (WinAnsi)
  vive qui: accenti, apostrofo tipografico, em-dash, ellissi e € **restano**
  — sono in tabella e sono la punteggiatura vera dei nostri testi; si toglie
  solo ciò che il font non conosce, che non degrada ma fa FALLIRE il
  documento. Usata da inventario e verbale (che ne ha guadagnato anche gli
  accenti: prima il conduttore leggeva "l'unita immobiliare"). Sul font: la
  Helvetica dei PDF **è** il font del sito — un typeface custom vorrebbe
  fontkit più un .ttf licenziato dentro ogni funzione, e la differenza la fa
  la tipografia (pesi, spaziatura, gerarchia), non un secondo font.
- **L'email porta il documento**: design system condiviso (masthead nero col
  marchio, carta bianca), il numero che conta in testa (`hero`), immobile /
  rilievo / fotogrammi in `tiles`, PDF **in allegato** col nome datato. Alla
  riconsegna il confronto è un QUADRO coi numeri (mancanti · danni nuovi ·
  comparsi dopo) — mai un elenco spuntato: una spunta verde accanto a "5
  voci mancanti" dice il contrario di quello che è successo — e le voci non
  verificabili vengono spiegate, non nascoste.
- Dove si trova: riga contratto **📋 Inventario**, scheda immobile, Burocrazia
  → *Inventario dal video*, ⌘K/Prontuario (console + azione contestuale su
  contratto e immobile). Test: `node tests/inventario/run.mjs` (101 check) + `node tests/inventario/ui.mjs`
  (22 check in Chromium vero: un video registrato al volo diventa fotogrammi —
  con la sonda per i filmati che dichiarano durata `Infinity` — l'elenco si
  corregge e senza la spunta non parte niente).
