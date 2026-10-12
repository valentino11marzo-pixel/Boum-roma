# Firma — Magic Sign, chiavi di firma, co-firma, mandati, firma completa, email del contratto

> Dettaglio e storia di quest'area, spostati da CLAUDE.md il 12/10/2026 senza
> riscrivere nulla: stesse sezioni, stesso ordine. Le novità dell'area si
> aggiungono QUI (3-8 righe nella sezione giusta: cos'era, cosa cambia, dove
> sta il test). La mappa del sistema è in `CLAUDE.md`, le priorità in `ORA.md`.

### Co-firma multi-conduttore (coTenants[])
Due o più conduttori firmano DAVVERO, ciascuno col proprio link. Token
DERIVATI (`cosignToken` in `api/magic-sign/_shared.js`:
sha256("cosign:<contractId>:<idx>:<HOMIE_SECRET>"), ref
`<contractId>.c<idx>.<token>` nello stesso `?sign=`): niente da coniare
né migrare — ogni contratto con `coTenants[]` ha già i suoi link;
ruotare il secret revoca tutto. lookup rende il co-conduttore come
tenant (prefill dalla SUA identità sul contratto; il ruolo vero si
rideriva dal token al submit); la firma vive DENTRO `coTenants[idx]`
(riscrittura dal dato fresco, protetta dalla precondizione updateTime);
`tenantSideComplete()` = principale + TUTTI i co-conduttori, ed è la
condizione che sblocca la controfirma del locatore (sequenziale) e il
"Tocca a Lei". send-link lato tenant invita anche i co-conduttori;
certificato FES e pagina firme mostrano i loro blocchi (fino a 2 in
pagina, hash del documento include le loro firme). Sorgenti dei
coTenants: conversione PA (tenants[] della proposta) e Deal Link con
`cofirma:true` (i conviventi del payload diventano co-firmatari, clausola
di co-intestazione automatica). Test: notify 60→68.

**I co-conduttori senza link (3/10/2026 — «non riceve mai il link, quindi
non firma mai, e il proprietario legge "not your turn yet"»).** La co-firma
rende i co-conduttori firmatari veri (`tenantSideComplete`), ma l'invito
esisteva SOLO in `sign/send-link.js` (portal): il 🖊 Magic Sign della console
mandava il link al solo titolare, ✍️ Firmo io si fermava su «mancano i
co-conduttori» senza dare i loro link, e il promemoria del `reminder-cron`
leggeva il contratto con un `parseDoc` che appiattisce array e mappe a null —
`coTenants` spariva, il lato conduttori risultava completo e partiva al
PROPRIETARIO «✍️ Tocca a Lei» con un link che poi rispondeva «non è il tuo
turno». Ora `api/sign/_cosign.js` è la copia unica (chi manca, il suo link
derivato, l'email a chi ce l'ha, `coSignInviteAt.<idx>` stampato): la usano
send-sign (anche `coOnly:true` = solo i co-conduttori, dal bottone 👥),
send-link, `notifyPartialSignature` (alla firma del titolare a chi non era
mai stato invitato — sana i deal già fermi — e col promemoria a tutti quelli
che mancano; la conferma al titolare dice CHI manca), il cron (che rilegge il
contratto intero prima di decidere) e sign-for (torna i loro link). Chi non ha
un'email torna nella risposta col link: la console lo offre su WhatsApp
(`showCoLinks`). Il link del proprietario risponde `awaiting_tenant` con
`waitingFor` (nomi e ruolo, `tenantSideWaiting`) e `sign.html` lo dice in
italiano; la proposta (`coSignUrls`, mai le email) e la pagina del cliente
(`waitingCoTenants`, solo i nomi) sanno chi manca; la riga della console, a
titolare firmato, ha 👥 Link co-conduttori come mossa primaria e nasconde il
link del proprietario finché manca qualcuno. Test: `tests/revise/run.mjs` §A,
`tests/firma/console.mjs` (riga H).

### POST `/api/magic-sign/lookup`
Public endpoint for the Magic-Sign UI. Body: `{ token }`. Looks up the
contract by its tenant/landlord sign token (the admin-only `signTokens`
store — see «Le chiavi di firma fuori dal contratto»), returns sanitized
`{role, contract, property, signer, otherParty}`. Replaces the previous
flow which had the browser issue `db.collection('contracts').where(...)`
anonymously — denied by `firestore.rules`.

### POST `/api/magic-sign/submit`
Public endpoint that persists the contract signature on behalf of the
anonymous Magic-Sign user. Body includes the token, signature data URI,
identity payload (incl. `docIssuer`/`docIssueDate`), phone, consent record.
Runs every Firestore write under admin credentials (signature + identity +
landlord profile + RLI deadline + lead closure + property status + listing
sync + payment schedule + tenant user bootstrap). All those mutations are
admin-only per the rules. The user-profile sync writes BOTH users schemas
(sign `cf/dob/…` AND wizard `codiceFiscale/birthDate/…`) so the Allegato
generators and the RLI scheda always see identity collected at signing.

