# STUDIO — OGGI E LA SEGRETERIA: perché le decisioni non partono · 21 settembre 2026
### Letto in produzione (log Vercel, deploy, branch), non dedotto. Formato: fatti, poi decisioni.

*Domanda dell'operatore: «in Oggi la Segreteria mostra proposte pronte e
richieste da chiarire, ma le decisioni non partono mai e non sono aggiornate:
l'ultimo aggiornamento è rimasto al 21 settembre. Come andiamo avanti, e
confrontiamoci con Codex.» Questo documento è la risposta di Claude, scritta
perché Codex e ChatGPT la leggano e la contestino (via PR). Vale la regola di
`STUDIO_SEGRETARIA_UNICA_2026-09.md`: se un documento contraddice quello, vince
quello; questo lo APPLICA a un guasto preciso.*

---

## 0 · La tesi in tre righe

Il pannello non è debole: è **scollegato**. Il codice della Segreteria in Oggi
(Codex, 52 commit, ~22k righe, 119 file) passa le sue 13 suite in 89 secondi
nel worktree di questa sessione. Quello che non funziona sono le **quattro
rotaie sotto**: (1) la produzione non nasce da `main`; (2) il braccio che
consegna su WhatsApp non ritira; (3) la preparazione è un opt-in nascosto senza
interruttore; (4) il server perde l'autenticazione a raffica. Aggiungere potenza
al pannello prima di riattaccare le rotaie renderebbe il pannello più pesante,
non più funzionante.

## 1 · I fatti misurati (ognuno con la fonte)

