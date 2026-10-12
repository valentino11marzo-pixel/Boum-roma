# AGENTS.md — le regole di casa per chi lavora in questo repo (Codex incluso)

Questo file lo legge Codex da solo. Le stesse regole valgono per Claude e
per chiunque apra una PR.

## Prima di tutto: `ORA.md`

`ORA.md` dice cosa si fa adesso, chi costruisce e cosa non si fa. Vince su
tutto: su questo file, su `CLAUDE.md`, sugli studi `STUDIO_*.md` e sui prompt
in `docs/PROMPT_*.md`, che da oggi sono storia. Se la richiesta non è in
`ORA.md`, fermati e chiedi a Valentino cosa esce per farle spazio.

**Ruoli (dal 12/10/2026; li fissa `ORA.md`).** Costruisce Claude. Codex
rivede: legge le PR che toccano soldi, contratti e firma e scrive le
obiezioni — file, riga, lo scenario che si rompe — senza riscriverle. Codex
non apre rami o PR di funzionalità se `ORA.md` non gli assegna
esplicitamente un lavoro.

**Dove sta la conoscenza.** `CLAUDE.md` è la mappa, corta. Il dettaglio e la
storia di ogni area sono in `docs/aree/<area>.md`: leggi quello dell'area
che tocchi PRIMA di toccare un file.

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
- **Modelli**: una chiamata a un modello passa SOLO da `api/_ai.js`
  (`ai({ purpose, system, messages|user, maxTokens, timeoutMs, json })`),
  con lo scopo dichiarato in `js/ai-registry.js` (file, modello cloud,
  modalità, se può andare in locale e perché). Mai una `fetch` diretta ad
  `api.anthropic.com`, mai un nome di modello scritto a mano in un file
  (`tests/ai` e `tests/tempo` lo fanno cadere). JSON letto con
  `api/_modeljson.js` (mai `JSON.parse` a mano). Nei log va la FORMA, mai
  il contenuto (nel repo passano CF, IBAN, documenti veri). Il locale sul Mac
  è un endpoint OpenAI-compatibile dietro un tunnel: il token sta in env
  (`LOCAL_AI_TOKEN`), mai in Firestore né nel codice.
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
  3-8 righe nella sezione giusta di `docs/aree/<area>.md`, nello stile del
  file: cos'era, cosa cambia, dove sta il test. **Mai in `CLAUDE.md`**: è la
  mappa e resta sotto le 300 righe (`tests/contesto` lo verifica).

## Cosa non fare

- Non creare stato fuori da Firestore (file, memorie di modello, code
  proprie). Non scrivere dati da un componente guidato da prompt senza una
  proposta confermata.
- Non aprire un terzo ramo di lavoro: al massimo 2 rami aperti in tutto il
  repo, e un ramo tocca un'area sola. Un conflitto con il lavoro di un altro
  è un errore di perimetro: fermati e scrivilo nella PR.
- Non aggiungere dipendenze, env o segreti senza necessità dichiarata; mai
  un segreto nel codice o nei log.
- Non fare merge: le PR le unisce Valentino, solo con la CI verde. Non
  pushare su `main`.
- Prima di ogni deploy autorizzato, leggi il commit realmente servito da `www.boomrome.com` e confrontalo con il candidato. Se il dominio è cambiato durante il lavoro o il ramo parte da una versione precedente, integra e verifica i lavori già pubblicati prima di procedere: una CI verde sul solo ramo non prova che siano conservati.
- Il rilascio ha un solo responsabile coordinato. Ricontrolla alias e commit subito prima della pubblicazione; dopo verifica dominio, contenuto degli asset e provenienza Git, distinguendo queste prove dal collaudo autenticato.
- Non riscrivere ciò che regge per farlo «più pulito»: il repo porta
  lezioni pagate in produzione, scritte accanto al codice.

## Flusso

Ramo `claude/<obiettivo>` (o `codex/<obiettivo>` solo se `ORA.md` assegna
il lavoro a Codex), commit piccoli con messaggio che dice cos'era e cosa
cambia, PR verso `main` con: cosa, perché, quale voce di `ORA.md`, quali
suite girate e l'output di `npm test -- <suite>`. Domande aperte nella
descrizione della PR, mai risolte tirando a indovinare.

Revisione (il lavoro di Codex): un commento sulla PR con le obiezioni
ordinate per gravità, ognuna con file, riga e lo scenario concreto che si
rompe. Niente commit sul ramo di un altro.