### Le chiavi di firma fuori dal contratto (`api/sign/_tokens.js` + `POST /api/sign/links`) — 1/10/2026
**Il difetto**: `contracts/{id}` portava `tenantSignToken` e `landlordSignToken`
in chiaro, e le rules fanno leggere il contratto all'inquilino (`tenantId`) e
al proprietario (`ownsProperty`) — Firestore non nasconde un CAMPO. /casa legge
il contratto: l'inquilino aveva `/sign?sign=<landlordSignToken>` e, a lato
conduttori completo, `submit` accettava quella firma come del locatore; il
proprietario leggeva il link dell'inquilino. In più tre porte HTTP davano il
link dell'altra parte a un chiamante proprietario: `preagreement/convert` e
`send-sign` (owner/landlord ammessi, entrambi i link in risposta — e il
contratto `pa_<paId>`, leggibile dal proprietario, ne rivela l'id),
`sign/send-link` (l'`url` dell'inquilino al proprietario che lo sollecita),
`profile/link` (il link FIRMA dei co-conduttori). `api/owners/vault.js`,
citato nella segnalazione, non esiste nel repo.
- **Il deposito**: `signTokens/{contractId}` = `{ contractId, tenant,
  landlord }`, admin-only nelle rules. Token CASUALI per contratto (UUID, come
  prima — non derivati da HOMIE_SECRET come cosign/scheda: quel segreto vive
  anche sul Mac di Homie, e firmare come parte principale non deve dipendere
  da lui). Formato del link invariato: i link già nelle email restano validi.
  `ensureSignTokens` conia dove manca (solo per chi non ha firmato e solo per
  i ruoli chiesti), SPOSTA un token ancora in chiaro col suo valore, e scrive
  sotto precondizione (create 409 / updateTime): sei chiamate concorrenti =
  un solo token per parte. `readSignTokens` non conia mai.
  `findContractByToken` → `findSignTokenHolder`: prima il deposito, poi (solo
  transizione) il campo in chiaro — che però NON vale se il deposito tiene un
  token diverso per quella parte (ruotato = revocato).
- **Chi scrive**: `convert` (subito dopo la creazione), `send-link`,
  `sign-for`, `notifyPartialSignature` (il «Tocca a Lei» conia il link della
  controparte se manca), `/api/sign/links`. Il portal non conia più nulla
  (wizard, saveContract, rinnovo, Innesto, Share Hub, promemoria): i link li
  chiede a **`POST /api/sign/links {contractId}`** (`fetchSignLinks`), che
  risponde col SOLO link spettante — admin entrambi (+ co-conduttori),
  proprietario dell'immobile il suo, inquilino del contratto il suo, altri
  403. La firma in prima persona (`openSignContractModal`) apre il link del
  server e non ricade più in silenzio sul modale legacy (che scrive la firma
  lato client saltando le guardie di `submit`). Il cockpit legge `signTokens`
  (admin) e ruota i token nel deposito, cancellando quello in chiaro.
- **Le porte**: `convert` e `send-sign` restituiscono i link SOLO all'admin
  (`withoutSignLinks`); `send-link` l'`url` solo all'admin o al proprietario
  per il SUO link; `profile/link` il link firma dei co-conduttori solo
  all'admin (al proprietario resta lo stato — dal 5/10 nemmeno la Scheda,
  vedi «Le tre letture risparmiate»); `send-sign` i link
  dei co-conduttori (`coTenants[].url`, dal giro `_cosign.js`) solo
  all'admin, al proprietario i nomi. `contracts/revise` (admin) e il
  sollecito al titolare in `notifyPartialSignature` leggono il deposito:
  nessun file `api/` legge più i campi in chiaro dal contratto (regola di
  classe in `tests/signtokens`, presa al merge con #265/#266).
- **Le rules**: `match /signTokens/{x}` admin-only (senza, default-deny e il
  server non scriverebbe — la lezione propertyLocks); su `contracts` nessuno,
  admin e server compresi, può più AGGIUNGERE o CAMBIARE i due campi
  (`noPlainSignTokens` in create, `keepsPlainSignTokensOut` in update —
  toglierli sì); l'inquilino non può più scrivere `tenantSignToken`.
  Verificate nell'emulatore (`tests/rules`, 80 asserzioni; 6 cadono con le
  regole vecchie).
- **La migrazione**: `migrateLegacySignTokens` sposta nel deposito i token in
  chiaro (query `> ''`, i `null` non sono segreti) e li CANCELLA dal contratto
  (campi nella updateMask assenti dal corpo), sotto precondizione: un
  contratto firmato nel mezzo si salta e si riprende al giro dopo; un token
  già ruotato nel deposito vince (conflitto contato). Gira ogni ora nel
  reminder-cron (dopo incasso, journey e countdown, col tempo che resta,
  tetto 8s; a regime due query vuote) e su richiesta da
  `POST /api/sign/links {op:'migrate', dryRun?}` (admin). Finché non è
  passata, il ramo legacy della lettura tiene vivi i link vecchi.
