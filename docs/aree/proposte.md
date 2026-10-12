# Proposte (pre-agreement) e lucchetto sull'immobile

> Dettaglio e storia di quest'area, spostati da CLAUDE.md il 12/10/2026 senza
> riscrivere nulla: stesse sezioni, stesso ordine. Le novità dell'area si
> aggiungono QUI (3-8 righe nella sezione giusta: cos'era, cosa cambia, dove
> sta il test). La mappa del sistema è in `CLAUDE.md`, le priorità in `ORA.md`.

### Pre-agreement suite (`/api/preagreement/*` + `pre-agreement.html` + `pre-agreement-admin.html`)
Sendable RENTAL PROPOSAL / pre-agreement, modeled on the real BOOM document
(parties landlord⇄tenant, transitional lease L.431/98 art.5 c.1, fee % of
annual rent + VAT "due separately", conditions 5.1–5.7, Egidi footer).
- `POST /api/preagreement/create` — admin/owner/landlord (Bearer ID token).
  Deal fields (property, landlord, lease, money knobs: rent/energyCredit/
  depositMonths/depositSplitPct/feeMode(pct|months)/feePct/feeMonths/
  feeVatPct/feeDue(move-in|signing|separate)/dueAtSigning/
  **installmentMonths(1|2|3|6|12)** = rent cadence, monthly…annual) → creates
  `preAgreements` doc with 32-hex token → `{ ok, id, token, url }`.
  All money derivations server-side via exported `deriveMoney()` (monthly
  total with energy credit, deposit split at-signing/at-move-in, fee as %
  of annual OR months of rent, endDate month-end clamp). The admin console
  mirrors the same math client-side for edit-in-place.
- `POST /api/preagreement/lookup` — public `{ token }` → sanitized doc
  (incl. `tenants[]`); audit-logs views; 410 when revoked. Exports
  `paExpired()`: optional `validUntil` (YYYY-MM-DD, Rome calendar day)
  gates NEW acceptances only — lookup exposes `expired`, the page renders
  a branded "offer expired" view (WhatsApp refresh CTA), submit returns
  410 `expired`; accepted/paid deals are never touched, and the console's
  ✎ Edit extends the SAME link (row shows "⌛ OFFERTA SCADUTA").
- `POST /api/preagreement/submit` — public. Tenant self-fills identity
  (name/dob/birthplace/nationality/address/CF/ID/email/phone) + optional
  co-tenants (`tenants[]`, ≤6, each typed name = signature, joint & several
  liability clause auto-added) + consent → status `accepted`, quotable ref
  `BOOM-<base36>`, and when `money.dueAtSigning>0` returns a Stripe Checkout
  URL (acceptance is never voided by a failed checkout).
- `POST /api/preagreement/convert` — admin/owner/landlord. One tap from the
  console: accepted/paid PA → `contracts` doc (identity/lease/money carried
  over, tenant `users` profile bootstrapped by email match, Magic-Sign
  tokens minted, `signingOrder:'sequential'`). By DEFAULT the OWNER signs
  directly — the landlord-side link is shared with them from the console
  (WhatsApp one-tap when `landlord.phone` is set). `delegate:true` is the
  per-deal OPTION: records `landlordDelegate`, the link stays with the
  ADMIN who countersigns per delega after the tenant signs (sign.html
  shows "signing as X on behalf of Y"; magic-sign submit stamps
  `landlordSignedByDelegate`). The choice is echoed on `pa.delegated`.
  Idempotent via `pa.contractId`. **Il PDF del contratto nasce QUI,
  server-side** (`api/sign/_contractpdf.js` → `js/contract-pdf.js`, lo
  stesso impaginato del portal): `generatedPDF` + `sigAnchors` +
  `clauseVersion` scritti alla conversione, così sign.html mostra "View
  full contract PDF" PRIMA della firma e `_finalize` costruisce il
  contratto firmato in allegato anche sul rail PA. Generazione fallita →
  promemoria Telegram `contract.pdf_missing` (solo in quel caso); reti di
  recupero: send-sign rigenera prima dell'invito, la prima apertura di
  /sign genera dal lookup. MAI sotto una firma viva (guardia in
  `ensureContractPdf`, testata per mutazione).
