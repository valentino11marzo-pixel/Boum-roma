# AGENTS.md — le regole di casa per chi lavora in questo repo (Codex incluso)

Questo file lo legge Codex da solo. Le stesse regole valgono per Claude e
per chiunque apra una PR. La conoscenza del progetto sta in `CLAUDE.md`:
leggerlo PRIMA di toccare un file (è lungo: cerca la sezione del componente
su cui lavori). La missione in corso e la divisione del lavoro stanno in
`STUDIO_SEGRETARIA_UNICA_2026-09.md` §5: se un'istruzione contraddice lo
studio, vince lo studio.

## Cos'è

BOOM Roma (boomrome.com): gestione affitti a Roma. HTML/JS statico su
Vercel, Firestore come UNICA verità, Vercel Serverless Functions (Node ESM
in `api/`), modelli Anthropic solo dal server, bot Telegram, un Mac
(«Homie») che esegue su WhatsApp e portali. Nessun build step.

## Le nove regole (non negoziabili)

1. Mai inventare: un componente sa solo ciò che dati e tool gli dicono;
   ambiguo = «non lo so», mai un fatto finto.
2. Una copia sola: ogni regola vive in un motore puro e testato
   (`js/*-engine.js`, UMD, importabile da browser e da `api/`).
3. Si misura prima di costruire.
4. Il server pensa, il Mac esegue; un bot è solo trasporto.
5. Cambiare porta = cambiare solo il trasporto: coda, stato e veti restano.
6. Nessun secondo stato: Firestore è l'unica verità.
7. Mai delegare prezzo e trattativa, né a umani né a modelli.
8. Approvazione umana su ciò che non è provato; auto-invio solo sul
   misurato (scala della fiducia).
9. Ogni autonomia ha kill switch, escalation e idempotenza.

## Come si lavora qui

- **Firestore solo via `api/homie/_lib.js`** (`fsGet/fsPatch/fsCreate/
  fsList`). Id deterministici per idempotenza (`fsCreate(..., id)` → 409 =
  già fatto). Una collection nuova va in `firestore.rules` (di norma
  admin-only) o cade nel default-deny.
- **Modelli**: JSON letto con `api/_modeljson.js` (mai `JSON.parse` a
  mano), chiamate con tetto (`api/_budget.js`, `aiSignal`). Nei log va la
  FORMA, mai il contenuto (nel repo passano CF, IBAN, documenti veri).
- **Dipendenze**: un pacchetto importato da `api/**` va in ENTRAMBI
  `api/package.json` e `package.json` (+ lockfile). Import statici in
  cima al file: `await import()` non viene tracciato da Vercel.
- **URL BOOM consegnati a servizi esterni**: sempre `https://www.boomrome.com`
  (l'apex reindirizza; un tool o un webhook non segue i redirect).
- **Best-effort dichiarato**: un anello secondario (AI, Telegram, allegato)
  che fallisce non perde MAI il dato primario; il doc esce comunque, con
  scritto cosa manca.
- **Test**: nessun framework. Ogni suite guida il handler VERO con un
  Firestore in memoria (`globalThis.fetch` stubbato) e mocka solo la rete;
  si registra in `tests/run-all.mjs`; `npm test -- <nome>` esegue un
  sottoinsieme. Le regole delicate si verificano **per mutazione**
  (rimetti il difetto, il test deve cadere). Un test non si salta, non si
  disabilita, non si allenta.
- **Documentazione**: ogni cambiamento che cambia un comportamento aggiunge
  3-8 righe nella sezione giusta di `CLAUDE.md`, nello stile del file:
  cos'era, cosa cambia, dove sta il test.

## Cosa non fare

- Non creare stato fuori da Firestore (file, memorie di modello, code
  proprie). Non scrivere dati da un componente guidato da prompt senza una
  proposta confermata.
- Non toccare file posseduti da un altro lotto (vedi lo studio §5). Un
  conflitto è un errore di perimetro: fermati e scrivilo nella PR.
- Non aggiungere dipendenze, env o segreti senza necessità dichiarata; mai
  un segreto nel codice o nei log.
- Non fare merge: le PR le unisce Valentino. Non pushare su `main`.
- Non riscrivere ciò che regge per farlo «più pulito»: il repo porta
  lezioni pagate in produzione, scritte accanto al codice.

## Flusso

Ramo `codex/<lotto>` (o `claude/<lotto>`), commit piccoli con messaggio
che dice cos'era e cosa cambia, PR verso `main` con: cosa, perché, quali
suite girate e l'output di `npm test -- <suite>`. Domande aperte nella
descrizione della PR, mai risolte tirando a indovinare.