- **Da sapere**: un contratto nuovo non ha token finché qualcuno non chiede
  un link o manda un invito (il Gestore sollecita solo chi ha già un link —
  prima l'Innesto coniava token anche su contratti firmati su carta). Lo
  scope `landlord` vale per il proprietario dell'immobile anche con la delega
  armata: è la sua firma. Le rules non sono nel CI (`npm test`): vanno
  deployate (job `deploy-rules`) PRIMA che i client vecchi ripartano — una
  scheda del portal aperta da prima del deploy che crea un contratto coi
  token in chiaro riceve PERMISSION_DENIED finché non si ricarica.
- Fuori scopo, segnalato: `depositPayToken` sta ancora sul contratto (apre
  solo una Checkout del deposito). Il link della Scheda dell'inquilino al
  proprietario è chiuso dal 5/10/2026 (`profile/link`, solo admin).
Test: `node tests/signtokens/run.mjs` (52 check, handler veri: deposito,
concorrenza, giro firma completo col «Tocca a Lei», porte per ruolo,
migrazione con precondizione e link spediti che restano validi, regola di
classe «nessun file scrive un token in chiaro»; quattro mutazioni prese) +
`tests/mandato` e `tests/notify` (il contratto convertito/inviato non porta
token, il proprietario che sollecita non vede il link dell'inquilino, un
contratto legacy firma ancora).

### Watchdog firme (reminder-cron)
Due guardie: firme PARZIALI ferme >48h → re-nudge automatico alla
controparte (max 3, cooldown 24h col promemoria manuale); inviti FREDDI
(`signatureStatus none`, invito inviato >72h, nessuna firma) → re-invito
"Reminder —" al conduttore (max 2, `inviteNudgeCount`;
`shouldReinvite()` esportato e testato). Un contratto MAI invitato non
viene toccato: resta una decisione umana.

### La firma completa che non muore a metà (1/09/2026 — il contratto di Rute)
Il giorno del primo contratto firmato da entrambe le parti con **Storage
giù** (403 "Permission denied" su ogni upload admin, mentre Firestore
funzionava), il finalize ha mostrato tre difetti di classe, tutti chiusi:
- **La sonda Storage** (`_finalize.js`): il PRIMO upload della catena è il
  certificato FES. Se Storage lo rifiuta si esce SUBITO — nessuna
  scadenza, nessun magic link, nessuna email a metà, UN avviso urgente al
  giorno su `agentNotifications` (`finstor_<id>_<giorno>`, → Telegram
  entro un minuto) — e il watchdog ritenta ogni 15′ a costo ~1s finché
  Storage non torna; al primo giro sano parte il finalize INTERO. Prima il
  run creava ~10 obbligazioni con id auto, poi moriva ucciso a 60s prima
  del semaforo `finalizedAt`: il retry del cron duplicava le scadenze A
  OGNI GIRO e il 504 spegneva journey, incasso SEPA e countdown visite
  (che nel cron stanno DOPO — ora protetti anche da un budget guard).
- **Scadenze idempotenti + bonifica**: id deterministico
  `dlfin_<contractId>_<i>`, e a ogni finalize la passata che tiene la
  prima copia per titolo ed elimina le repliche `source:'finalize'`
  auto-generate dalla tempesta (le RLI di submit non si toccano MAI).
- **La CI che mentiva** (`.github/workflows/ci.yml`): `deploy | tee` senza
  `set -o pipefail` → l'exit status era quello di TEE, e il job
  deploy-rules usciva VERDE con il FIREBASE_TOKEN scaduto e le regole NON
  deployate (successo il 31/08 sera). Ora pipefail + la prova positiva
  (`grep "Deploy complete"`). E `storage.rules` ha guadagnato i match
  mancanti `rendiconti/` e `site/` (la lezione contracts/, pagata di nuovo
  al primo run del rendiconto).
Test: `node tests/finalize/run.mjs` (27 check — storage giù per mutazione,
bonifica della tempesta, giunzioni e CI asserite sulla sorgente).

**La bonifica che nessuno premeva** (13/09/2026): la passata dei doppioni
girava SOLO dentro un finalize o su 🔄 Rifinalizza — e finalize esce subito
a `finalizedAt` scritto. Nel dump del 13/09 il contratto di Rute portava
ancora **204 scadenze, 200 doppioni** (25 copie × 8 titoli, `source:
'finalize'`). `sweepFinalizeDuplicates()` (`_finalize.js`) gira dal
`reminder-cron` una volta al giorno (04 UTC): una query sulle scadenze
auto-generate, per contratto+titolo si tiene la copia migliore (stato
non-pending → doc `dlfin_` → la prima) e si eliminano le altre; le manuali
non si toccano. Test in `tests/notify/run.mjs` §1f (idempotenza compresa).
Nello stesso dump: `viewings` «ILLEGGIBILE» (403) perché la collection non
aveva NESSUNA regola (slots.js scrive `viewingRequests`) — e la
`Promise.all` del Richiamo e della Miniera, che leggevano `viewings`,
saltava intera. Ora leggono `viewingRequests` e `viewings` ha la regola
admin (un onesto «0 documenti» invece del 403).

### Il ciclo email del contratto (`api/sign/_notify.js` + `send-link`)
UN design system per ogni email della piattaforma
(`api/preagreement/_notify.js`: masthead nero col MARCHIO reale — PNG
hosted `android-chrome-192x192.png`, Gmail scarta data-URI e SVG — carta
bianca, pill oro, dark-mode aware; esporta `shell/btn/btn2/para/fine/row/
hero/tiles/timeline/includes/rule`). Lingua del lettore: inquilino EN,
locatore e operatore IT. Tutto server-side (Nodemailer), best-effort e
time-boxed — mai può bloccare una firma.
- `POST /api/sign/send-link` — admin/owner/landlord (Bearer; owner solo
  sui propri immobili). L'INVITO a firmare per QUALSIASI contratto:
  backfilla il token mancante (contratti legacy), invia nel design system,
  stampa `signInvite<Role>At`. Sequenziale: lato locatore su contratto non
  ancora firmato dall'inquilino → 409 `awaiting_tenant` (il suo link parte
  in automatico alla firma dell'inquilino). Sostituisce l'EmailJS
  `sendSignatureEmail` del portal (browser-only, rimosso): saveContract e
  il promemoria firme ora chiamano questo endpoint.
- `notifyPartialSignature` / `notifyAdminContractSigned` (chiamate da
  magic-sign/submit e reminder-cron): conferma al firmatario + "Tocca a
  Lei"/"your turn" alla controparte col suo link; milestone IT all'admin
  (`ADMIN_NOTIFY_EMAIL`, default valentino@boom-rome.com).
- **Il contratto firmato viaggia in ALLEGATO** (`_finalize.js
  buildSignedContract`): alla firma completa il server scarica
  `generatedPDF`, gli APPENDE la pagina delle firme (firme grafiche,
  nomi, data/ora, hash, rinvio al certificato) e salva
  `contracts/<id>/contratto-firmato.pdf` → `contract.signedPdfUrl`.
  Contratti legacy senza PDF sorgente: si salta senza rumore, alle email
  resta il certificato (mai bloccare una firma).
- **Download e anteprima del contratto** (22/09/2026): le tre azioni del
  portal leggono il record dal server con tetto di 12 secondi e preferiscono
  `signedPdfUrl` al PDF sorgente. Non rigenerano né aggiornano più il contratto
  durante una lettura; il documento mancante indica l’azione esplicita.
  «PDF firmato» richiede la copia canonica: il vecchio flag locale non prova
  che il file contenga le firme. Errori e popup bloccati sono visibili.
  Test: `tests/contractpdf/downloads.mjs`, handler reali, IO simulato e mutazioni.
- `sendWelcomeEmails` (da `_finalize.js`): welcome tenant EN (portal
  magic-link, saldo deposito se pendente, timeline utenze/TARI/residenza)
  + landlord IT (passi fiscali per regime, cessione fabbricato se
  extra-UE) — entrambe con **contratto firmato + certificato FES in
  allegato PDF** (link nel corpo come rete di sicurezza; download
  time-boxed, un allegato fallito non ferma mai l'email).
- `sendCafDossier` (da `_finalize.js`, UNA volta — idempotente su
  `finalizedAt`): il fascicolo asseverazione/registrazione con anagrafica
  COMPLETA di entrambe le parti (post-firma lo è per costruzione), catasto,
  termini, link + **3 PDF in allegato (contratto firmato, certificato FES,
  Fascicolo Fiscale) — pronto da inoltrare ad ARPE/CAF così com'è** →
  `CAF_EMAIL` (default **valentino@boom-rome.com**). Prima viveva in
  portal-app.js via EmailJS e partiva SOLO dal vecchio flusso di firma nel
  portal — su /sign non partiva affatto.
- **Pack Registrazione** (`api/sign/_pack.js` + `api/_zip.js` ZIP writer
  STORE senza dipendenze npm): UN file
  `contracts/<id>/pack-registrazione.zip` con TUTTO ciò che servono RLI +
  asseverazione ARPE — contratto firmato, certificato FES, Fascicolo
  Fiscale, visura/planimetria/APE/delega dal dossier immobile
  (`properties.dossier.*`), documenti identità (`contract.identityDocs`,
  il `kind:'extra'` = attestazione esigenza ora sopravvive alla
  conversione PA→contratto), più `00_INDICE.txt` con anagrafica+CF,
  motivazione transitorietà e la CHECKLIST di cosa manca e dove
  caricarlo. Generato alla firma completa (budget rigido 25s dentro
  finalize — mai allunga la firma) e rigenerabile con **📦 Pack** sulla
  riga contratto (`POST /api/fiscal/pack`, admin, maxDuration 60). URL +
  mancanti persistiti (`registrationPackUrl/Missing/At`); l'email CAF
  porta il link ZIP e l'avviso "⚠ Nel pack mancano: …".
- **Journey gate firme** (`journeyEligible()` esportata+testata): un
  contratto invitato alla firma digitale ma non `complete` è nel funnel
  firma, NON nel ciclo casa — niente T-30 di benvenuto a chi non ha
  firmato. I legacy firmati su carta (nessun invito a sistema) restano
  dentro il journey.
- La Scheda completa manda al cliente una conferma one-shot
  (`scheda<Role>ConfirmedAt`) nel suo idioma (`api/profile/submit.js`).
- Due bug di produzione trovati dai test (pdf-lib REALE nella suite):
  il certificato FES falliva SEMPRE (freccia "→" non WinAnsi) e finalize
  leggeva `cedolareSecca === true` mentre i contratti reali portano 'si'
  → obbligazioni del regime sbagliato a scadenzario. Entrambi corretti.

### 🖊 Firma ora (riga contratto → `openFirmaOra`)
Firmare, non solo sollecitare: il pannello apre il link VERO della parte
(`/sign?sign=<token>`) sul dispositivo dell'operatore — il cliente firma
col dito davanti a lui, e data/ora/dispositivo finiscono nel certificato
come sempre. La **delega del proprietario**, prima decidibile SOLO alla
creazione del contratto, si attiva e si annulla in qualsiasi momento
(rifiutata se `landlordSignature` esiste): scrive `landlordDelegate` nello
schema che `magic-sign/lookup`, `submit` e `sign.html` già leggono, quindi
il documento dice «firma X per conto di Y». **Al posto del conduttore non
si firma mai SENZA MANDATO SCRITTO** — quella non è una delega, è una firma
falsa, e la riga è scritta nel pannello, non lasciata al buonsenso.

### Il mandato a firmare del conduttore (9/09/2026 — «devo poter firmare io per il cliente»)
Il caso vero: il cliente ha accettato e firmato la proposta, pensa sia
tutto fatto, e l'email col link del contratto resta chiusa per settimane —
mentre i termini del contratto sono ESATTAMENTE quelli della proposta.
Prima l'unica via era rincorrerlo; il pannello diceva (giustamente) che al
posto del conduttore non si firma. Ora il conduttore può conferire a BOOM
un **mandato con rappresentanza** (art. 1703 ss. c.c.) a sottoscrivere il
contratto in suo nome — e siccome il contenuto è predeterminato dalla
proposta, il doppio ruolo dell'agenzia non fa conflitto (art. 1395 c.c.,
dichiarato nel testo). Le regole, tutte verificate per mutazione:
- **Si dà SULLA PROPOSTA, con una spunta A PARTE** (`pre-agreement.html`,
  checkbox `paMandate`, mai pre-selezionata, mai obbligatoria): chi la
  lascia vuota firma col proprio link come sempre. La console la OFFRE
  con una **scelta esplicita** (`askMandate === true`, interruttore NON
  attivo di default, persistito nel create e nell'edit): assente = non
  offerto, quindi le proposte nate prima non cambiano comportamento e
  nessuna migrazione serve; senza offerta la spunta nel body non vale
  (`submit.js`: `askMandate === true && b.mandate === true`). La card in
  Firma ora dice che il mandato riguarda **solo il conduttore
  principale** e che i co-conduttori firmano separatamente col proprio
  link (la guardia del delegato vale solo per `role === 'tenant'`).
  Il testo è UNO (`api/preagreement/_consent.js` → `PA_MANDATE_TEXT`,
  hash sha256): la pagina lo mostra parola per parola (test: pagina ==
  server), submit lo registra con hash/data/ip/ua, il PDF della proposta
  lo ristampa come sezione «6. Mandate to sign».
- **LE CONDIZIONI APPROVATE sono una FOTO presa all'accettazione, v2**
  (revisione PR #233, 10/09/2026 — la prima versione calcolava
  `termsFingerprint(contract)` ALLA CONVERSIONE: base nata dopo, e cieca
  su immobile, clausole e oneri). `js/mandato-engine.js` (UMD →
  `window.BOOM_MANDATO`, import ESM da `api/**`) è la copia unica:
  `termsFromProposal(pa)` e `termsFromContract(contract)` producono lo
  STESSO oggetto canonico da due sorgenti — immobile (`propertyId`),
  parti (locatore + conduttori, testo normalizzato senza accenti),
  modello (`modelOfLease`, la regola che `convert.leaseType` ora delega),
  decorrenza/scadenza, canone, deposito, oneri accessori e se si
  incassano col canone, cadenza, cedolare, clausole (insieme ordinato,
  esclusa la clausola automatica dei co-conduttori). NON entrano, di
  proposito: extra e provvigione (non stanno nel contratto di locazione),
  add-on, `clauseVersion` (è il nostro impaginato). `submit.js` la
  scrive SEMPRE all'accettazione (`pa.approvedTerms {version:2, at,
  terms, hash}`, hash = sha256 con prefisso `mandato:v2:`); `convert.js`
  la prende da lì (`termsSource:'proposal-at-acceptance'`; per una
  proposta accettata prima della v2 la ricava dalla proposta stessa,
  che la console non lascia più modificare, e lo DICHIARA:
  `'proposal-at-conversion'`) — mai dal contratto, che è ciò che si
  VERIFICA: alla conversione `termsMatch`/`termsDiff` (un modello scelto a
  mano diverso dalla proposta = mandato registrato ma non spendibile), e
  `tenantName` va sul contratto perché le parti si confrontano lì.
  `mandateCheck(contract)` in `_shared.js` è versionato: v2 → foto, v1
  (mandati nati prima, senza `termsVersion`) → `termsFingerprint`; il
  terms-freeze fra le firme (`signedTermsHash`) è intatto. Il PDF della
  proposta accettata va su `contracts/<id>/mandato-conduttore.pdf`.
- **Il server è l'ultimo giudice** (`magic-sign/submit.js`, guardia PRIMA
  della costruzione della firma): `tenantDelegate` senza
  `tenantMandate.given` → **403 `mandate_missing`**, nessuna firma, avviso
  urgente; condizioni diverse dalla foto → **409 `mandate_terms_changed`**
  con `changed:[chiavi]`, nessuna firma. **L'incompatibilità si vede
  PRIMA del tentativo**: la card del portal calcola il diff col motore
  («canone mensile: 1500 → 1550 · clausole»), nasconde «Firmo io» e
  `setMandatoTenant` rifiuta l'attivazione; `magic-sign/lookup` espone
  `tenantMandate.termsOk/termsChanged` e `sign.html` lo scrive in rosso.
  Con mandato valido la firma passa e stampa `tenantSignedByDelegate
  {name, onBehalfOf, basis, signedAt, mandateRef, mandateAt, mandateHash}`.
- **La strada automatica non perde il mandato**: `submit.js` passava a
  `maybeAutoConvert` la proposta letta PRIMA della patch — il contratto
  automatico (il caso normale con l'immobile collegato) nasceva senza
  `paAcceptance` e senza `tenantMandate`. Ora viaggiano `consent`,
  `mandate`, `approvedTerms`, `acceptedAt`; webhook e resolve rileggono la
  proposta e non avevano il difetto.
- **Chi ha firmato davvero resta scritto ovunque**: `sign.html` mostra il
  banner «You are signing as X on behalf of the tenant Y — written mandate
  given on … with proposal …» (e avverte se il mandato manca); la pagina
  delle firme e il certificato FES stampano sotto il riquadro le due righe
  di `delegateLines()` («Firma per mandato: X» / «per conto di Y - mandato
  del gg/mm/aaaa (ref)» — anche per la delega del locatore, che prima
  taceva); la scheda ARPE porta la firma con «X per conto di Y», «mandato
  del …», e la riga della firma digitale sulla proposta; il Pack aggiunge
  `10_Mandato_conduttore.pdf` solo quando la firma è per mandato.
- **Nel portal**: card «Mandato del conduttore» in 🖊 Firma ora — senza
  mandato dice dove si dà (sulla proposta), con mandato mostra data/
  proposta/documento e il bottone «Firmo io per il conduttore (mandato)» →
  `setMandatoTenant` scrive `tenantDelegate {name, onBehalfOf, basis, at,
  by}` (rifiutato senza mandato o a firma già apposta), poi si apre il link
  del conduttore e si firma. La riga del contratto nella console PA dice
  «🖊 Mandato a firmare ricevuto il …». Un rinnovo NON eredita mandato,
  deleghe, firme per conto né accettazione (atti di QUEL contratto).
- **La scheda si firma con la proposta** (stessa release — «pronta e auto
  firmata dal cliente quando accetta»): `PA_CONSENT_TEXT` dichiara che
  l'accettazione firma ANCHE la scheda di calcolo del canone (Allegato
  2/B) e che le informazioni sull'immobile sono fornite dalle parti;
  submit registra `consent {text, hash, schedaSigned:true}`, convert lo
  porta su `contract.paAcceptance {at, ref, hash, schedaSigned}`, e
  `firmaOf()` in `fascicolo.js` stampa sul modulo — sotto la riga di firma
  di ciascuna parte — la firma grafica del contratto (PNG incorporato) più
  le righe che la qualificano («firmato digitalmente il …», «firma digitale
  sulla proposta BOOM-… del …», delega/mandato). La pagina della proposta
  mostra PRIMA della firma la card «Rent calculation sheet (Allegato 2/B)»
  coi numeri calcolati DAL SERVER sull'immobile collegato
  (`lookup.js` → `schedaSummary`: zona, superficie convenzionale,
  parametri, fascia, massimo, canone e verdetto) e dichiara i buchi
  («Still to complete on the sheet: cadastral data»); `schedaGaps()`
  (zona · mq · catasto · canone) è la stessa lista che la console PA
  segnala nella riga del canone («scheda 2/B: manca il catasto») e che il
  fascicolo riporta — la scheda esce completa perché i buchi si vedono
  PRIMA, non dopo la firma.
- **Il bug della pagina RLI** (stessa release): `fascicolo.js` stampava
  `rent×12` e «L2» solo sugli studenti; ora legge `FIELDS.rliFacts`
  (tipologia L2 per tutti i concordati, importo = corrispettivo per la
  durata sotto i 12 mesi, scadenza da min(stipula, decorrenza), articolo e
  accordo per modello — il 3+2 cita art. 2 c. 3 e l'accordo 27/07/2023).
- Test: `node tests/mandato/run.mjs` (98 check — handler VERI su Firestore
  in memoria: proposta → accettazione con mandato → conversione →
  lookup → 403 senza mandato → 409 termini cambiati → firma per mandato
  stampata; **la strada automatica** (submit con `autoConvert`, dovuto 0:
  mandato selezionato / non selezionato / richiesta ripetuta); le
  condizioni approvate v2 (immobile, clausole, oneri, modello, locatore,
  cadenza cambiati DOPO la conversione → 409 con `changed`; modello
  scelto a mano ALLA conversione → `termsMatch:false` e 409; proposta
  manomessa dopo l'accettazione → la base resta la foto; proposta senza
  foto → provenienza dichiarata; mandato v1 ancora valutato con la regola
  v1); `askMandate` assente = non offerto; scheda ARPE con le firme;
  pagina == server sui testi; Valutazione dall'immobile con la scheda a
  pagina 2, buchi dichiarati, 403 non admin).

### ✍️ Firmo io — la firma in un tap dalla console (21/09/2026 — «loro perdono l'interesse»)
Il caso vero: il cliente accetta e firma la proposta, pensa sia tutto fatto,
e l'email col link del contratto resta chiusa per settimane — mentre i
termini del contratto sono ESATTAMENTE quelli della proposta. L'operatore
vuole «darlo per firmato e sbloccare tutto l'iter». La regola di sempre non
si allenta: al posto del conduttore SENZA mandato scritto non si firma —
quella è una firma falsa, e il server risponde 403. Quindi la velocità si
costruisce sul mandato, in tre pezzi:
- **`POST /api/preagreement/sign-for`** (Bearer **admin** — firmare per gli
  altri è l'atto dell'operatore, non di un owner). `op:'signature'` salva la
  firma dell'operatore disegnata UNA volta nella console (canvas → PNG →
  `operatorSignatures/<uid>`, scritto e letto SOLO dal server: nessuna regola
  Firestore da deployare, il browser non la rilegge mai). `op:'status'` è il
  piano (mandato sul contratto? condizioni ancora quelle? delega del
  proprietario? co-conduttori? firma salvata?) che la console LEGGE e mostra
  prima di chiedere conferma. `op:'sign'`: crea il contratto se manca
  (convert idempotente, come 🖊), arma `tenantDelegate`, e firma per il
  conduttore passando **dallo STESSO `magic-sign/submit` in-process** (il
  trucco di `employees/_fiducia.js`: stesse guardie — `mandateCheck` 403/409,
  terms freeze, already_signed, sequenza — stesso finalize, stessa stampa
  sulla proposta; nessuna seconda strada per scrivere una firma). Poi, se il
  contratto porta `landlordDelegate` — o l'operatore lo arma nel tap con una
  **base scritta dichiarata** (`landlordBasis`, ≥ 8 caratteri, stampata sul
  certificato: senza → 400) — controfirma per il proprietario nello stesso
  tap: contratto firmato, certificato FES, fascicolo, pack, journey, tutto
  come dopo due firme normali. I co-conduttori NON sono coperti dal mandato
  del principale: il tap si ferma e lo dice (`waitingCoTenants`); senza
  delega del proprietario si ferma con il suo link (`landlordPending`). Le
  precondizioni (firma salvata, base della delega) si controllano PRIMA di
  qualunque scrittura: un 409 non lascia un contratto a metà. IP e UA nelle
  prove sono quelli della richiesta dell'operatore.
- **`POST /api/preagreement/mandate`** (pubblico, token = credenziale, rate
  limit) — **il mandato dato DOPO l'accettazione**: per il cliente che ha già
  accettato è UN tap, non una firma intera. Vale SOLO se la console l'ha
  chiesto (`askMandate === true`, altrimenti 403 `not_offered`), `mandate:true`
  esplicito (mai dedotto), stesso testo e hash della spunta all'accettazione,
  base = la foto delle condizioni approvate (o la proposta stessa, chiusa,
  per quelle accettate prima della v2 — dichiarato). Il contratto già nato
  eredita il mandato con la STESSA costruzione della conversione
  (`tenantMandateFor`, ora esportata da `convert.js`: una copia sola), mai
  sotto una firma viva del conduttore; l'operatore riceve la card
  `contract.mandate_given`. Idempotente (`already`).
- **Console** (`pre-agreement-admin.html`): col mandato in archivio la
  primaria della riga è **✍️ Firmo io (mandato)** (Magic Sign resta come
  secondaria); senza, **🖊 Chiedi il mandato** attiva `askMandate` e apre
  WhatsApp col link `#mandate` (la pagina della proposta mostra la card
  «Let BOOM sign the lease for you», spunta a parte + bottone, mai
  pre-selezionata); a inquilino firmato con delega armata, **✍️ Controfirmo
  io (delega)**. Il tap legge il piano, chiede conferma con nomi, date e
  base, e alla prima volta apre il pad della firma. **Il mandato è ora
  OFFERTO di default sulle proposte nuove** (`fMandate` checked): la spunta
  del cliente resta un atto a parte. `4+4` e «canone annuo» sotto i 12 mesi
  restano dove erano (vedi la sezione del verbatim).