- `POST /api/preagreement/upload` — public, PA-token-scoped. The Verify
  step's ID/passport upload: base64 (client downscales photos to ~1800px
  JPEG) → Firebase Storage `preagreements/<paId>/…` under ADMIN creds
  (admin-only per storage.rules; tokenized URL kept on `pa.uploads[]`,
  never returned to the public page). Convert copies these onto the
  contract (`identityDocs`) + tenant user profile. `kind:'extra'` marks
  the optional SECOND requested document (`pa.extraDoc`, set from the
  console — e.g. proof of the transitional need): its own Verify slot,
  NEVER blocking, uploadable even after acceptance from the accepted page
  ("One more document" card until it arrives; lookup exposes
  `extraDoc`/`extraDocCount`).
- `api/preagreement/_auto.js` — `maybeAutoConvert()`: when the PA carries
  `propertyId` + `autoConvert` (set from the console's "Portal property"
  picker), the contract creates ITSELF the moment the deal closes — from
  `submit.js` (acceptance with nothing due) or the Stripe webhook (paid).
  ADMIN-ONLY notification: the client's Magic-Sign email is a deliberate
  console decision, never automatic.
- `POST /api/preagreement/send-sign` — the console's 🖊 Magic Sign button.
  Admin auth. One tap: converts if needed (idempotent), emails the tenant
  their Magic-Sign link, patches `pa.signSentAt` + stores both sign URLs on
  the PA (admin-only) so the row offers WhatsApp share + delegate-link copy.
  Re-press = resend.
- `POST /api/preagreement/notify` — console "✉ Reinvia copia". Admin auth.
  Re-sends the accepted/paid document email to the client (recovery path
  for failed sends / "non l'ho ricevuta").
- **Lo stato è il FATTO, non l'etichetta** (`_state.js` + `resolve.js`).
  LA LEZIONE DEL 16 AGOSTO 2026: `submit.js` trattava come terminale il solo
  stato `accepted`, quindi un **secondo invio del modulo su una proposta già
  PAGATA** — pagina rimasta aperta con la bozza in localStorage, tasto
  indietro da Stripe, tap ripetuto su rete lenta — la riscriveva ad
  `accepted` con un protocollo nuovo e **apriva una seconda Checkout**; e se
  nel frattempo il lucchetto dell'immobile era passato a un'altra proposta,
  la ributtava in **`reserve`**, stato da cui → Contratto, Magic Sign e
  ✉ Reinvia copia rispondono tutti 409 `not_accepted_yet`. In console il
  deal risultava da pagare e il passo successivo spariva: due sintomi, una
  causa. `paidOnRecord()` (esportata, condivisa da submit · pay · resolve ·
  console) guarda la PROVA — `paidAt`/`paidSessionId`/`paidEur` — non lo
  status, così anche un documento già degradato viene riconosciuto pagato.
  `POST /api/preagreement/resolve` (admin) è la via d'uscita: cerca la prova
  sul documento e, se manca, **su Stripe per il token di QUELLA proposta**
  (metadata `token`, non l'id sessione che il giro rotto sovrascriveva);
  con la prova riporta a `paid`, rende definitivo il lucchetto e converte;
  senza prova **non dichiara mai pagato** e lo dice. Sblocca anche una
  riserva quando l'immobile si è liberato (il lucchetto è l'unica autorità:
  ancora tenuto → nessuna scrittura e il nome di chi lo tiene).
  In console: chip oro **✓ incassato** su qualunque etichetta, riga che
  spiega riserva e disallineamento, bottoni **⚠ Sistema lo stato** /
  **✅ Sblocca la riserva** / **🔎 Ha pagato?**, filtro Riserve, e la KPI
  incassato conta i soldi VERI (prima sommava solo `status==='paid'`).
  Test: `node tests/preagreement/state.mjs`.
