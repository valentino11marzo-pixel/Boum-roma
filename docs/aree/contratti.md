# Contratti — Scheda, dizionario dei campi, modelli A/B/C, completamento e revisione

> Dettaglio e storia di quest'area, spostati da CLAUDE.md il 12/10/2026 senza
> riscrivere nulla: stesse sezioni, stesso ordine. Le novità dell'area si
> aggiungono QUI (3-8 righe nella sezione giusta: cos'era, cosa cambia, dove
> sta il test). La mappa del sistema è in `CLAUDE.md`, le priorità in `ORA.md`.

### La Scheda (`/scheda` + `api/profile/*`) — anagrafica universale
"Compila la tua scheda in 2 minuti": ONE link that collects a party's
anagrafica (identity + ID upload) for ANY contract, decoupled from the
signature — the missing piece for clients not onboarded via pre-agreement
(the legacy `form-tenant/form-landlord` pages wrote anonymously to the
admin-only `contractRegistrations` collection and silently failed; the
Share Hub now hands out /scheda links instead). Study: `LA_SCHEDA_STUDY.md`.
- **Derived tokens, zero migration** (`api/profile/_scheda.js`, same
  pattern as the viewings' manageToken): `sha256("scheda:<role>:<id>:
  <HOMIE_SECRET>")` → URL blob `<contractId>.<t|l>.<token>`. Every
  contract ever created — signed ones included — already has a valid
  link; rotating `HOMIE_SECRET` revokes all; role lives INSIDE the
  derivation; a scheda link can never sign.
- `POST /api/profile/lookup` — public `{t}` → role, `locked`, property
  label, prefilled identity merged contract→sign-schema→wizard-schema.
- `POST /api/profile/submit` — public. Writes contract party fields
  (`tenantName/CF/Dob/Pob/Address/DocType/DocNum/DocIssuer/DocIssueDate/
  Nationality/Phone`) + users sync on BOTH schemas + `landlords/` for the
  landlord role. CF checksum-validated when present (optional — fresh
  expats). Re-editable until that party SIGNS, then 410 (identity of a
  signed act is frozen); pings the operator via `agentNotifications`.
- `POST /api/profile/upload` — public. ID document → Storage
  `contracts/<id>/identity/…` under admin creds (URL never returned to the
  page), appended to `contract.identityDocs` + the user profile. With
  `extract:true` the same bytes go through Claude haiku and the response
  carries the identity fields read off the document (**OCR-first UX**: the
  client photographs the ID and the form fills itself; never invents,
  never blocks the upload). Allowed even post-firma (the ID copy for the
  RLI dossier is additive).
- `POST /api/profile/link` — admin/owner/landlord (Bearer): returns the
  two derived /scheda URLs for a contract (the browser can't compute
  them). Owners only for their own property's contracts. Feeds the
  portal's Share Hub cards + `sendMissingInfoLink`.
- `scheda.html` (`/scheda?t=…`, cleanUrls; noindex + no-store in
  vercel.json): sign.html's design shell, EN-first with IT toggle
  (landlord defaults IT), Model-C staging (confirm when known / form when
  not), "⚡ compila con una foto" OCR shortcut, document step skippable,
  read-only view when locked. No Firebase on the page — same-origin API
  only.
- **Deal flow per i clienti legacy**: contratto minimo nel portal →
  Scheda (anagrafica + documento self-service) → 🔄 Rigenera PDF (ora
  completo) → Magic Sign. Per contratti già firmati su carta: solo
  Scheda (upload documento incluso) — nessuna firma fittizia.

### Il Dizionario del contratto — la Scheda che si adatta e le due email a Valentino (`js/contract-fields.js`)
**Il problema misurato (8/09/2026)**: i due modelli (Allegato B/C, CAF
verbatim) stampano `………` per OGNI dato mancante e nessun posto sapeva PRIMA
quali puntini sarebbero usciti; `/scheda` raccoglieva SOLO l'identità
(niente conviventi, esigenza transitoria, corso di studi, fatti
dell'immobile, catasto strutturato); il portal aveva TRE liste «mancano»
scritte a mano che divergevano fra loro e dal server; la cedolare era letta
in modo OPPOSTO dai due modelli (B `=== true`, C `!== 'no'` — i contratti
reali portano `'si'`, quindi su B usciva l'art. 7 del regime ordinario);
il catasto era un blob di testo che nessuno poteva ricopiare nelle caselle
RLI; i lettori della registrazione (fascicolo, pack, ASPI) guardavano solo
i campi del contratto mentre il PDF risale la catena `users` — un CF
presente sul profilo usciva «MANCANTE».
- **`js/contract-fields.js`** (UMD → `window.BOOM_CONTRACT_FIELDS`, import
  ESM da `api/**`): UNA dichiarazione per ogni dato che i modelli STAMPANO
  più ciò che RLI/AdE e la macchina pretendono — `owner` (chi lo SA: tenant
  · landlord · operator, anche dinamico: l'esigenza transitoria è di chi la
  dichiara, `esigenzaDi`), `templates` (B/C), `needs` (`contract` = puntini
  nel PDF · `registration` · `operations`), `required` (funzione del
  contesto: rilascio del documento solo su C, permesso di soggiorno solo
  per un extra-UE, nascita solo per una persona fisica, documento
  dell'esigenza solo oltre 30 giorni), `read` (la STESSA catena di
  contract-pdf.js) e `write` (contract / property / user, anche doppio: i
  fatti dell'immobile vanno in MEMORIA sull'immobile E sul contratto che il
  PDF legge). API pure: `completeness` (per owner + co-conduttori + durata
  di legge + `ready.contract/registration` + `dots`), `askFor` (le sezioni
  con SOLO i campi vuoti di QUEL ruolo), `applyAnswers` (lista bianca per
  owner, validazione, mappe annidate riscritte INTERE dal dato esistente,
  catasto strutturato → blob ricomposto, «vivo da solo» che non cancella i
  co-conduttori), `missingMessage` (nomina i mancanti, collassa i gruppi,
  EN/IT), `rliFacts` (L2 per entrambi i modelli, importo = corrispettivo
  per la durata se < 12 mesi, scadenza = 30 gg da min(stipula, decorrenza),
  imponibile 70% senza cedolare), `hydrateParties`, `cedolareOn`,
  `docTypeCode/It`, `parseCadastral/composeCadastral`, `validCF` (16
  caratteri O 11 cifre: il locatore può essere una società), `isEU`.
  **`READS`** dichiara le letture coperte: il test anti-deriva le confronta
  in ENTRAMBE le direzioni con ciò che `contract-pdf.js` legge davvero.
- **Date di calendario indipendenti dal fuso (21/09):** `rliFacts` convertiva
  mezzanotte locale in ISO UTC, anticipando la scadenza in Italia di un giorno.
  `fiscal-engine` mescolava inoltre anniversari e aggiunte locali con date UTC.
  Ora il calcolo usa lo stesso calendario UTC della rappresentazione ISO;
  in `fiscal-engine` anche Date/timestamp mantengono il giorno ISO UTC, senza reinterpretarlo in locale.
  Termini, importi e formati restano invariati, nessun dato salvato è riscritto.
  Test `fiscal`/`contratto`: UTC, Roma, Los Angeles, ora legale, bisestile e anno nuovo.
- **Le tre letture unificate in `contract-pdf.js`** (letture, non testo
  d'articolo — i modelli CAF restano verbatim): `cedolareOn` (assente = sì,
  come C, `_finalize` e compliance-rules; il vecchio `=== true` non può
  tornare, mutazione pinnata), `docTypeLabel` (sul contratto va l'italiano:
  «identificato/a mediante passport» non lo era), `tabelleOf`/impianti con
  fallback alla memoria dell'immobile.
- **La Scheda che si adatta**: `lookup` porta `ask` (sezioni per ruolo dal
  dizionario: esigenza, corso di studi, conviventi, permesso di soggiorno,
  contatti · per il locatore catasto a caselle, immobile, tabelle, IBAN),
  `submit` accetta `answers` e scrive via `applyAnswers` — un token tenant
  NON scrive mai un fatto dell'immobile, il locatore mai i campi del
  conduttore, ogni scarto torna in `rejected` (mai silenzioso); i fatti
  dell'immobile atterrano su `properties/<id>` (lista bianca DERIVATA:
  `PROPERTY_WRITE_KEYS`). `complete` = il PDF non stamperebbe puntini per
  quella parte; `missing` nomina ciò che serve ancora anche per la
  registrazione. **I co-conduttori hanno il LORO link** (`<id>.c<idx>.<token>`,
  derivato come `cosignToken`): scrivono SOLO `coTenants[idx]`, bloccati
  dalla PROPRIA firma — per l'AdE ogni conduttore è una riga RLI con CF.
  `scheda.html` rende gli step extra dai descrittori (people = «vivo da
  solo» + elenco, con i co-conduttori già mostrati), rinfresca la lookup
  UNA volta se un dato appena scritto fa nascere una sezione (nazionalità
  extra-UE → permesso), e lo schermo finale dice cosa manca ancora.
  `api/profile/link.js` ritorna `missing` e `messages` per parte + la
  Scheda di ogni co-conduttore: il portal non ricalcola nulla.
- **Portal**: `templateMissing` è un wrapper del dizionario (la terza lista
  a mano è sparita), il badge «mancano» di Burocrazia e i bottoni **📨 Chiedi
  a T/L** (solo dove manca qualcosa) leggono `contractCompleteness`, il
  modale porta il messaggio pronto (modificabile) e il link; lo Share Hub
  dice cosa chiede ogni link e ha le card dei co-conduttori; il dettaglio
  contratto ha la strip **Completezza** (per owner, «⚠ il PDF stamperebbe N
  puntini» prima della firma, durata di legge) e **✉ Foglio**.
- **Le due email a Valentino a firma completa** (`_finalize.js`, dopo
  `hydrateParties`): il **Fascicolo completo** (`sendCafDossier`, interno:
  verdetto in testa, per ogni parte a cui manca qualcosa il link /scheda
  DERIVATO già pronto col messaggio nella sua lingua, le stesse righe del
  foglio, allegati, pack, bottone portal; oggetto stabile `📑 Fascicolo
  completo — <immobile> — <conduttore> — <decorrenza>`) e il **Foglio di
  registrazione** (`api/sign/_foglio.js`, PULITO: niente bottoni né link
  al portal né «mancano/rigenera», catasto a caselle, un conduttore per
  riga, i numeri RLI da `rliFacts`, extra-UE con la scadenza della cessione
  di fabbricato, «non dichiarato» dove manca — si inoltra così com'è, si
  stampa, in Gmail fa da ARCHIVIO: oggetto `Registrazione contratto —
  <immobile> — <conduttore> — <decorrenza>`, senza emoji). Destinatario
  `REGISTRATION_EMAIL` → `CAF_EMAIL` → valentino@boom-rome.com. Rimandabile
  da **✉ Foglio** (`POST /api/fiscal/foglio`, admin). Numeri all'italiana
  deterministici (`itNum`, la lezione small-ICU).
- **Le righe rosse del link pubblico** (dal riesame avversario, stessa
  release): un link /scheda viaggia su WhatsApp ed è intercettabile, quindi
  ciò che decide DOVE arriva la firma o i soldi è **fill-only** — email di
  parte (mai sul profilo `users`, da cui send-link legge il destinatario),
  IBAN del locatore (il primo accende una notifica ad ALTA priorità col
  valore), indirizzo e comune dell'immobile: si riempiono solo se vuoti,
  altrimenti `rejected: already_set` e si corregge dal portal. Il CF del
  conduttore e dei co-conduttori è SOLO a 16 caratteri (`validCFFor`): un
  11 cifre Luhn-valido inquinerebbe l'RLI; il locatore può essere una
  società. La riga del co-conduttore si scrive con la precondizione
  `updateTime` (`commitWrites`, come magic-sign): una co-firma arrivata nel
  mezzo non viene mai sovrascritta. Una parte che ha già FIRMATO è congelata
  (410): il fascicolo completo e i bottoni «📨 Chiedi» offrono il link SOLO
  per i documenti, il resto è dichiarato «dal portal» — mai un link morto.
- **Fuori scopo, dichiarato**: i comproprietari con quota (`ownershipPct`
  esiste sul doc landlord ma nessuno lo legge) e la pagina RLI del
  Fascicolo Fiscale (`fascicolo.js` stampa ancora `rent×12` e «L2» solo su
  studenti — il foglio e l'email completa usano `rliFacts`).
- Test: `node tests/contratto/run.mjs` (87 check).

### Contratto studenti — template associazione (accordo Roma 27/07/2023)
`_generateContractPDF_allegatoC` (js/portal-app.js) genera il contratto
tipo STUDENTI dell'associazione: accordo territoriale depositato presso il
Comune di Roma Capitale il 27.07.2023 **prot. RA/2023/0044852**, art. 5
comma 2 L.431/98 (fonte: `contratto_tipo_STUDENTI_Roma_2023.doc`, refusi
dell'originale normalizzati — il secondo "Articolo 13" è il 14, come da
clausola 1341/1342). Punti chiave: disdetta 3 mesi (art.1), natura
transitoria con protocollo nuovo (art.2), canone con cadenza rate reale
(`installmentMonths`, art.3), interessi deposito annuali + "altre forme di
garanzia" (art.4), art.6 **biforcato su `cedolareSecca`** (default: testo
cedolare del modello; 'no' → variante registro/bollo), conviventi da
`contract.cohabitants` (art.8), slot opzionali `garanzieAltre`/
`oneriQuota`/`subentroModalita`/`accessiModalita`/`consegnaStato`,
utenze private a carico conduttore nelle Altre clausole (art.16) +
`otherClauses` in coda. Both Allegato generators (B and C) read identity
through the fallback chain contract fields → users sign schema → users
wizard schema — a regenerated PDF never prints dots for data a party
already self-filled on /sign or /scheda.

**Art. 6 SENZA cedolare: verbatim, finalmente** (8/09/2026). Il ramo «no
cedolare» dell'Allegato C era un testo scritto a mano («tassa di registro
ripartita al 50%») che OMETTEVA l'adeguamento Istat al 75% previsto dal
modello dell'associazione: un contratto senza cedolare usciva con un canone
fermo per clausola. Ora è VERBATIM da
`reference/contratto_tipo_STUDENTI_Roma_2023_SENZA_CEDOLARE.doc` (caricato
dal referente; differisce dal modello con cedolare SOLO nell'art. 6 —
verificato per diff). In `reference/` anche
`contratto_tipo_32_Roma_2023.doc`, il contratto tipo 3+2 (art. 2 c. 3
L.431/98) dell'accordo 27/07/2023.

**La direzione mancante del verbatim (21/09/2026 — «il template universitario
ogni tanto non viene rispettato»).** Il modello ricaricato dall'operatore è
byte-identico a `reference/contratto_tipo_STUDENTI_Roma_2023.doc` (stesso
MD5): il problema non era il modello, era ciò che il generatore aggiunge
FUORI dal blocco `MODEL_C`. `tests/contractpdf/verbatim.mjs` leggeva le frasi
dal SORGENTE e le cercava nel `.doc` — una direzione sola: non vedeva né una
frase del modello che il PDF non stampa, né un testo scritto a mano che entra
nell'articolo da una funzione di aiuto. Il confronto INVERSO (si impagina
davvero con un jsPDF finto che registra `doc.text`, nove varianti, e ogni
frase del `.doc` spezzata sugli slot deve uscire da almeno una — zero
dipendenze, gira in CI) ha trovato tre scavalcamenti veri: la premessa
**C) SICUREZZA IMPIANTI**, che senza dichiarazione del locatore stampava
«impianti funzionanti e idonei all'uso convenuto» — frase inventata, e una
dichiarazione positiva che nessuno ha verificato; il modello ha UNA frase
(«non dispongono di certificazione a norma») e il 3+2 l'alternativa
«dispongono/non dispongono»; la chiusa dell'**art. 5 Oneri** — fra i patti
approvati ex 1341 — che da «versa una quota di € -- salvo conguaglio» era
diventata «sono regolate a consuntivo secondo la Tabella…»; l'**art. 10
Consegna** con la stessa frase due volte («di quanto segue: quanto risulta dal
verbale di consegna sottoscritto… ovvero di quanto risulta dal verbale di
consegna»). Più le rate («rate mensili eguali … entro il giorno 5» → «rate
eguali anticipate … entro il 5 di ogni mese», la riga del modulo), le
intestazioni «Articolo N (Titolo)» come sul modello, e **la durata con la
data di fine inclusa**: `monthsBetween` (copie in contract-pdf.js e
portal-app.js) contava 01/09→31/08 come «11 mesi e 30 giorni» — stampato in
art. 1 di ogni contratto nato dal portal — e il wizard 🚀 scriveva
`durata.text` come «2026-09-01 → 2027-08-31», tale e quale nel contratto.
Ora `impiantiClauseConcordato`/`oneriClauseConcordato` stampano le frasi del
modulo (varianti dichiarate: oneri compresi nel canone; «funzionanti»
dichiarato dal locatore = frase del modello + la sua dichiarazione), il test
copre le due direzioni per C, C senza cedolare e A, e ogni frase fissa delle
funzioni di aiuto deve stare nel modello. **Lasciato all'operatore**: l'art. 3
sotto i 12 mesi stampa «canone di locazione riferito all'intera durata»
(variante dichiarata) dove il modulo dice «canone annuo» — è una scelta, non
una svista, e va confermata con ASPI. **Non verificato**: l'Allegato B non ha
un `.doc` in `reference/` — la sua premessa C) stampa ancora «funzionanti e
idonei» di default. In console PA la riga mostra ora **📄 Contratto (PDF, non
firmato)** finché le firme non sono complete: il `generatedPDF` esisteva
dalla conversione, ma si apriva solo dal portal.