- Test: `node tests/mandato/run.mjs` §9 — il giro VERO (Firestore in
  memoria, jsPDF e pdf-lib reali): proposta col mandato → status senza
  scritture → 409 senza firma salvata (contratto NON nato) → 400 senza base
  della delega → 403 non-admin → **un tap = conduttore per mandato +
  locatore per delega + finalize** (firmato, certificato, stampa sulla
  proposta) → secondo tap `alreadySigned`; SENZA mandato → 403 e nessuna
  firma → `mandate.js` 403 se non chiesto, 200 se chiesto (contratto già
  nato che eredita il mandato col documento) → il tap firma il conduttore e
  lascia al proprietario il suo link; condizioni cambiate → 409 con il diff;
  giunzioni sulla sorgente (una sola strada per la firma, precondizioni
  prima della conversione, 60s in vercel.json, console e pagina).

### 🏠 Il mandato scritto del proprietario — la controfirma smette di reggersi sulla parola dell'operatore (23/09/2026)
Il pezzo lasciato fuori dal 21/09: ✍️ Firmo io firmava per il conduttore in
forza del SUO mandato scritto, poi controfirmava per il proprietario «per
delega» su una **base scritta dichiarata dall'operatore nel tap**
(`landlordBasis`) — cioè sulla parola dell'operatore, non su un atto del
proprietario. Ora il mandato lo dà **il proprietario**, con un tap, dal link
che ha già: la sua Scheda (`/scheda?t=<contratto>.l.<token>#mandato` — dati,
documento e mandato in una visita, in italiano perché il locatore è
italiano). Lo specchio esatto del mandato del conduttore:
- **`api/preagreement/_consent.js` → `LL_MANDATE_TEXT`/`LL_MANDATE_HASH`**
  (IT, art. 1703 ss. e 1395 c.c., revocabile per iscritto fino alla firma):
  il testo è UNO — `profile/lookup` lo manda alla Scheda, che lo mostra
  così com'è (nessuna copia nella pagina), `profile/mandate` lo registra.
