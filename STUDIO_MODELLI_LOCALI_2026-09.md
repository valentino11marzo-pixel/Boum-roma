# STUDIO — I MODELLI LOCALI · settembre 2026
### Il game changer è la misura, non il modello. Formato: decisioni, non opzioni.

*21 settembre 2026. La frase dell'operatore: «il progetto modelli locali è un
game changer dal punto di vista dei costi; i costi stanno diventando
insostenibili nonostante siano worth it; procedere col massimo delle nostre
capacità, senza limiti». In parallelo lo stesso progetto è aperto su Codex.*

---

## 0 · La risposta in tre righe

1. **I costi AI di PRODUZIONE di BOOM sono quasi certamente piccoli** — decine
   di dollari al mese, letti nel codice (§2) — e già disciplinati: haiku quasi
   ovunque, regole prima del modello, lotti, tetti giornalieri. Ma **nessuno
   li ha mai misurati**: non esisteva un contatore. Il primo game changer è il
   contatore, ed è consegnato oggi (§3). **Se il costo «insostenibile» è
   quello degli STRUMENTI di sviluppo** (Claude Code, Codex: ~10× la
   produzione), i modelli locali non lo toccano — e due agenti in parallelo
   sullo stesso progetto sono il modo più caro di spendere (§1).
2. **Il locale ha un valore vero, e non è (solo) il costo**: i documenti
   d'identità, gli estratti conto e le email dei portali smettono di uscire
   di casa. Vale dove il codice VALIDA l'uscita del modello (JSON a whitelist,
   veti, conferma dell'operatore) — cioè il grosso delle chiamate. NON vale,
   oggi, per i testi ai clienti: lì la voce si misura sulle approvazioni, non
   sul confronto.
3. **Il ponte è costruito lato server** (una porta, tre modalità, contatori,
   promozione misurata). **Il lato Mac è il lotto di Codex**
   (`docs/PROMPT_CODEX_MODELLI_LOCALI.md`): server dei modelli, tunnel,
   launchd. Prerequisito numero uno, che nel repo NON c'è scritto e decide
   tutto: **che chip e quanta RAM ha il Mac mini** (§4).

---

## 1 · Lo stress-test della premessa

**«I costi stanno diventando insostenibili.»** Quali? Nel repo ci sono due
spese AI distinte e nessuna delle due è misurata:

- *La produzione* — 25 scopi che chiamano un modello (§2). Tutto ciò che ha
  volume è già haiku ($1/$5 per milione di token), in lotto e con un tetto
  (Lead Brain: ≤12 chiamate/giorno; il bot: 85% dei messaggi risolti da regex
  a costo zero). Le scelte care sono tre e sono su chiamate a bassa
  frequenza: opus 4.8 sulle bozze (Commerciale, Segretaria, ai.reply), sonnet
  5 sull'interprete del bot, opus 5 sull'inventario. Stima dal codice:
  **$15–40 al mese**, fino a ~$70 con la Segretaria al tetto giornaliero.
  Non è «insostenibile»: è una cifra che si guarda una volta al mese.
- *Lo sviluppo* — Claude Code e Codex. Non li vedo (nessuna fattura nel
  repo), ma due abbonamenti da $200 sono 10× la produzione. **Un modello
  locale non sostituisce un modello di frontiera su QUESTO codice**: 107
  suite, lezioni scritte accanto al codice, invarianti verificate per
  mutazione — un 14B locale produce codice peggiore e sposta il costo sul
  tempo dell'operatore, che è la risorsa scarsa (STUDIO_CARICO §2). La leva
  sui costi di sviluppo è di PROCESSO: un agente per lotto, mai due sullo
  stesso file (la PR #234 di Codex si è fermata su un conflitto di
  perimetro, non su un errore), sessioni meno numerose e più grandi.

**«Game changer.»** Un modello locale cambia il gioco solo dove valgono tre
condizioni insieme: (a) l'uscita è validata dal codice a valle (whitelist,
JSON a schema, veti, ✅ dell'operatore), (b) la latenza non è davanti a un
cliente, (c) i dati sono sensibili. Dove valgono, il cloud è un costo E un
rischio inutile; dove non valgono, il locale è una scommessa sulla qualità che
nessuno ha misurato. Il registro (§3) le dichiara scopo per scopo.

**«Senza limiti.»** Il limite esiste ed è fisico: un Mac mini. Con 8 GB si
classifica e basta; con 16 GB si copre il caso base; con 24–32 GB tutto il
registro, visione compresa (§4). E prima di scegliere un modello si legge
`system_profiler SPHardwareDataType`. Un piano scritto senza quel numero è un
piano scritto due volte.

