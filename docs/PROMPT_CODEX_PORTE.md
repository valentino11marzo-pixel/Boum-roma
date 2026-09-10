# Prompt d'apertura per Codex — Lotto 2 «le porte della Segretaria»

*Da incollare in una chat NUOVA di Codex aperta sul repo
`valentino11marzo-pixel/Boum-roma`. Prerequisito: `AGENTS.md` e
`STUDIO_SEGRETARIA_UNICA_2026-09.md` devono essere sul ramo di partenza
(main dopo il merge, oppure `claude/workload-gpt-integration-yvewv1`).*

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
allegato PDF o immagine (mai altri tipi) chiama `smistaDocument({ base64,
mediaType, fileName, hint, origin })` di `api/documents/_smista.js` — la
stessa funzione che usano `api/telegram/webhook.js` e
`api/documents/scan-inbox.js`: leggi come la chiamano loro e fai uguale
(budget di tempo, tetto 8 MB, `origin`). Regole:
- **best-effort**: il messaggio di testo segue la strada di oggi; un errore
  sull'allegato non perde MAI il messaggio né il lead;
- **idempotente**: id del documento derivato dall'URL dell'allegato (sha1),
  così un retry di Homie non archivia due volte;
- **mittente sconosciuto** (nessun contatto BOOM per quel numero — usa la
  risoluzione che il file fa già) → `needsFiling: true`, mai un file
  archiviato sotto un immobile a caso; `hint` = il testo del messaggio.

**2. L'email entra per RELAZIONE, non solo per indirizzo.** Oggi
`api/documents/scan-inbox.js` processa solo mittenti fidati per indirizzo
(gli indirizzi dell'operatore + `DOC_MAIL_FROM`). Aggiungi la fiducia per
relazione: un mittente la cui email compare in archivio come proprietario o
inquilino (`landlords`, `users` con ruolo tenant/landlord, `contracts` con
`landlordEmail`/`tenantEmail`) viene processato e archiviato sotto il SUO
immobile o contratto (passa l'aggancio come `hint`, lascia che lo Smistatore
faccia il match; se non è sicuro resta `needsFiling`). Un mittente ignoto
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