- **`POST /api/profile/mandate`** (pubblico, token della Scheda = credenziale,
  rate limit): SOLO il token del **locatore** (un token del conduttore →
  403 `wrong_role`: il ruolo sta nella derivazione), SOLO se la console
  l'ha chiesto (`contract.askLandlordMandate === true`, altrimenti 403
  `not_offered` — mai un mandato che nessuno ha offerto), `mandate:true`
  esplicito (mai dedotto), a locatore già firmato 410. Scrive
  `contract.landlordMandate {given, at, ip, ua, text, hash, name, ref,
  termsVersion:2, termsHash, terms, termsSource:'contract-at-mandate',
  via:'scheda', docUrl}`: la base è la **foto delle condizioni del
  contratto** al momento del conferimento (`termsFromContract` →
  `mandateTermsHash`, la stessa impronta del mandato del conduttore).
  Il documento del mandato nasce qui (`api/profile/_mandatopdf.js`,
  `_pdfbrand`: locatore, immobile, condizioni riga per riga coi nomi VERI
  delle parti dal contratto — la foto li porta normalizzati, servono
  all'impronta non alla lettura — testo integrale, data/IP/dispositivo, hash
  del testo, impronta delle condizioni) su
  `contracts/<id>/mandato-locatore.pdf` — best-effort: il conferimento è il
  dato. Stampa `landlordMandateAt` sulla proposta (precondizione
  `exists:true`), card Telegram `contract.landlord_mandate_given`. Idempotente.