**«Anche su Codex.»** Due agenti che costruiscono la stessa cosa producono due
architetture divergenti da riconciliare a mano. La divisione giusta è per
STRATO, con un contratto scritto nel mezzo: qui il server (porta, politica,
contatori, promozione, console), a Codex il Mac (server dei modelli, tunnel,
launchd, smoke test). La giunzione è tre variabili d'ambiente su Vercel e un
documento `settings/ai`: nessun file in comune.

---

## 2 · La mappa dei costi, letta nel codice (non stimata a sensazione)

| Scopo | File | Modello | Quando | Stima per chiamata | Locale? |
|---|---|---|---|---|---|
| `leads.brain` | api/leads/brain.js | haiku | cron 10′, ≤12/giorno, ≤20 lead per chiamata | ~$0.01 | **sì** — regole prima, whitelist dopo: il caso ideale |
| `leads.inbox` | api/leads/scan-inbox.js | haiku | per email dei portali | ~$0.002 | **sì** — estrazione di campi presenti nel testo |
| `wizard.interpret` | api/wizard/interpret.js | **sonnet 5** | ~15% dei messaggi al bot (catalogo nel prompt) | ~$0.005 | **sì** — piano a whitelist + ✅ dell'operatore |
| `wizard.describe` | api/wizard/describe.js | haiku | alla pubblicazione + 6/notte | ~$0.002 | sì, ma testo pubblico: si giudica leggendolo |
| `commerciale.first` | api/employees/commerciale.js | **opus 4.8** | per lead nuovo, ogni 2h | ~$0.016 | solo via approvazioni (testo al cliente) |
| `segretaria.turn` | api/segretaria/_core.js | **opus 4.8** | per messaggio sulle chat consegnate (≤60/giorno) | ~$0.015 | solo via approvazioni; l'ombra misura `escalate` |
| `agent.reply` | api/agent/ai.reply.js | **opus 4.8** | a richiesta | ~$0.016 | solo via approvazioni |
| `pfs.brief` | api/pfs/brief.js | **opus 4.8** | 1/giorno | ~$0.04 | sì (lo legge l'operatore) |
| `inventario.video` | api/contracts/inventario.js | **opus 5** vision | per inventario (12–20 fotogrammi) | ~$0.18 | **mai** — vale sul deposito |
| `photos.audit` | api/photos/enhance.js | haiku vision | 3/notte + alla pubblicazione | ~$0.025 | sì, con modello visivo |
| `docs.smista` / `docs.ocr` / `portal.ingest` | documents/*, portal/ingest.js | haiku | per documento | ~$0.005–0.02 | foto sì, **PDF mai** (il locale non legge documenti) |
| `profile.ocr` | api/profile/upload.js | haiku vision | per documento d'identità | ~$0.005 | **sì, e per PRIVACY prima che per costo** |
| `banking.mail` / `banking.pdf` | api/banking/scan-inbox.js | haiku | per avviso / estratto | ~$0.002 / ~$0.05 | email sì (dati bancari in casa); PDF mai |
| `phone.analyze` | api/phone/_lib.js | haiku | per chiamata | ~$0.003 | sì |
| `listing.ask` · `canone.bot` · `concierge.chat` · `media.caption` | pubblici, rate-limited | haiku | a richiesta | ~$0.002 | sì — in locale il costo di un abuso è zero |
| `outreach.draft` · `docs.qa` | draft.js, qa.js | haiku | a richiesta | ~$0.003 | sì (approvato / letto dall'operatore) |
| `parse.docs` | api/parse-docs.js | haiku | dalla pagina Doc Parser | ~$0.01 | **mai** — proxy: la pagina legge la risposta grezza |
| `stt.transcribe` | api/wizard/_stt.js | whisper-1 (OpenAI) | note vocali, chiamate | $0.006/min | **sì** — Whisper su Apple Silicon è pari al cloud |

Le stime vengono dalle dimensioni dei prompt nel codice e dal listino
(`PRICES` in `js/ai-registry.js`). **Da oggi non servono più**: `/ai` su
Telegram e `GET /api/ai/status` leggono i token VERI di ogni risposta.
Decisione: **nessun cambio di modello prima di 14 giorni di contatori.**

**La leva immediata che non ha bisogno del Mac**: `purposes.<scopo>.cloudModel`
in `settings/ai`. Il Commerciale su **sonnet 5 invece di opus 4.8** costa 2,5
volte meno per una bozza che passa comunque da un tap umano — ma si cambia
DOPO aver letto due settimane di tasso di approvazione (`/fiducia` conta le
decisioni per categoria), e si torna indietro se cala. Un cambio di modello
senza quel numero è un'opinione.

---

## 3 · Cosa è stato costruito oggi (lato server, in questo ramo)

Dettagli e regole in `CLAUDE.md` → «La Centrale AI». In breve:

- **`js/ai-registry.js`** — il registro puro: 25 scopi con file, modello cloud
  di default, modalità (testo/visione/documento/audio), `localOk` col
  perché, posta in gioco, e i campi su cui misurare l'accordo cloud⇄locale.
  Anti-deriva nelle due direzioni (`tests/ai`): un chiamante senza scopo o
  uno scopo senza chiamante fanno cadere il test; nessun modello scritto a
  mano fuori dal registro.
- **`api/_ai.js`** — la porta unica. Tre modalità per scopo: `cloud` (default:
  il deploy non cambia niente), `shadow` (risponde il cloud, il locale corre
  in parallelo, si registra SOLO l'accordo — mai il contenuto), `local`
  (risponde il locale; giù, lento o JSON illeggibile → si ricade sul cloud e
  lo si dichiara). Confini che le impostazioni non scavalcano: inventario,
  PDF e proxy mai in locale; un'immagine esige un modello visivo locale;
  l'ombra non è un paracadute. Contatori atomici in `aiUsage/<giorno>` e
  `aiShadow/<scopo>` col costo dal listino; nei log mai contenuto.
- **`GET/POST /api/ai/status`** e **`/ai` su Telegram** — sonda al locale,
  spesa oggi/mese per backend e per scopo, verdetti dell'ombra, interruttori
  (`aitg:`). La promozione la decide l'operatore coi numeri davanti:
  ≥30 coppie, accordo ≥90%, locale che fallisce ≤10% → «pronta».
- **`api/wizard/_stt.js`** — Whisper sul Mac prima, OpenAI come rete.
- I 23 chiamanti riscritti sulla porta; `_claude.js` è un wrapper; il
  proxy del Doc Parser resta diretto ma si conta.

Tutto questo lavora GIÀ oggi, in cloud, senza Mac: i contatori partono al
primo deploy. Il locale si accende quando esiste (§4), da Telegram.

---

## 4 · Il lato Mac — il lotto di Codex

> **Aggiornamento 22/09**: Codex è rimasto senza crediti e l'operatore ha
> già installato Ollama. Il lotto è stato fatto qui: `bot/boom_locale.py`
> (il ponte con la serratura), `bot/install_locale.sh` (un comando),
> `bot/MODELLI_LOCALI.md` (la guida), `tests/locale/runner.py`. Il
> contratto sotto resta valido ed è quello che il ponte rispetta.

**Prima domanda, prima riga della chat con Codex**: sul Mac mini,
`system_profiler SPHardwareDataType | grep -E "Chip|Memory"`. Un Intel → il
progetto si ferma qui (niente accelerazione utile). Apple Silicon:

| Memoria unificata | Testo | Visione | STT | Cosa copre |
|---|---|---|---|---|
| 8 GB | Qwen3 4B / Gemma 3 4B (Q4) | no | whisper large-v3-turbo | solo classificazione corta (brain, phone); margini stretti, niente in parallelo |
| 16 GB | Qwen3 8B / Gemma 3 12B (Q4) | Qwen2.5-VL 7B (Q4, stretto) | sì | il caso base: brain, inbox, interpret, canone, smista-foto |
| 24–32 GB | Qwen3 14B · Qwen3 30B-A3B (MoE: 3B attivi, veloce) · Gemma 3 27B (Q4) | Qwen2.5-VL 7B | sì | tutto il registro `localOk`, visione compresa |
| 64 GB+ | Qwen3 32B · Llama 3.3 70B (Q4) | Qwen2.5-VL 32B | sì | estrazioni vicine a haiku |

*(Nomi al meglio della mia conoscenza: Codex verifica cosa è corrente al
momento dell'installazione. Ciò che NON cambia è il contratto.)*

**Il contratto** (è ciò che la centrale si aspetta, verificato in `tests/ai`):
1. Un server **OpenAI-compatibile**: `GET /v1/models`, `POST
   /v1/chat/completions` (messages con `system`, `max_tokens`,
   `response_format: {type:'json_object'}`, immagini come `image_url` data
   URL quando c'è un modello visivo; `<think>…</think>` nel testo è tollerato,
   la centrale lo toglie). Candidati: **llama.cpp `llama-server`** (ha
   `--api-key`, la JSON mode via grammatica, la visione via mmproj —
   la prima scelta), **Ollama** (il più semplice; senza auth → dietro un
   proxy), **mlx-lm** (il più veloce su Apple Silicon per il testo).
2. **STT**: `POST /v1/audio/transcriptions` multipart (speaches /
   faster-whisper-server / whisper.cpp con la rotta compatibile), modello
   `large-v3-turbo`.
3. **Tunnel https stabile** con autenticazione: Tailscale Funnel (URL
   pubblico `*.ts.net`, senza dominio) o Cloudflare Tunnel (+ Access service
   token). Il bearer va su Vercel come `LOCAL_AI_TOKEN`; con Cloudflare
   Access `LOCAL_AI_CF_ID`/`LOCAL_AI_CF_SECRET`. **Mai http pubblico**: la
   centrale lo rifiuta.
4. **launchd** (KeepAlive, RunAtLoad) per server, STT e tunnel — come i
   bracci già installati (`bot/*.plist`).
5. **Smoke test** dal Mac: `/v1/models`, una completion JSON con
   `response_format`, una con immagine (se visione), una trascrizione; poi
   `GET https://www.boomrome.com/api/ai/status` → `local.reachable:true`.
6. **Homie** (OpenClaw sul Mac) può puntare il proprio provider allo stesso
   server: la sua spesa va a zero. È secondario — il mandato di HOMIE.md è
   già «esegui, non pensare» — e resta documentazione, non codice.

Le variabili su Vercel: `LOCAL_AI_URL`, `LOCAL_AI_MODEL`,
`LOCAL_AI_VISION_MODEL`, `LOCAL_STT_URL`, `LOCAL_STT_MODEL`, `LOCAL_AI_TOKEN`
(o le due CF). Poi `/ai` → «🟢 Accendi il locale» → gli scopi in `shadow`.

---

## 5 · Il piano, in ordine di lavoro tolto per minuto tuo

1. **Merge di questo ramo** (le rules `aiUsage`/`aiShadow` le deploya la CI).
   Da quel momento `/ai` conta. Costo per te: zero. Rischio: zero (default
   cloud, verificato per mutazione).
2. **Il numero del Mac** (`system_profiler`) incollato nella chat di Codex,
   insieme a `docs/PROMPT_CODEX_MODELLI_LOCALI.md`. Un minuto.
3. **Codex installa il lato Mac** (2–4 ore sue, ~15 minuti tuoi per le env
   su Vercel e l'auth del tunnel). Fatto quando `/ai` dice «raggiungibile».
4. **Due settimane in ombra** sugli scopi JSON: `leads.brain`, `leads.inbox`,
   `wizard.interpret`, `phone.analyze`, `canone.bot`, `docs.smista` (foto),
   `profile.ocr` (se c'è visione), `stt.transcribe` in `local` da subito
   (Whisper non ha bisogno di ombra). Costo per te: un tap per scopo.
5. **Promuovere ciò che è «pronta»** — un tap per scopo, coi numeri sotto.
   Atteso, se il Mac regge: il 60–80% delle chiamate a costo token zero e
   ogni documento d'identità, estratto conto ed email dei portali che resta in
   casa. Il resto (le bozze ai clienti) continua in cloud.
6. **Sui testi ai clienti** (`commerciale.first`, `segretaria.turn`,
   `agent.reply`, `wizard.describe`): prima `cloudModel: claude-sonnet-5` con
   il tasso di approvazione davanti; il locale SOLO dopo un confronto vero
   sulle approvazioni. Chi scrive ai clienti si giudica dai clienti.

---

## 6 · Le righe rosse

- **Mai in locale** inventario, PDF, proxy del Doc Parser: sta nel registro
  e il documento non lo scavalca.
- **Mai un http pubblico, mai il token in Firestore o nel codice.**
- **Mai promuovere senza numeri**; mai un testo libero in locale senza le
  approvazioni davanti.
- **Mai due agenti sugli stessi file**: il server è questo ramo, il Mac è
  `codex/modelli-locali`; la giunzione è `settings/ai` + env.
- **Il costo non si stima più: si legge in `/ai`.** In una discussione sui
  costi, da oggi, un numero «a sensazione» è un errore.
- **Nessun nuovo servizio, nessun secondo stato** (AGENTS.md regola 6): lo
  stato del locale sta su Firestore e in env, il Mac non tiene code proprie.

---

## 7 · Cosa non so, dichiarato

- Il chip e la memoria del Mac mini (§4 dipende da questo).
- La fattura Anthropic vera e la spesa degli strumenti di sviluppo: §1 e §2
  sono letture del codice, non della console. Fra 14 giorni `/ai` sostituisce
  la stima con la misura — per la produzione. Per lo sviluppo il numero ce
  l'hai tu.
- Se il dominio è su Cloudflare (decide Tailscale Funnel vs cloudflared:
  Codex verifica dal Mac).