- **La console VEDE la firma** (12/09/2026 — il caso Inês, Viale Angelico 9).
  La console leggeva SOLO il documento della proposta, e nessuno le scriveva
  mai che il contratto era stato firmato: un deal firmato da entrambi e
  attivo da settembre restava «paid · 🖊 Reinvia Magic Sign · dopo la firma
  dell'inquilino…» per sempre; l'operatore rimandava il link e il cliente
  leggeva «hai già firmato» (nei log: `send-sign 200` e 24 secondi dopo
  `magic-sign/lookup 410`, nessun submit). La firma ERA sul contratto:
  mancava il riflesso. Tre correzioni: (1) la console **ascolta il
  contratto** di ogni proposta convertita (`watchContract`, onSnapshot +
  fallback get) e la riga dice chi ha firmato — chip «✍ firmato inquilino» /
  «✓ firmato», filtro **Firmati**, KPI «contratti firmati», prossimo passo
  scritto dal punto in cui il deal È (`nextStepLine`), «🖊 Reinvia Magic
  Sign» sparisce a inquilino firmato e al suo posto c'è il link del
  proprietario / la controfirma per delega / il PDF firmato; anche il
  Fascicolo ARPE spunta «Contratto firmato» SOLO a firme complete (prima
  spuntava il PDF generato, non firmato). (2) `magic-sign/submit` **stampa
  lo stato sulla proposta** (`contractSignatureStatus`, `tenantSignedAt`,
  `landlordSignedAt`, `contractFullySignedAt`) con precondizione
  `exists:true` — mai una proposta fantasma — ed è il ripiego quando il
  contratto non è ancora arrivato dal listener. (3) `send-sign` **legge il
  contratto prima di spedire**: con la firma dell'inquilino sopra non parte
  nessuna email, risponde `alreadySigned` con lo stato, e ristampa la
  proposta (sanatoria dei deal firmati prima del fix). Test:
  `tests/notify/run.mjs` §1f (giro vero: invito → firma → stampa → 🖊 senza
  email → controfirma → complete → proposta cancellata = nessun fantasma) e
  `tests/firma/run.mjs` §4 (giunzioni sulla sorgente della console) e
  `tests/firma/console.mjs` (la console MONTATA in Node con DOM minimo e
  Firestore finto: quattro deal nei quattro stati, l'HTML che `paRow`
  produce davvero).