- **`landlordMandateCheck`** (`api/magic-sign/_shared.js`, una copia): il
  contratto di ADESSO riproduce la foto? Lo leggono `sign-for` (409
  `landlord_mandate_terms_changed` PRIMA di armare la delega e di firmare),
  `magic-sign/submit` (409 alla firma), `magic-sign/lookup` (avviso su
  /sign), e `profile/submit` congela le condizioni anche sotto il mandato
  del proprietario (`mandate_terms_frozen`, `mandates:[…]`).
- **`sign-for`**: `op:'ask-landlord-mandate'` arma `askLandlordMandate` sul
  contratto (creato se manca, idempotente come 🖊), manda l'email al
  locatore se c'è (design system), ritorna `{url, message, phone, email,
  emailed}`; il piano (`op:'status'`) porta `landlordMandate`,
  `landlordMandateOk/Diff`, `askLandlordMandate`, `landlordMandateUrl`;
  al tap il locatore si controfirma **per mandato** — `landlordDelegate`
  armato DAL mandato (`basisKind:'mandate'`, `mandateRef/At/Hash`) — e
  senza mandato resta la delega a base dichiarata (`basisKind:'declared'`,
  `landlord_basis_required` solo in quel caso); il ramo `landlordPending`
  ritorna `landlordMandateUrl` e la console offre di chiederlo subito.
- **«Per delega/per mandato» SOLO quando firma davvero l'operatore, anche
  per il locatore** (la regola di Sprint 1.3 estesa): `magic-sign/submit`
  stampa `landlordSignedByDelegate` SOLO con `asDelegate:true` (con
  `mandateRef/At/Hash` e `basisKind:'mandate'` quando c'è il mandato);
  prima bastava `landlordDelegate` armato perché QUALSIASI firma dal link del
  locatore — anche la sua — uscisse «per delega». Quindi il link del
  proprietario aperto dall'operatore porta `&delegate=1`: `delegaUrl()`
  nella console (🖊 Controfirma per delega, Copia link delega, il link dopo
  la conversione), `lLink` in 🖊 Firma ora del portal, `sign.html` manda
  `asDelegate` per entrambi i ruoli e dichiara la delega del locatore SOLO
  con `&delegate=1` (col mandato: «written mandate given by the landlord on
  …», rosso se le condizioni non sono più quelle). `sign-for` firma il
  locatore con `asDelegate:true`. Il certificato stampa «Firma per mandato:
  X / per conto di Y - mandato del gg/mm/aaaa (ref)» (`delegateLines`,
  invariata).
- **Console**: riga con «🏠 Mandato del proprietario ricevuto il … · PDF»
  o «🏠 Nessun mandato del proprietario / chiesto, non ancora dato»;
  **🏠 Chiedi il mandato al proprietario** (WhatsApp col numero, copia
  senza; l'email parte dal server); a inquilino firmato la primaria diventa
  **✍️ Controfirmo io (mandato)**; il piano di ✍️ dice «in forza del SUO
  mandato scritto del …» o avvisa se le condizioni sono cambiate; il prompt
  della base dichiarata resta SOLO senza mandato e senza delega. **Portal**
  (🖊 Firma ora): card «Mandato / delega del proprietario» con lo stato del
  mandato (verificato ora sul motore), «Firmo io per il proprietario
  (mandato)» arma `landlordDelegate` dal mandato, «🏠 Chiedi il mandato al
  proprietario» via `/api/profile/link` + WhatsApp/copia. **Scheda**
  (`scheda.html`): card «Mandato a firmare il contratto» (IT/EN) con le
  condizioni coperte, il testo del server, spunta mai pre-selezionata, un
  tap; poi «✓ Mandato conferito» col documento; `#mandato` scorre alla
  card; `?demo=landlord` la mostra.
