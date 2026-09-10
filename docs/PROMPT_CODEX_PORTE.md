# Prompt d'apertura per Codex — Lotto 2 «le porte della Segretaria»

*Da incollare in una chat NUOVA di Codex aperta sul repo
`valentino11marzo-pixel/Boum-roma`. Prerequisito: `AGENTS.md` e
`STUDIO_SEGRETARIA_UNICA_2026-09.md` devono essere sul ramo di partenza
(main dopo il merge, oppure `claude/workload-gpt-integration-yvewv1`).*

## Ripresa dopo la PR #234 (10/09) — da incollare nella STESSA chat di Codex

Le tue due obiezioni erano giuste e sono state chiuse dal proprietario di
`_smista.js`, sul ramo `claude/workload-gpt-integration-yvewv1`. Riprendi
così, nel ramo `codex/porte-segretaria`:

1. `git fetch origin && git merge origin/claude/workload-gpt-integration-yvewv1`
   (se la sezione «Lo Smistatore» di CLAUDE.md va in conflitto: tieni il
   paragrafo «Le porte (10/09/2026…)» che arriva dal merge e SOSTITUISCI il
   tuo paragrafo «bloccato» con le righe finali sulle due porte, quando le
   avrai costruite).
2. La firma nuova: `smistaDocument({ base64, mediaType, fileName, hint,
   origin, docId, relation })`. `docId` = sha1 dell'URL dell'allegato (o
   del Message-ID + nome file per l'email): se esiste già torna
   `{ ok, duplicate:true, id }` SENZA chiamare il modello né Storage.
   `relation` = `{ kind:'unknown', label }` per un numero non in archivio
   (il documento resta `needsFiling`, con `suggestedPropertyId`), oppure
   `{ kind:'landlord'|'tenant', label, propertyIds:[…], contractIds:[…] }`
   per un contatto noto (TUTTI i suoi immobili: con più di uno, e senza una
   scelta valida del modello, resta `needsFiling` coi `relatedPropertyIds`;
   non passare MAI un solo immobile «per comodità» se ne ha due).
3. Leggi `tests/documents/smista.mjs`: sono le garanzie che l'interfaccia ti
   dà; i tuoi test coprono le PORTE (chi chiama con cosa), non le
   ripetono. `node tests/documents/smista.mjs` deve restare verde.
4. Il resto del compito qui sotto vale invariato.

---

Lavori nel repo BOOM Roma. Prima di tutto leggi `AGENTS.md`, poi in
`CLAUDE.md` le sezioni «Lo Smistatore», «POST /api/homie/message», «Le tre
reti del server» e «Conventions», poi `STUDIO_SEGRETARIA_UNICA_2026-09.md`
§5: il tuo perimetro è il **Lotto 2**. Non toccare `api/segretaria/*`,
`api/telegram/*`, `js/*-engine.js`, `api/phone/*`: sono in lavorazione su un
altro ramo. Crea il ramo `codex/porte-segretaria`.

## Compito

**1. Gli allegati WhatsApp entrano nello Smistatore.** In
`api/homie/message.js` gli allegati arrivano già come `mediaUrls` e vengono
salvati come `attachments` sul messaggio, ma nessuno li legge. Per ogni
allegato PDF o immagine (mai altri tipi) scarica i byte e chiama
`smistaDocument({ base64, mediaType, fileName, hint, origin:'whatsapp',
docId, relation })` di `api/documents/_smista.js` — la stessa funzione che
usano `api/telegram/webhook.js` e `api/documents/scan-inbox.js` (budget di
tempo, tetto 8 MB). Regole:
- **best-effort**: il messaggio di testo segue la strada di oggi; un errore
  sull'allegato non perde MAI il messaggio né il lead;
- **idempotente**: `docId = 'wa_' + sha1(url)`; l'interfaccia garantisce
  che un retry di Homie non archivi due volte e non paghi il modello;
- **mittente sconosciuto** (nessun contatto BOOM per quel numero — usa la
  risoluzione che il file fa già) → `relation:{kind:'unknown'}`: resta
  `needsFiling`, mai sotto un immobile; contatto noto → `relation` con
  kind, label e TUTTI i suoi immobili/contratti; `hint` = il testo del
  messaggio.

**2. L'email entra per RELAZIONE, non solo per indirizzo.** Oggi
`api/documents/scan-inbox.js` processa solo mittenti fidati per indirizzo
(gli indirizzi dell'operatore + `DOC_MAIL_FROM`). Aggiungi la fiducia per
relazione: un mittente la cui email compare in archivio come proprietario o
inquilino (`landlords`, `users` con ruolo tenant/landlord, `contracts` con
`landlordEmail`/`tenantEmail`) viene processato con `relation:{ kind, label,
propertyIds:[TUTTI i suoi], contractIds:[…] }` e `docId = 'em_' +
sha1(messageId + fileName)`: è l'interfaccia a confinare il match ai suoi
immobili e a lasciare `needsFiling` quando non è sicuro. Un mittente ignoto
resta escluso come oggi. Nessun nuovo env.

**3. Test.** Estendi `tests/whatsapp/run.mjs` (stesso harness: Firestore in
memoria, handler vero, `fetch` stubbato, Anthropic mockato) con i casi:
allegato di un contatto noto → archiviato sotto il suo immobile; allegato di
uno sconosciuto → `needsFiling:true`; allegato che fallisce → messaggio e
lead intatti; stesso allegato due volte → un documento solo. Crea
`tests/documents/porte.mjs` per l'email: mittente per relazione →
processata; ignoto → non processata; nessuna scrittura prima del match.
Verifica **per mutazione** i due «mai» (rimetti il difetto, il test deve
cadere) e registra la suite in `tests/run-all.mjs`. Deve essere verde:
`npm test -- whatsapp porte`.

**4. Documentazione.** Nella sezione «Lo Smistatore» di `CLAUDE.md`
aggiungi 4-8 righe nello stile del file: cos'era (allegati salvati e mai
letti; email solo per indirizzo), cosa cambia, dove sta il test.

## Regole dure

Firestore solo via `api/homie/_lib.js`; nessuna dipendenza npm nuova;
nessun URL sull'apex `boomrome.com` (sempre `www`); nessun segreto nel
codice; nei log mai il contenuto dei documenti (ci passano codici fiscali).
Non modificare né saltare test esistenti.

## Fatto quando

PR aperta verso `main` dal ramo `codex/porte-segretaria`, diff limitato ai
file del Lotto 2, descrizione con cosa/perché e l'output di
`npm test -- whatsapp porte`. Domande aperte nella PR, mai risolte
indovinando.
