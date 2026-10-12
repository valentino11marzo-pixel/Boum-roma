# Telefono — il Centralino e la Receptionist

> Dettaglio e storia di quest'area, spostati da CLAUDE.md il 12/10/2026 senza
> riscrivere nulla: stesse sezioni, stesso ordine. Le novità dell'area si
> aggiungono QUI (3-8 righe nella sezione giusta: cos'era, cosa cambia, dove
> sta il test). La mappa del sistema è in `CLAUDE.md`, le priorità in `ORA.md`.

### Il Centralino (`api/phone/*` + `/chiamate`) — la segreteria che lavora
- **Timeline conversazionale a costo zero (28/09)**: il webhook ElevenLabs conserva per ogni turno solo ruolo, testo, `time_in_call_secs` e una whitelist chiusa delle latenze già fornite dal provider; tool grezzi, usage e campi estranei non entrano nella timeline. `/chiamate` mostra la timeline con tempo e metriche disponibili e permette a Valentino di marcare `anticipa`, `taglia`, `lenta` in `reviewTags` sullo stesso `phoneCalls`, tramite l'update admin già esistente; i tap sullo stesso doc sono serializzati e restano visibili durante gli snapshot intermedi. Nessuna nuova chiamata a modelli o provider. Prove: `phone` (payload vero firmato + whitelist) e `phoneui` (pagina reale, timeline, click rapidi e persistenza tag).
- **Ricevuta del passaggio (28/09)**: il webhook firmato estrae dai soli
  `tool_calls/tool_results` ElevenLabs una `toolReceipts` bounded per
  `transfer_to_number`; params, destinazione, risultato ed errore grezzi non
  vengono copiati. `failed` richiede l'errore provider, `connected` un esito
  esplicito di trasferimento riuscito, ogni altra forma resta `unknown`.
  `/chiamate` mostra badge e prova; test `phonereceipts`, `phone`, `phoneui`.
- **Recapito prima del richiamo (17/09)**: un suggerimento «richiama» senza numero mostrava «Da richiamare». La presentazione pura in `chiamate.html` distingue ora «Richiamo da valutare · recapito mancante» dalla priorità della chiamata.
  Lista, dettagli e pulsanti usano lo stesso controllo del recapito salvato; testo e nome non possono inventarne uno. La bozza resta leggibile come proposta con recapito da verificare.
  Nessuna modifica a urgenza, suggerimento o dati originali durante la lettura. Prova `phoneui`: pagina reale, filtri, dettagli, gestione manuale e due mutazioni; nessun provider contattato.

Su iPhone nessuna app può rispondere a una chiamata al posto dell'operatore —
e non serve: la segreteria È già una **deviazione condizionale di rete**.
Puntandola a un numero Twilio (`**004*<numero>#` dal tastierino: occupato +
nessuna risposta + irraggiungibile in un colpo; `##004#` per tornare
indietro; MAI `**21*` o l'inoltro di iOS, che devierebbero tutto), l'AI
risponde SOLO quando l'operatore non può o rifiuta apposta (rifiuto =
"occupato" per la rete). Rispondere di persona resta sempre possibile.
- `POST /api/phone/inbound` — webhook Voice di Twilio. Auth `?k=<chiave
  DERIVATA da HOMIE_SECRET>` (`phoneKey()` — nessun nuovo env, ruotare il
  secret revoca il webhook) o X-Homie-Secret. Saluto bilingue che DICHIARA
  l'assistente automatico e la registrazione (disclosure pinnata nei test),
  poi `<Record>`; il doc `phoneCalls/<CallSid>` nasce SUBITO, così anche chi
  riaggancia al bip resta visibile come chiamata persa. QUALSIASI intoppo
  interno non impedisce mai di rispondere (il TwiML esce comunque).
  `?setup=1` con Bearer admin → gli URL esatti da incollare su Twilio (la
  chiave non si calcola a mano e non si regala: senza auth, 401).