- **LE SCRITTURE DOPO LA RISPOSTA SI PERDONO** (13/09/2026 — letto nel
  backup notturno, non dedotto). Su Vercel la funzione può essere congelata
  appena `res.json` parte: una `fsPatch(...).catch(() => {})` lanciata
  senza `await` un attimo prima muore in volo. Prove nel dump del 13/09: la
  proposta di Inês SENZA `signSentAt` dopo un 🖊 andato a buon fine (email
  partite, 200 al client — e la console diceva ancora «Invia Magic Sign»
  come se non fosse mai stato premuto); la proposta di Léa SENZA
  `contractId` con il contratto `pa_<id>` firmato da entrambi il 14/08 (il
  back-link di convert era fire-and-forget, e il ramo «esiste già» non lo
  riscriveva mai: orfana per sempre, riga «paid · → Contratto»). Regola di
  CLASSE: nei tre rail (`api/preagreement`, `api/magic-sign`, `api/sign`)
  nessuna `fsPatch/fsCreate/commitWrites/logActivity/tgSend` sta a inizio
  istruzione senza `await` — `tests/firma/run.mjs` §5 scandaglia i file
  e fallisce al primo ritorno. `convert.js` ha `backlinkPa()` in una copia
  (creazione E ramo «esiste già», atteso). La console si ripara da sola:
  per ogni proposta chiusa senza `contractId` ascolta `contracts/pa_<id>`
  (l'id è deterministico) e, se esiste, lo ADOTTA e riscrive il back-link
  (`contractIdOf`, `contractAdoptedAt`).
- **Il binario morto dei pagati senza contratto** (stesso dump): 8
  proposte pagate, 6 SENZA alcun contratto nel sistema — 3 su un indirizzo
  che non esiste nemmeno fra gli immobili del portal. Senza contratto non
  partono Magic Sign, rate, journey né registrazione, e la riga non lo
  diceva. Ora: alertline «💶 Pagato il … (N giorni fa) — contratto NON
  ancora creato», con la mossa (🖊 se l'immobile è collegato, → Contratto
  altrimenti, «crealo prima da Immobili» se manca), chip **Da contratto**
  con conteggio. E **Revoca** anche su un accettato NON pagato (con
  conferma; mai su un pagato o contrattualizzato): le proposte di prova
  restavano in lista per sempre.
- **SPRINT 1 DELLA CONSOLE (13/09/2026) — i binari morti chiusi, il cliente
  che firma dalla sua pagina, il preflight.** Cinque voci del piano
  (`STUDIO`: artifact «Piano Console Proposte»), tutte nate da un caso visto
  nel dump o nei log, mai da un'idea:
  1. **L'immobile che manca si crea DALLA proposta** (`convert.js`
     `createProperty:true`, `propertyFromPa` esportata, id deterministico
     `prop_pa_<paId>`): 6 pagati senza contratto, 3 su indirizzi assenti da
     `properties`, e la riga diceva «crealo prima da Immobili». Il doc nasce
     nella forma di `saveProperty` (address/floor/unit+interno/ownerName/
     rent, `source:'preagreement'`), catasto/mq/zona restano da completare —
     mai inventati. L'immobile è obbligatorio alla CONVERSIONE, non alla
     creazione (una stanza o una casa in trattativa restano proponibili).
     `no_property` risponde `canCreate`; il back-link riporta `propertyId`
     sulla proposta. Console: opzione «＋ Crea l'immobile da questa proposta»
     nel modale → Contratto, selezionata da sola quando nessun immobile
     corrisponde.
  2. **Due contratti vivi sulla stessa casa non passano** (`overlapConflict`
     pura ed esportata, `findOverlap` I/O, guardia PRIMA di profili e
     contratto, DOPO il riconoscimento dell'orfana — un contratto vicino non
     deve mai impedire a una proposta di ritrovare il SUO `pa_<id>`): Brand
     New Duplex con due contratti attivi sovrapposti nel dump. Stesso
     immobile + entrambi attivi + date che si toccano = 409 `overlap` col
     nome di chi occupa, A MENO CHE gli interni siano dichiarati e diversi
     (due stanze sì, la stessa stanza no, un interno vuoto non esclude);
     l'interno viaggia sul contratto (`unit`). `force:true` scavalca — dal
     modale è la spunta «Crea comunque», dichiarata e riportata nella
     risposta (`overlapForced`). Il contratto AUTOMATICO bloccato avvisa
     (`agentNotifications` `contract.overlap_blocked`), mai in silenzio.
  3. **«Per mandato» solo quando firma davvero l'operatore**
     (`magic-sign/submit.js`: `body.asDelegate === true`): prima bastava
     `tenantDelegate` armato sul contratto perché QUALSIASI firma dal link
     del conduttore — anche la sua, dal suo telefono — uscisse «per mandato»
     sul certificato (e senza mandato scritto il cliente riceveva 403 da
     solo). Il flag lo mette sign.html SOLO se aperto con `&delegate=1`, il
     link che compone il pannello 🖊 Firma ora del portal; lo Share Hub e
     l'email restano nudi. Mutazione pinnata: delega armata + link nudo →
     200, firma propria, nessun `tenantSignedByDelegate`.
  4. **Il cliente vede il suo stato e firma dalla sua pagina**
     (`preagreement/lookup.js` `contractStatus` esportata → `pa.contract`,
     `pre-agreement.html` card «Your contract is ready → Sign your contract
     now», poi «signed by you / waiting for the landlord», poi il PDF
     firmato; la timeline segue). L'email col link restava chiusa per
     settimane — il caso che ha fatto nascere il mandato. Il link del
     conduttore compare SOLO a soldi ricevuti (`paidOnRecord`) o a dovuto
     zero: chi tiene il link della proposta ha già pagato, la stessa
     esposizione dell'email; a firma apposta sparisce; il token del
     locatore non esce mai; su una proposta solo inviata `contract` è null
     (nessuna lettura).
  5. **Il preflight prima di → Contratto e di 🖊** (`convert.js`
     `dryRun:true`: lo STESSO contratto che la conversione scriverebbe,
     passato da `FIELDS.hydrateParties` + `completeness` — mai una lista a
     mano — con la sovrapposizione RIPORTATA e nessuna scrittura: né
     profilo, né immobile, né contratto; con `createProperty` si valuta
     sull'immobile che nascerebbe). Console: al cambio immobile nel modale
     la strip «Il PDF stamperebbe N puntini — Inquilino: … · Locatore: … ·
     Operatore: …» (`preflightLines`, una copia per modale e conferma);
     prima di 🖊 `signPreflight` (dryRun senza contratto, `profile/link`
     col contratto già nato) e l'operatore può fermarsi. Avverte, non blocca.
  Test: `node tests/money/run.mjs` §9b (regola pura per mutazione,
  createProperty, overlap/force/stanze, porta HTTP, dryRun senza scritture),
  `tests/mandato/run.mjs` (asDelegate, link nudo, lookup col link solo a
  soldi ricevuti, pagina), `tests/firma/run.mjs` §7 (giunzioni sulla
  sorgente), `tests/firma/console.mjs`.
- **I PUNTINI (13/09/2026) — solo dove il dato è dovuto, e il dato arriva
  da solo.** «Spazi vuoti con i puntini che fanno percepire al cliente un
  contratto incompleto». Misurato sul dizionario: su una proposta tipo
  (transitorio, identità del conduttore dalla proposta) il PDF stampava
  ~23 slot `………`, 15 dei quali del LOCATORE o dell'IMMOBILE (CF, nascita,
  residenza, catasto, vani, classe energetica, tabelle) — dati che nessuno
  chiedeva a nessuno prima della firma. Quattro mosse, in ordine di peso:
  1. **La richiesta al locatore parte da sola a 🖊** (`api/preagreement/
     _askscheda.js`, chiamata da `send-sign` PRIMA dell'invito): se al
     locatore mancano dati dovuti e c'è un'email, parte la sua Scheda
     (link derivato, testo del dizionario `missingMessage`, oggetto IT);
     stato su `contract.schedaAskedLandlord*`, risposta `landlordAsked`
     che la console dice. Mai se ha firmato, se non manca niente o senza
     email (allora la console rimanda a 📨 dal portal).
  2. **Il PDF si rifà da solo quando arrivano dati** (`ensureContractPdf`
     accetta `{ force: true }`; la guardia sulla firma viva resta assoluta):
     dalla Scheda (`profile/submit`, `pdfRegenerated`) e — il caso più
     comune — **alla PRIMA firma del conduttore** (`magic-sign/submit`,
     prima della rilettura fresca: il PDF nato alla conversione non aveva
     CF/nascita/residenza/documento, scritti nello step Identity; la copia
     firmata, congelata da lì, li stampava come puntini). Solo identità:
     la firma grafica la stampa `_finalize` sulle ancore. E la **pagina
     delle firme** stampa nascita/residenza/documento dichiarati da ogni
     parte (`identityLines`): ciò che la SECONDA parte dichiara firmando
     non può più entrare nel corpo congelato, ma è parte integrante lì.
  3. **Il locatore si risolve da dove sta** (`resolveLandlord`, esportata
     da `_contractpdf.js`, usata dal PDF, dal preflight e dalla richiesta):
     `users` + `landlords` per ownerId, poi `landlords` per email — prima
     il PDF leggeva SOLO `users/<ownerId>` e un immobile nato dalla
     proposta non ha ownerId affatto. Dalla proposta arrivano anche il
     **tipo di documento** (select sulla pagina, `idDocType` in codice
     passport|id|permit|patente → `users.docType`; prima «identificato/a
     mediante ………») e l'**attestazione dell'esigenza** caricata
     (`transitionalDocs` la nomina).
  4. **Gli slot FACOLTATIVI non stampano più puntini** (`contract-pdf.js`,
     B e C): scala omessa se ignota (un palazzo senza scala è la norma),
     accessori e tabelle millesimali «—», stato di consegna = «quanto
     risulta dal verbale di consegna» (l'art. 3 già lo prevede). I dati
     DOVUTI (vani, classe energetica, catasto, identità) restano `………`:
     li chiude il dato, non un segno — mentire con un trattino su un fatto
     dovuto sarebbe peggio del puntino.
  Test: `tests/contractpdf/run.mjs` §9 (il testo VERO del PDF: scala
  omessa/presente, «—», rinvio al verbale, la classe energetica che resta
  puntino finché non arriva; resolveLandlord per id e per email; force che
  rigenera e che NON scavalca una firma viva), `tests/mandato` (il CF
  digitato alla firma è nel PDF congelato), `tests/notify` §1f (la Scheda
  al locatore parte con l'invito, una volta), `tests/scheda` (rigenera
  senza firma, mai con), `tests/money` §9b (docType/transitionalDocs),
  `tests/firma` §8 (giunzioni).
- **Email transport warning**: `nodemailer` and `pdf-lib` MUST be imported
  statically (top-level `import`). Lazy `await import('pkg')` is not traced
  by Vercel's bundler → "Cannot find package" at runtime in production
  (this silently killed all pre-agreement emails until 2026-07).
- **L'accettazione naturale (30/09/2026 — «troppo aggressiva, diventa
  bloccante»)**. Misurato a 390px: al passo 4 una casella da 21px accanto a
  7 righe di legalese, sotto 17 righe del mandato che partivano in maiuscolo
  («MANDATE TO SIGN. I appoint…»), e «Accept & sign» SPENTO — toccato non
  faceva nulla e non diceva nulla. Ora: UNA riga grande e toccabile (tutta la
  frase è il bersaglio) «I accept this proposal» + una riga di sottotitolo;
  il testo che il server registra (`PA_CONSENT_TEXT`/`PA_MANDATE_TEXT`,
  STESSO testo e stesso hash) sta integro sotto «Read the full wording», a
  un tocco — mai riscritto, solo raccolto; il mandato è la seconda riga,
  «Optional», mai pre-spuntata; il bottone non è mai spento per la spunta:
  senza, `accept()` non firma, porta sulla riga (`nudgeTick`) e la barra
  dice cosa manca. `SENDING` tiene fermo il bottone mentre la firma viaggia
  (prima un tocco su una spunta ridisegnava la barra e lo riaccendeva). La
  card del mandato dopo l'accettazione: tre righe in chiaro, testo integro a
  un tocco, spunta + bottone sempre acceso con la stessa guida. Test:
  `node tests/preagreement/consent-ui.mjs` (Chromium a 390px, handler di
  rete finti; mutazioni: guardia spunta, guardia mandato, bottone spento,
  doppio invio — tutte prese).
- `pre-agreement.html` — the public page, an Apple-style guided 4-step
  flow: **Review** (hero tiles: monthly all-in / due today / move-in /
  term, full terms, advisor card, trust chips) → **Details** (identity +
  "+ Add a co-tenant" blocks, draft autosaved) → **Verify** (optional ID
  upload per signer — skippable, GDPR note) → **Sign** (the assembled
  paper document with typed-calligraphy signatures + consent). Frosted
  segmented stepper, single bottom action bar, stamp ceremony, accepted
  view with "what happens next" timeline (payment → contract → sign →
  keys), Stripe resume, QR, WhatsApp copy, print = b/w paper replica.
  Custom `extras[]` money lines render in §4, `customClauses[]` in §5.
- `pre-agreement-admin.html` — the console, rebuilt as a command deck
  (BoomPortal auth, Italian UI, brand gold #D4AF37, real BOOM mark).
  KPI strip (in corso / da chiudere / incassato € / contratti), tabs
  Nuovo⇄Deals, search + status filter chips with live counts. Form in
  numbered sections: immobile & proprietario (incl. owner email/WhatsApp
  for the sign link), lease, money (live riepilogo card), clausole,
  **documenti richiesti** (extraDoc with one-tap presets: esigenza
  transitoria / CF / buste paga), cliente. Rows: colored status edge, ONE
  gold primary action (🖊 Magic Sign / → Contratto), owner-sign WhatsApp
  share (non-delega + phone), extra-doc state (⏳ in attesa / ✓), uploads
  links, **Edit terms** (patches the SAME doc/token — the client's
  existing link shows the new terms, status back to `sent`; only for
  sent/viewed/revoked), Duplicate, Revoke/Reactivate. Convert modal:
  delegate checkbox OFF by default (owner signs directly).
- `api/preagreement/_notify.js` — one email design system for the whole
  suite: black masthead + gold BOOM wordmark, white paper card, document
  with gold N°/PAID chips and a gold "due at signing" band, gold primary
  CTA + quiet black secondary, Wallet badge.
  `sendPaEmails({event:'paid'|'accepted', notifyClient})`: client gets the
  document + Stripe receipt link + PDF attached; admin
  (valentino@boom-rome.com) gets a copy + next-step nudge + one-tap
  client-WhatsApp button. `sendContractSignEmail` adapts the landlord
  block: delega → the admin's countersign link; otherwise → "Firma
  proprietario" + WhatsApp-to-owner button when `landlord.phone` exists.
  Gmail/Nodemailer.
- `api/stripe-webhook.js` PREAGREEMENT branch — on checkout completed:
  doc → `status:'paid'` (+paidEur/paidAt/paidSessionId, idempotent on
  retries), fetches the Stripe receipt_url, sends both emails.
- `submit.js` also emails at acceptance: client copy only when nothing is
  due via Stripe (else it arrives after payment); admin always notified.

**Deal pipeline (protocol)**: lead (`/api/apply-lead` or portal) →
pre-agreement (console, with a Portal-property link → tokenized link →
client walks the 4-step flow: reviews, self-fills + co-tenants, uploads
ID, signs → Stripe if due>0 → confirmation emails + WhatsApp copy) →
contract creates AUTOMATICALLY on close (`_auto.js`; or manually via the
console's "→ Contract" / `/api/preagreement/convert`) with identity, ID
files and terms carried over → tenant gets the Magic-Sign link by email →
admin countersigns per delega on their own schedule → RLI registration →
tenant portal (payments/documents). Terms differ per deal: any money knob,
extra line items and custom clauses per PA; edit before acceptance (same
link); after acceptance/payment, Duplicate creates the new version.

### Il lucchetto sull'immobile (`api/preagreement/_lock.js`)
Due candidati potevano accettare, pagare e generare **due contratti** sullo
stesso appartamento: `submit.js` controllava solo che *quella* proposta non
fosse già accettata. Ora un documento di lucchetto **per ogni mese** della
locazione, id deterministico, creato con `fsCreate(...,docId)` → Firestore
risponde 409 su documento esistente, quindi è un compare-and-set atomico e non
un "leggi poi scrivi". Un doc per mese perché due proposte sullo stesso
immobile per **periodi disgiunti sono legittime**: la sovrapposizione si
rileva da sé. Chiave a scaletta `propertyId → listingId → indirizzo
normalizzato`. Il secondo candidato **non viene respinto**: la proposta
diventa `status:'reserve'`, niente pagamento né contratto, ping Telegram
all'operatore, e la pagina dice la verità. Il lucchetto lo prende
l'accettazione ma **scade in 48h** se il dovuto non arriva (`confirmLock` dal
webhook lo rende definitivo). Spazzino `sweepLocks()` in `reminder-cron`
(oraria) perché la console revoca client-side e il lucchetto resterebbe
appeso. **`firestore.rules`: `propertyLocks` è admin-only — senza quella riga
cadeva nel default-deny e il lucchetto non funzionava affatto.**
**L'interno (30/09/2026 — «non è la stessa unità»)**: la chiave non guardava
MAI `property.unit`, quindi due stanze della stessa casa collidevano sempre e
«✅ Sblocca la riserva» rileggeva lo stesso lucchetto — non poteva sbloccare
mai. Ora un interno dichiarato blocca sulla SUA chiave
(`<immobile>~u<interno>__<mese>`, `lockKey`/`normUnit`), stessa regola di
`convert.overlapConflict`: interni dichiarati e diversi convivono, lo stesso
interno no, un interno vuoto (casa intera) li esclude tutti — il confronto
casa-intera ⇄ stanza si fa DOPO aver preso i propri mesi (atomico). Le prese
nate prima portano la chiave senza interno: l'interno si legge dalla
proposta che tiene. Dalla console, su `still_held` l'admin può dichiarare
l'interno di QUESTA proposta (`resolve` `{id, unit, notSameAs}`): scritto
sulla proposta con `unitDeclaredBy/At/unitWas` (+ `lockOverride` quando chi
tiene non ha interno); due interni UGUALI non si scavalcano mai.
Test: `tests/lock/run.mjs` §5, `tests/preagreement/state.mjs` §7.