- Test: `node tests/mandato/run.mjs` §11 — handler VERI su Firestore in
  memoria: 403 col token del conduttore, 403 non offerto, 400 senza
  `mandate:true`, la card in lookup SOLO per il locatore e SOLO se chiesta,
  l'op della console (contratto, `askLandlordMandate`, link `#mandato`,
  email), il tap (mandato, foto, PDF vero letto parola per parola,
  notifica, proposta stampata, `already`), ✍️ un tap = conduttore per
  mandato + locatore per MANDATO (`basisKind`, hash, certificato «Firma per
  mandato»), 410 a firma apposta, condizioni cambiate DOPO il mandato →
  status lo dice e sign 409 senza controfirma (e passa a condizioni
  ripristinate), il link del locatore PRIMA della firma del conduttore resta
  409 `awaiting_tenant` (il mandato non salta la sequenza), il link NUDO del
  locatore firma come il locatore (mai `landlordSignedByDelegate` —
  mutazione), ✎ Completa i dati → 409 sotto il mandato del proprietario,
  giunzioni sulla sorgente (submit, sign.html, console, portal, Scheda,
  scritture attese). Nota di harness: `rateOk` è UNA mappa per IP condivisa
  da tutte le porte pubbliche (12/min su magic-sign/submit), quindi il test
  ruota l'IP a ogni sotto-sezione — il tap ✍️ sono due submit dallo stesso
  IP dell'operatore.