### Il terzo modello: 3+2 canone concordato — Allegato A (8/09/2026)
Il contratto tipo dell'associazione per il **3+2** (L.431/98 art. 2 c. 3,
accordo 27/07/2023 prot. RA/2023/0044852 —
`reference/contratto_tipo_32_Roma_2023.doc`, caricato dal referente) è il
terzo modello di `js/contract-pdf.js`, VERBATIM. `contract.type === '3+2'`
(anche `'32'`/`'concordato'`, la forma che `compliance-rules` già leggeva)
→ `buildAllegatoA`; il dispatcher resta una riga sola. **Un telaio, tre
facce**: il generatore studenti è diventato `buildConcordato(env, MODEL)` —
stessa impaginazione, stesse parti, stesse firme, stesse ancore — e i due
modelli concordati sono `MODEL_C` / `MODEL_A`: titolo, riferimento di
legge, `articles(v, addArticle)` e la clausola 1341/1342. Il 3+2 parla
**per anno** (canone annuo = mensile × 12, rate per anno secondo la
cadenza), dura «3 anni» per legge (art. 1: proroga di diritto di due anni,
disdetta sei mesi), non ha esigenza né corso di studi, deposito con la
riserva «durata minima ≥ 5 anni», oneri sull'**allegato 5 dell'Accordo**
(non l'allegato D del decreto), recesso a sei mesi, «Accesso» al singolare.
Refusi dell'originale normalizzati e DICHIARATI nel sorgente
(«Organizzazione della Proprietà», «RA/2023/044852», la virgola che chiude
l'art. 1, «non è superiore», la parentesi mai chiusa, «l'immobile :
locato», «E'» → «È», «dei presente» → «del presente»).
- **`tests/contractpdf/verbatim.mjs` misura la parola "verbatim"**:
  `tests/_doc.mjs` legge i `.doc` VERI (OLE → FIB → piece table, zero
  dipendenze), il test estrae dal sorgente ogni frase fissa degli articoli
  (i pezzi fra un `${…}` e l'altro, ≥ 40 caratteri) e pretende che stia
  nel modello — confronto sul CONTENUTO (minuscolo, senza punteggiatura),
  normalizzazioni elencate, varianti nostre dichiarate (niente deposito;
  canone «riferito all'intera durata» sotto i 12 mesi). Al primo giro ha
  trovato sul modello C **«saranno a carico» dove il modello dice «sono a
  carico»**, il ramo senza cedolare scritto a mano, e lo slot «nella misura
  contrattata del --» che mancava (ora `contract.istatPct`, campo del
  dizionario: l'aggiornamento Istat pattuito senza cedolare).
- **Il tipo viaggia ovunque**: dizionario (`templateOf` → `'A'`; un campo
  comune a B e C vale anche per A, `garanzieAltre`/`accessiModalita`
  dichiarano `'A'`, rilascio del documento e rendita sono dati del
  contratto come sul C, durata di legge `durata_32` = 36 mesi esatti,
  opzione «3+2 canone concordato (Allegato A)» nel campo Tipo), portal
  (terzo bottone 📜 3+2 nel wizard, 36 mesi di default e minimo, tendina
  del modale Modifica, `updateContract` lo salva), console pre-accordo
  («3+2 Canone concordato (Allegato A)» e `type:'3+2'` alla conversione),
  `convert.leaseType` (esplicito o dedotto dalla proposta),
  `contracts.draft` (36 mesi), fascicolo/valutazione (`contractTipo` →
  `'32'`, la casella «Contratto: 3+2» della scheda ARPE e «Durata + %» con
  `pDur`), Foglio/Fascicolo/verbale/inventario (a parole), Pack e iter ASPI
  (nessuna «attestazione esigenza» chiesta o segnata mancante).

**IL TIPO NON SI MANDA, SI LEGGE** (agosto 2026). `js/contract-pdf.js`
sceglie il modello con `contract.type === 'studenti' ? Allegato C :
Allegato B` — ma delle TRE strade che creano un contratto, due non
passavano il tipo affatto: la conversione **automatica** (`_auto.js`, il
caso normale quando l'immobile è collegato) e il tasto **🖊 Magic Sign**
(`send-sign.js`); la terza, la console pre-accordo, non offriva nemmeno
l'opzione studenti. Risultato: ogni contratto usciva Allegato B, anche per
uno studente, e il modale *Modifica* del portal non aveva il campo Tipo —
una volta sbagliato, per sempre. Ora `leaseType(explicit, lease)`
(esportata da `convert.js`) **deriva il tipo dalla proposta** quando il
chiamante tace: nessuna strada può più sbagliarlo. Il campo **Tipo
contratto** nel modale Modifica corregge lo storico (poi 🔄 Rigenera PDF),
e scegliendo «Studenti» compaiono lì i campi dell'Allegato C — prima erano
resi solo se il contratto era GIÀ studenti, quindi cambiare modello
produceva un PDF coi puntini.

**I dati che l'Allegato C nomina si raccolgono dove il deal nasce**: corso
di studi, università + indirizzo, tipo iscrizione e anno accademico stanno
in `lease.studenti` sulla proposta (lista bianca in `create.js`, blocco
vuoto → `null`), la console li chiede solo col tipo studenti e li
ricompila in ✎ Modifica, `convert.js` li porta su `contract.studenti` +
i campi legacy `courseName`/`universityName` che il generatore legge.
Su un transitorio restano vuoti — un dato universitario su un contratto di
lavoro è rumore sul documento.
Test: `node tests/firma/run.mjs` (32 check) + `node tests/firma/ui.mjs`
(11 check in Chromium a 1280 e 390px) + la prova end-to-end in
`tests/money/run.mjs` §10, dove un deal studenti convertito **senza che
nessuno dica il tipo** nasce comunque Allegato C.

### ✎ Completa i dati + 📄 Bozza contratto — la console chiude i puntini (22/09/2026)
Dopo «✍️ Firmo io» restava il pezzo di mezzo della richiesta dell'operatore:
«scaricare il contratto auto creato dalle cose del pre-agreement, aggiustato
con quello che manca». Il PDF nasceva SOLO alla conversione, e per chiudere
un puntino (catasto, nascita del locatore, giorno di pagamento) si passava
dal portal o si mandava il link della Scheda alla parte. Due pezzi, entrambi
sul rail che c'era già:
- **📄 Bozza contratto** (riga senza contratto): `convert` dryRun +
  `draftPdf:true` impagina lo STESSO documento che → Contratto scriverebbe
  (`buildContractPdfBytes` in `api/sign/_contractpdf.js` — una copia:
  `ensureContractPdf` la usa per il contratto vero, il dryRun per la bozza),
  lo mette su `preagreements/<paId>/bozza-contratto.pdf` e lo ricorda sulla
  proposta (`draftPdfUrl/Hash/At/Dots`); stesso hash = stessa bozza, non si
  ricarica. Nessun contratto, profilo o immobile scritto (con `createProperty`
  si valuta sull'immobile che nascerebbe). Il cliente la trova sulla sua
  pagina **accanto al mandato** («Read the lease BOOM would sign for you»:
  ciò che autorizzi, lo leggi) e sopra il tasto di firma; `lookup` la espone
  con la stessa regola del link di firma (soldi ricevuti o dovuto zero) e, a
  contratto nato, espone `contract.draftPdfUrl` = `generatedPDF` finché le
  firme non sono complete.
- **✎ Completa i dati** (riga con contratto non ancora firmato da entrambi):
  il modulo si disegna dai DESCRITTORI del dizionario (`api/profile/link.js`
  → `ask` per parte: `askFor` con `identityAsSection`, etichette IT, i soli
  campi vuoti, `locked` per chi ha firmato) e salva su `api/profile/submit`
  con il **secondo attore**: Bearer ADMIN + `{contractId, role, answers}` al
  posto del token del link. Stesso rail, stesse validazioni (`applyAnswers`),
  stesse scritture (contratto · immobile · profilo nei due schemi), stessa
  rigenerazione del PDF; cambiano SOLO gli effetti che presuppongono la
  parte: all'operatore niente email di conferma alla parte, niente ping
  «scheda compilata», fill-only rilassato (`trusted`: la riga rossa protegge
  dal link intercettato, non da chi ha le chiavi). Il **ruolo 'operator'**
  (`roleWho` nel dizionario) esiste solo per l'attore autenticato: i termini
  che nessuna parte compila (giorno di pagamento, luogo di firma, stato di
  consegna, acconto oneri…). La firma già apposta resta 410 per tutti; i
  termini dell'operatore lo sono con QUALSIASI firma viva. E **il mandato
  congela le condizioni approvate**: un dato che cambiasse la foto (canone,
  date, deposito, parti, modello, clausole — `termsFromContract` di
  `js/mandato-engine.js`) farebbe fallire la firma per mandato con 409;
  `submit` lo dice PRIMA di scrivere (`409 mandate_terms_frozen` con le
  chiavi), e la console lo scrive in chiaro. I co-conduttori restano sulla
  LORO Scheda (link in modale): la loro riga si scrive con la precondizione.
- Test: `tests/contratto/run.mjs` §9 (ruolo operatore: solo i suoi campi
  vuoti, identità come sezione, trusted che rilassa SOLO il fill-only),
  `tests/scheda/run.mjs` §9 (il giro VERO: 404 senza credenziale, 403 non
  admin, termini sul contratto + PDF rigenerato, catasto dal ruolo landlord
  senza email né ping, IBAN corretto da trusted, contrasto con la parte dal
  link, 409 del mandato senza scritture, 410 a firma viva, `link.ask`,
  giunzioni sulla sorgente: guardia prima della scrittura, conferma gated
  sull'attore, impaginato in una copia), `tests/mandato/run.mjs` §10 (bozza:
  PDF vero, proposta aggiornata, store invariato, stesso hash non ricarica,
  esposizione al cliente come il link di firma, porta HTTP, contratto nato →
  generatedPDF, firme complete → null; giunzioni console e pagina),
  `tests/firma/console.mjs` (i bottoni SOLO dove hanno senso).

### 📤 La versione corretta del contratto (`POST /api/contracts/revise`) + ✎ Correggi i dati (3/10/2026)
Il caso: Magic Sign partito, poi il PDF ha difetti (formattazione, dati nel
posto sbagliato, piano e interno errati). L'unica uscita era fuori dal
sistema — correggere il PDF a mano e mandarlo su WhatsApp — e la journey si
spezzava (niente FES sul documento giusto, certificato, fascicolo,
registrazione, /casa). Ora «ok, mettiamolo a posto» resta NEL giro:
- **📤 Carica versione corretta** (riga della console, finché le firme non
  sono complete; admin): il PDF caricato (base64 ≤ 3 MB, oltre via Storage
  sotto `contracts/<id>/revisions/` — `fileUrl` accettato SOLO su
  firebasestorage e sotto quel contratto, mai un proxy) diventa la versione
  N+1 su `contracts/<id>/contract-v<N>-<rand>.pdf`: `pdfSource:'upload'`,
  `sigAnchors:null` (la firma completa appende la pagina delle firme in coda),
  `contractVersions[]` con la storia. È ciò che /sign mostra e che `_finalize`
  firma. Validato con pdf-lib (aggiunta di una pagina + save, come farà la
  firma): un PDF che non si apre è 422 adesso, non un finalize morto dopo.
- **Nessuna rigenerazione lo sovrascrive**: `isUploadedPdf` in
  `ensureContractPdf` vince su force, Scheda e prima firma; il portal
  (`generateContractPDF`) rifiuta lo stesso. `pdfPathOf`: dopo una revisione
  ogni rigenerazione scrive sul path della versione corrente, mai sui byte che
  una firma archiviata ha visto.
- **Una firma sulla versione sbagliata non si sposta**: con una firma viva la
  revisione risponde 409 `signed_needs_void` coi nomi; con `voidSignatures:true`
  (la console lo chiede nominando chi ha firmato) la firma viene ARCHIVIATA in
  `contractVersions[].voidedSignatures` (chi, quando, IP, dispositivo, hash del
  consenso e della firma; l'immagine finché l'archivio sta sotto 300 KB),
  riaperta, e la parte rifirma. Commit condizionato all'`updateTime` letto.
  Firmato da TUTTI o finalizzato → 409 `fully_signed` (lì è un nuovo
  contratto).
- **notify**: se il contratto era già stato mandato in firma, parte «Updated
  contract — please review and sign the new version» al titolare e ai
  co-conduttori (`sendSignInvite({updated:true})`), il proprietario dopo come
  sempre; la proposta torna a `contractSignatureStatus:'none'`.
- **↺ Modello BOOM** (`op:'template'`, e il 🔄 Rigenera del portal quando c'è
  una firma viva o un PDF caricato): rigenera dal modello sui dati di adesso,
  impaginato PRIMA del commit (`renderContractPdf`), stesse regole sulle firme.
- **✎ Correggi i dati**: ✎ Completa i dati mostrava solo i campi VUOTI, quindi
  un piano o un interno sbagliati non si correggevano dalla console. Con
  `all:true` (solo admin) `profile/link` passa `includeFilled` e il modulo
  mostra tutti i dati coi valori attuali; parte SOLO ciò che l'operatore cambia
  (`data-orig`). Su una versione caricata i dati si salvano ma il documento no
  (`pdfUploaded` nella risposta, e la console lo dice).
- Il PDF caricato non è letto dal sistema: canone, date e deposito che
  governano rate, scadenze e registrazione restano quelli del contratto — la
  conferma lo ricorda (si allineano con ✎ Correggi i dati).
Test: `tests/revise/run.mjs` §B (handler veri: byte identici su Storage, la
guardia contro force, firma archiviata e riaperta, la v2 intatta dopo la v3,
firma completa = PDF caricato + pagina firme, `fully_signed`, ↺ che stampa
«piano 2, int. 14» dall'immobile; quattro mutazioni prese),
`tests/firma/console.mjs` (riga I).

**Il secondo giro, dalla review di #266 (3/10/2026).** Quindici rilievi sul
codice appena andato in produzione; chiusi quelli che toccano firme e soldi:
- **Una firma annullata non torna in vita.** `magic-sign/submit`, sul
  conflitto di precondizione, rileggeva e poi riscriveva ALLA CIECA un `upd`
  calcolato sul dato vecchio (coTenants, signatureStatus, signedTermsHash):
  una revisione arrivata nel mezzo veniva cancellata e il co-conduttore
  annullato tornava «firmato». Ora rilettura + ricalcolo + scrittura
  condizionata IN GIRO (3 tentativi, poi 409 `contract_busy`), con versione,
  ordine e firma già apposta ricontrollati sul dato fresco.
- **Si firma la versione letta.** La lookup espone `contractVersion` e
  `pdfSource`; `sign.html` rimanda la versione vista e il server risponde 409
  `version_changed` se nel frattempo è stata caricata un'altra versione (la
  pagina si ricarica da sola). Senza il campo (una scheda aperta prima del
  rilascio) nessun controllo, come prima. ✍️ Firmo io conferma su una
  versione e la ripassa a submit.
- **Il mandato copre le condizioni, non il file.** Firmare PER MANDATO
  (conduttore, o locatore col suo mandato scritto) su un PDF caricato a mano
  esige `ackUploadedPdf:true` (409 `uploaded_pdf_ack_required` senza, prima di
  armare qualunque delega): l'operatore dichiara che il file riporta le
  condizioni approvate, e la dichiarazione resta su
  `<parte>SignedByDelegate.uploadedPdfAck {version, fileName, at}`. Il
  conduttore che firma DA SÉ non dichiara nulla.
- **revise.js**: path UNICO per tentativo (due correzioni concorrenti: il
  perdente sovrascriveva i byte del vincitore prima che il commit lo
  respingesse), il file grande solo dal bucket di BOOM (env o le due forme
  `<progetto>.firebasestorage.app/.appspot.com`) e letto a flusso contato fino
  ai 15 MB, una nuova versione azzera «visto», solleciti e re-inviti
  (`revisionResets`), la proposta perde `coTenantsSignedAt`.
- **Inviti**: `send-link` col titolare firmato raggiunge i co-conduttori che
  mancano (prima 409 `already_signed`: il promemoria del portal non arrivava
  mai a chi bloccava il contratto; i loro link tornano SOLO all'admin — la
  regola delle chiavi di firma: al proprietario parte l'email, il link no) e
  il 409 del locatore porta `waitingFor`;
  cooldown di 12 ore sulle email ai co-conduttori (`CO_INVITE_COOLDOWN_MS` —
  ripremere 🖊/👥 non spamma più; `updated` e il promemoria del cron passano;
  `coRecent` nella risposta); il titolare mai invitato riceve il suo PRIMO
  invito alla firma di un co-conduttore, stampato (prima un «Reminder» a ogni
  firma di co-conduttore).
- **Portal/console**: il rinnovo non eredita versione caricata, firme dei
  co-conduttori, mandato del proprietario né una delega nata da quel mandato;
  l'attivazione archivia la copia FIRMATA (`signedPdfUrl`), mai il PDF senza
  firme chiamato «Signed Contract»; ✎ Correggi i dati può SVUOTARE un campo
  (`{clear:true}`, solo l'operatore autenticato — da un link pubblico
  `clear_not_allowed`), con conferma; il cron filtra gratis prima della
  rilettura completa; `signatureState` non dice «complete» con un
  co-conduttore che manca.
- **Non fatto, di proposito**: nessuna regola `maxDuration` per revise.js
  (`send-sign`, più pesante, gira senza override — una regola a 60 s
  rischierebbe di ABBASSARE il default; vercel.json resta a 49/50).
Test: `tests/revise/run.mjs` §C (C1–C7: la revisione iniettata FRA rilettura
e commit, versione, mandato su file caricato, bucket, flusso oltre 15 MB, due
revisioni concorrenti, timbri, send-link, cooldown, primo invito, svuotare,
rinnovo, attivazione, cron, stato); ogni fix verificato per mutazione (il
`submit.js` di main fallisce C1 esattamente sulla firma resuscitata).

**Il terzo giro (4/10/2026): la copia firmata arriva alle parti, e il PDF
caricato si legge contro i dati.**
- **La copia firmata nell'archivio di chi ha firmato** (`api/sign/_archive.js`).
  Il finalize produceva `signedPdfUrl` ma nessuno lo metteva fra i
  `documents` delle parti: il portal del proprietario legge `documents where
  userId == uid`, e l'unico documento «contratto» nasceva nel browser
  all'attivazione — sul PDF SENZA firme, mai aggiornato. `/casa` non mostrava
  `signedPdfUrl` affatto, e `archiveDeal` archiviava il PDF senza firme col
  nome «Contratto firmato». Ora, subito dopo l'upload della copia firmata e
  prima del semaforo `finalizedAt`, il finalize scrive una copia per ogni
  parte con un profilo — inquilino (EN), proprietario (`property.ownerId`,
  IT), co-conduttori con `userId` — su id DETERMINISTICI
  `contract-signed_<contratto>_<tenant|landlord|co<i>>` (`type:'contract'`,
  `category:'contratto locazione'`, certificato FES accanto,
  `uploadedBy:'boom'` → «FROM BOOM»). Il documento dell'attivazione non viene
  affiancato: si RIPARA sul posto (contenuto sì, `shared`/`createdAt` no), e
  un rerun non aggiunge righe. Senza copia firmata nessun documento: un PDF
  senza firme col nome «firmato» è proprio il difetto. Best-effort, 8 s di
  tetto, mai blocca la firma. 🔄 Rifinalizza su un contratto già finalizzato
  sana l'archivio dei contratti firmati prima del rilascio.
  `activateContract` scrive sugli stessi id (il «Ri-attiva onboarding» non
  raddoppia più) e non tocca mai la copia `source:'finalize'`; `archiveDeal`
  copia `signedPdfUrl` quando c'è; `/casa` mostra «Signed contract» e
  «Signature certificate».
- **Il PDF caricato si legge contro i dati** (`api/contracts/_pdfcheck.js`,
  scopo `contract.pdfcheck` della Centrale AI: haiku, documento, mai in
  locale). Il PDF corretto a mano diventa ciò che si firma, ma rate,
  scadenze, registrazione e mandato seguono i DATI: corretto il canone nel
  PDF e non nei dati, il cliente firma 1.250 e le rate partono a 1.200. Prima
  di qualunque scrittura il modello TRASCRIVE canone (con la sua base:
  mensile · annuo · intera durata), deposito, date, conduttore, locatore,
  piano e interno; il confronto lo fa il CODICE (`compareTerms`: tolleranza
  1 €/0,5 %, nomi come insiemi di parole, «secondo»/«2°», «int. 14»). Una
  differenza → 409 `pdf_terms_mismatch` con le voci, nulla scritto; la
  console le mostra e chiede: Annulla (si corregge con ✎ Correggi i dati) o
  «carica comunque» (`acceptMismatch:true`, la scelta resta su
  `contract.pdfCheck.accepted` con chi). Ciò che il PDF non porta è «non
  letto», mai una differenza; modello giù, risposta illeggibile o PDF oltre
  40 pagine → `unchecked` col motivo, e il caricamento prosegue (avverte, non
  blocca). `op:status` e il piano di ✍️ Firmo io riportano il controllo;
  ↺ Modello BOOM lo azzera.
Test: `tests/finalize/run.mjs` §3b (attivazione riparata e non affiancata,
proprietario e co-conduttore, rerun senza righe nuove, il verbale non si
tocca, 🔄 Rifinalizza che sana un contratto vecchio, giunzioni su finalize/
portal/`/casa`; quattro mutazioni prese — e lo stub che spezzava i path su
una collection chiamata «documents», corretto) · `tests/revise/run.mjs` §D
(confronti puri per base, forma e «non letto»; la porta vera con un Anthropic
finto: 409 prima di Storage, il PDF vero al modello del registro, carica
comunque, match, illeggibile, modello giù, oltre 40 pagine, template;
giunzioni console e Firmo io; sei mutazioni prese).