**F1 — La produzione è una branch di Codex, main è fermo.** Deploy Vercel del
progetto `boum-roma` con `target: production`: `codex/segretaria-esegui-20260918`
e `codex/segretaria-continua-20260918` (notte 17→18/09), `codex/canoni-per-unita`
e `codex/admin-mobile-20260920` (20/09, l'ultima alle 23:14 ora di Roma, sha
`1b61b95`). Ogni promozione è preceduta di pochi minuti da una preview dello
stesso sha: sono promozioni manuali. `main` è fermo a `fc6c8f6` (13/09, PR #237).
La catena Codex è **52 commit avanti e 0 indietro** rispetto a main, e contiene
anche lavoro di Claude mai unito a main (Innesto 3.0 e lo Scrivano del 14/09,
`bc67b2d`). Conseguenze meccaniche: la CI `deploy-rules` gira solo sui push a
main, quindi la regola `scrivanoProposals` (solo sulla catena Codex) non è
passata dalla CI; i **due indici composti** aggiunti in `firestore.indexes.json`
(`messages` conversationId+at, `notifications` userId+createdAt) non li deploya
nessuno — la CI fa `--only firestore:rules,storage`. Senza l'indice su
`messages`, `_context.js` ricade sulla lettura non ordinata e, oltre 120
messaggi, scarta la storia (`latest_history_not_verified`) → la proposta esce
`needs_context`, cioè «richiesta da chiarire» invece di «proposta pronta».
Da verificare nella console Firebase se l'indice esiste (da qui non si legge).

**F2 — Il Postino non ritira.** `/api/homie/wa-outbox` nelle ultime 12 ore:
**2 chiamate, entrambe `GET` → 405**. Nessun `pull`. Il Mac è vivo (192
`/api/homie/message` al giorno: gli inbound WhatsApp arrivano), ma
`bot/boom_postino.py` non gira o non è installato. Sulla catena Codex
`_postino.js` **esclude le proposte della Segreteria** dalla card 📮 di ripiego
(«never offer a duplicate manual send»): una risposta approvata da «Esegui
piano» resta `executed` senza `waSentAt`, il pannello dice «In coda», e dopo
48 ore `readPreparationDelivery` la dichiara `whatsapp_delivery_expired` →
«Serve verifica». È esattamente «le decisioni non partono mai»: il tap c'è, il
messaggio no, e nessuno lo dice.

**F3 — La preparazione è un opt-in senza interruttore.** `api/segretaria/worker`
gira ogni minuto (1440/giorno, tutti 200: il cron è vivo), ma prepara SOLO se
`settings/segretaria.prepareCases === true`; i casi nuovi entrano SOLO se
`prepareSince` è un ISO con timezone e il messaggio è posteriore. Altrimenti il
worker risponde `{enabled:false}` e **non scrive il battito**
`heartbeat/segretaria-preparer`: «Ultimo ciclo» resta fermo all'ultima volta in
cui era acceso — il «21 settembre» dell'operatore è questo. Nel prodotto non
esiste un interruttore: né `/segretaria` su Telegram né il pannello scrivono
`prepareCases`/`prepareSince` (grep sull'intera catena: solo letture). Si
accende a mano sulla console Firestore, e la pagina non dice «SPENTA».

**F4 — Il server perde l'autenticazione a raffica.** Errori runtime dal 16/09
al 21/09: **44 × `QUOTA_EXCEEDED: Exceeded quota for verifying passwords`** su
8 rotte (scan-replies 17, health writes 9, pfs 7, wizard/health 4, leads/brain
3, reminder-cron 3, matcher 1). Causa: `getAdminToken` in `api/homie/_lib.js`
cachea il token ma **non ha single-flight** — su un'istanza fredda N letture
parallele = N `signInWithPassword` paralleli. `scan-replies` (catena Codex) fa
`Promise.all` sulle conversazioni dei seguiti aperti: nello stack c'è
`Promise.all (index 136)`, cioè oltre **137 seguiti aperti** e 137 sign-in in
un colpo. La quota è del progetto: nello stesso minuto cadono anche i cron che
non c'entrano (reminder-cron, brain, matcher, PFS). È un danno di tutta la
macchina, nato con il carico nuovo; il difetto però è nel file condiviso.

**F5 — L'Innesto non legge.** `/api/portal/ingest` oggi 07:59: Anthropic 400
«Schemas contains too many parameters with union types (99 parameters with
type arrays or anyOf)». `INGEST_SCHEMA` (Innesto 3.0, Claude 14/09) supera il
limite delle unioni: lettura deterministicamente rotta, e con lei il worker
dello Scrivano che la riusa. Non c'entra con Oggi, ma è nella stessa catena di
«far eseguire in automatico».

**F6 — L'arretrato.** Oltre 137 seguiti aperti (F4); il worker, quando è
acceso, ne prepara al massimo 3 al minuto entro un budget di 35 s l'uno. Con
la preparazione spenta il gruppo «Da preparare» può solo crescere.

## 2 · Cosa NON farei

- **Non renderei il pannello «più potente».** Le 13 suite verdi dicono che il
  pannello fa già ciò che promette; è il sistema attorno che non consegna.
- **Non automatizzerei «il piano».** Per costruzione (`segretaria-esecuzione-
  engine.js`) «Esegui piano» esegue tre cose: registra il seguito, manda UNA
  bozza sulla rotaia esistente (`action_queue` → executor → outbox), fissa il
  ricontrollo. Il testo libero non diventa mai una tool call (regola 7:
  mai delegare trattativa; regola 8: auto-invio solo sul misurato). Oggi le
  consegne misurate della Segreteria sono **zero** (F2): la scala della fiducia
  non ha un dato su cui promuovere. Prima il giro manuale che funziona e si
  misura; l'autonomia arriva dalla scala, categoria per categoria, non da un
  bottone più grande.
- **Non riscriverei niente di Codex.** Il perimetro dello studio §5 assegnava
  a Codex il Lotto 2 (le porte) e a Claude `api/segretaria/*`; la realtà è che
  Codex ha costruito tutta la Segreteria operativa. Non è un errore da
  correggere spostando file: è un fatto da registrare — il proprietario di
  `api/segretaria/*` e del pannello in Oggi da oggi è **Codex**; Claude tiene
  `api/homie/_lib.js`, `api/portal/ingest.js`, la CI e i test di giro.

## 3 · Le decisioni, in ordine

**D1 — main torna la verità (prerequisito di tutto).** Una sola PR porta la
catena `codex/admin-mobile-20260920` su main (la apre Codex, la unisce
Valentino, `npm test` intero sul tree unito prima). Da lì: **la produzione si
deploya da main e basta**, niente più promozioni manuali di branch. La CI
`deploy-rules` deploya anche `firestore:indexes`. Finché D1 non è fatto, ogni
«confronto tramite PR» è una conversazione su un codice che non è quello in
produzione.

**D2 — Il Postino si accende e si VEDE.** Sul Mac: `launchctl load
~/Library/LaunchAgents/com.boom.postino.plist` e `python3 bot/boom_postino.py
--test` (documentati in CLAUDE.md, «IL POSTINO»). Nel pannello: sopra ogni
bozza WhatsApp lo stato del canale letto da `heartbeat/wa-outbox` — «Mac:
ultimo ritiro 3 min fa» oppure «**Mac non ritira da 14 ore**: la bozza non
partirà». Una coda che nessuno ritira non è «In coda», è ferma, e va detto.
L'esclusione delle proposte dalla card 📮 resta accettabile SOLO con questo
stato visibile; altrimenti torna la card.

**D3 — L'interruttore della preparazione entra nel prodotto.** `/segretaria`
su Telegram e il pannello scrivono `prepareCases` e, all'accensione,
`prepareSince = adesso` (mai retroattivo: un arretrato di 137 casi non deve
partire da solo). Il monitor smette di dire «Ultimo ciclo: …» quando è spenta:
dice «Preparazione SPENTA dal <data>» con il bottone per accenderla.
Rilettura di F3 con Valentino: se in produzione `prepareCases` è già true, il
battito fermo ha un'altra causa (CAS del battito che fallisce ogni giro →
`schedulerDegraded`) e va letto `heartbeat/segretaria-preparer` a mano.

**D4 — `getAdminToken` single-flight.** Una promise in volo condivisa da tutte
le letture concorrenti dell'istanza, più un'attesa breve e un solo ritentativo
su `QUOTA_EXCEEDED`. Test per mutazione: 137 `fsGet` paralleli su istanza
fredda → **1** `signInWithPassword`; rimessa la versione attuale, il test deve
cadere. Una copia sola, in `api/homie/_lib.js`; ne beneficiano tutti i cron.

**D5 — Lo schema dell'Innesto sotto il limite.** `INGEST_SCHEMA`: niente
`type:[X,'null']` a tappeto — i campi facoltativi si omettono dai `required`
o si dichiarano con un tipo solo; il test conta le unioni e fallisce sopra la
soglia. Il worker dello Scrivano torna a leggere.

**D6 — Il giro intero come test.** 147 suite e nessuna attraversa il Mac. Un
test (`tests/segretaria/giro.mjs`) guida i handler VERI su Firestore in
memoria: messaggio in → caso → worker → proposta → conferma → `wa-outbox`
pull → ack → `readPreparationDelivery` = `sent` → ricevuta nel pannello. E lo
stesso giro fallisce, dichiarandolo, quando il pull non arriva (D2).

**D7 — Il pannello, dopo.** Solo con la misura di §5 in mano: meno «Da
verificare» (`needs_context` quando manca il FATTO, non quando manca un
indice), «Decisioni per te» prima di tutto, quattro gruppi solo se servono.
È lavoro di Codex e si decide sui numeri, non adesso.

## 4 · I lotti

| Lotto | Chi | Cosa | File | Fatto quando |
|---|---|---|---|---|
| **0** | Valentino, oggi | Postino acceso sul Mac (D2); lettura di `settings/segretaria` e `heartbeat/segretaria-preparer` in console (F3); indici deployati (`npx firebase-tools deploy --only firestore:indexes`); una parola su come sono state promosse le branch | — | il Postino fa un `pull` ogni 2' nei log |
| **1** | Codex | la PR di D1 verso main, con `npm test` intero | la sua catena | PR aperta, suite verdi, unita da Valentino |
| **2** | Claude, ramo `claude/zealous-hamilton-xsp1mv` | D4 single-flight + test per mutazione; D5 schema; CI con `firestore:indexes`; D6 il test di giro | `api/homie/_lib.js`, `api/portal/ingest.js`, `.github/workflows/ci.yml`, `tests/segretaria/giro.mjs`, `tests/run-all.mjs` | `npm test -- lib innesto giro` verde; zero `QUOTA_EXCEEDED` per 7 giorni |
| **3** | Codex, ramo `codex/segreteria-rotaie` | D2 stato del canale nel pannello; D3 interruttore in `/segretaria` e nel pannello; righe in CLAUDE.md | `api/segretaria/*`, `api/telegram/webhook.js` (solo `/segretaria`), il blocco «SEGRETERIA · SEGUITI IN OGGI» di `js/portal-app.js` | «Mac non ritira» e «SPENTA dal» visibili; test per mutazione |
| **4** | Codex, dopo §5 | D7 | come il 3 | i numeri di §5 migliorano |
| **revisione** | ChatGPT | rilegge questo studio col formato di `docs/PROMPT_GPT_INTEGRAZIONE.md` §6 | — | obiezioni scritte prima del lotto 3 |

I lotti 2 e 3 non condividono un file. Il prompt d'apertura di Codex per il
lotto 3 è in `docs/PROMPT_CODEX_OGGI.md`.

## 5 · La misura (30 giorni, tutta derivata dai dati)

1. **Consegne**: `waSentAt − approvedAt` mediano sulle proposte Segreteria
   (oggi: non esiste un dato, F2). Obiettivo: sotto i 5 minuti.
2. **Preparate/arrivate**: proposte `ready` al giorno contro seguiti aperti al
   giorno; «Da preparare» che scende, non che cresce (F6).
3. **Quota di `needs_context`** sulle proposte preparate (oggi sconosciuta:
   il pannello la mostra, nessuno la conta).
4. **`QUOTA_EXCEEDED` al giorno = 0** (oggi ~9/giorno, F4).
5. **Età del battito** `segretaria-preparer` mai sopra i 3 minuti con la
   preparazione accesa — e mai un «Ultimo ciclo» al posto di «SPENTA».

## 6 · Le domande aperte (da chiudere nella PR, non indovinando)

- Valentino: `prepareCases` e `prepareSince` sono impostati in produzione? Con
  quale valore? (F3 — da qui non si legge.)
- Valentino: le promozioni in produzione dalle branch Codex sono una scelta o
  un'abitudine? Se è una scelta, va scritta in CLAUDE.md al posto di «git push
  to main triggers automatic Vercel deployment», che oggi non è vero.
- Codex: perché la card 📮 di ripiego esclude le proposte della Segreteria? La
  risposta «claim già avvenuta» regge solo se il canale è monitorato (D2).
- Codex: l'indice `messages` (conversationId, at DESC) è stato creato a mano?
  Senza, quante delle proposte attuali sono `needs_context` per
  `latest_history_not_verified`?
- Entrambi: confermare la nuova proprietà dei file (§2, ultimo punto) o
  proporne un'altra — ma una sola.