- `POST /api/phone/recording` (maxDuration 60) — recordingStatusCallback:
  scarica l'audio (basic auth TWILIO_*), lo mette su Storage `phone-calls/`
  (URL tokenizzato = credenziale di lettura della dashboard), trascrive
  (Whisper, lingua AUTO — mai forzare 'it': i clienti parlano inglese),
  riconosce il chiamante (`phoneVariants` su leads/users/pfsClients/clients:
  un inquilino che chiama per la caldaia NON diventa un lead), analisi haiku
  field-whitelisted (riassunto IT per l'operatore, intent, urgenza, azione
  consigliata, bozza WhatsApp nella lingua VERA del chiamante via replyLang
  — le parole battono la dichiarazione del modello), e per lo sconosciuto
  vero un doc `leads` `source:'phone'` nello schema condiviso (dedupe per
  persona con recentLeadByPhone) → da lì Brain → notify-pending →
  Commerciale, gratis. Idempotente per costruzione (`processedAt` sul doc:
  i retry di Twilio non duplicano lead né ping). Ogni anello è best-effort
  TRANNE la scrittura del doc: Whisper/AI/Telegram giù → il doc esce
  comunque con scritto cosa manca ("trascrizione non configurata" è
  un'informazione, il silenzio è un bug). Senza trascrizione il placeholder
  del lead è in INGLESE di proposito (replyLang legge lead.message — la
  lezione di leads/scan-inbox). Ping Telegram DOPO il dato, mai al suo posto.
- **LA RECEPTIONIST (via B — ElevenLabs Agents, `bot/RECEPTIONIST.md`)**:
  la chiamata non finisce in segreteria, l'agente RISPONDE e conversa
  (bilingue, disclosure in apertura). In chiamata usa
  `GET /api/phone/agent-tools?k=&op=catalog|slots` — catalogo vero e slot da
  `viewings/_avail.js`, la STESSA griglia di book.html/Telegram (una copia
  sola: la voce non può promettere uno slot che la pagina negherebbe). NON
  prenota a voce (una visita senza email = kit che non parte): propone lo
  slot e promette il link su WhatsApp. A fine chiamata
  `POST /api/phone/elevenlabs` (firma HMAC `elevenlabs-signature` t=,v0=
  sui byte grezzi, bodyParser off, tolleranza 30′; `verifySignature`
  esportata+testata) riceve `post_call_transcription` + `post_call_audio`
  (audio PUSH base64 → Storage, eventi in QUALSIASI ordine, doc
  `phoneCalls/el_<conversationId>` idempotente su processedAt) e consegna
  alla STESSA pipeline di _lib.js. **La regola della lingua, qui doppia**:
  nel transcript ci sono due voci — nel lead e in replyLang entrano SOLO i
  turni del CHIAMANTE (l'agente parla anche italiano a un inglese: le sue
  parole dentro lead.message farebbero rispondere il Commerciale nella
  lingua sbagliata). Il riassunto ElevenLabs entra solo come fallback.
- **`chiamate.html` (`/chiamate`)** — la dashboard admin (noindex,
  no-store; nel portal: Console → 📞 Centralino): live su `phoneCalls`,
  filtri (da gestire / lead / clienti / senza messaggio), per ogni chiamata
  player audio, trascrizione (o dialogo 🤖/👤 per le chiamate receptionist,
  badge 🤖), riassunto + azione consigliata, bottone WhatsApp con la bozza
  già scritta, tel:, ✓ Gestita. Il pannello ⚙️ Attivazione contiene i
  codici GSM e recupera dal server gli URL di ENTRAMBE le vie (`?setup=1`).
  Una 'in-progress' vecchia di 5' è mostrata come "riagganciata senza
  messaggio" — quello che sappiamo, senza inventare.
- Rules: `phoneCalls` admin-only (firestore) + `phone-calls/` (storage —
  senza il match, l'upload admin 403a: la lezione contracts/).
- **LA LEZIONE DELL'8 SETTEMBRE 2026 — `Redirecting...`**: la Receptionist
  era stata creata il 22/08 e testata UNA volta: il tool `get_catalog` ha
  ricevuto come risposta la stringa `Redirecting...` (URL sull'apex
  `boomrome.com`, che reindirizza su `www`, con *Follow redirects* spento) e
  l'agente ha detto «I don't have the catalog in front of me» col catalogo
  vivo. Nessuno ha letto il transcript; zero chiamate in 17 giorni; il numero
  del workspace (`+1 707`, Twilio) era rimasto assegnato a «Sofia», l'agente
  di febbraio senza tool. Regole: **un URL BOOM consegnato a un servizio
  esterno è SEMPRE `www`** (`canonicalHost()` in `inbound.js`, pinnato nei
  test insieme al mandato); l'italiano nasce dal **preset di lingua**, non
  dal modello TTS (la piattaforma impone flash v2 agli agenti inglesi);
  formati μ-law 8k per il numero Twilio; il webhook post-chiamata è `www`
  per la stessa ragione. Stato completo e checklist di attivazione in
  `bot/RECEPTIONIST.md` §0 e `STUDIO_CARICO_2026-09.md` §3.
- Test: `node tests/phone/run.mjs`.
