# Prompt d'apertura per Codex — Lotto «i modelli locali sul Mac»

> **SUPERATO il 22/09/2026**: Codex era senza crediti, il lotto è stato
> costruito direttamente (`bot/boom_locale.py`, `bot/install_locale.sh`,
> `bot/MODELLI_LOCALI.md`, `tests/locale/runner.py`). Il documento resta
> come SPECIFICA del contratto server⇄Mac — vale per chiunque tocchi quel
> lato in futuro.

*Da incollare in una chat NUOVA di Codex aperta sul repo
`valentino11marzo-pixel/Boum-roma`, DOPO il merge del ramo
`claude/lucid-ritchie-whxmhi` (porta il registro `js/ai-registry.js`, la
centrale `api/_ai.js`, `/api/ai/status` e `/ai` su Telegram). Prima riga
della chat, PRIMA del prompt: l'output di
`system_profiler SPHardwareDataType | grep -E "Chip|Memory"` dal Mac mini.*

---

Lavori nel repo BOOM Roma. Prima di tutto leggi `AGENTS.md`, poi in
`CLAUDE.md` la sezione «La Centrale AI» e «Conventions», poi
`STUDIO_MODELLI_LOCALI_2026-09.md` §4 (il contratto) e §6 (le righe rosse).
Il tuo perimetro è il **lato Mac**: file NUOVI sotto `bot/` (script,
plist, un README), `tests/locale/` (python), e 4–8 righe in `bot/README.md`.
**Non toccare** `api/`, `js/`, `tests/*.mjs`, `firestore.rules`,
`vercel.json`: il lato server è chiuso e testato (`node tests/ai/run.mjs`);
se ti serve qualcosa dal server, scrivilo come domanda nella PR. Crea il
ramo `codex/modelli-locali`.

## Il contratto che il server si aspetta (non negoziabile)

La centrale (`api/_ai.js`) parla a un endpoint **OpenAI-compatibile** dietro
un tunnel **https**, con un bearer in `Authorization`. Deve rispondere a:
- `GET  {URL}/v1/models` → `{ data: [{ id }] }` (è la sonda di `/ai`).
- `POST {URL}/v1/chat/completions` con `{ model, messages, max_tokens,
  temperature, stream:false, response_format?:{type:'json_object'} }`;
  `messages[0]` può essere `system`; un messaggio `user` può portare
  `content: [{type:'text'},{type:'image_url', image_url:{url:'data:…'}}]`
  quando c'è un modello con visione. Risposta standard
  `{ choices:[{ message:{content}, finish_reason }], usage:{prompt_tokens,
  completion_tokens}, model }`. Il testo può contenere `<think>…</think>`:
  il server lo toglie. Con `response_format` json il modello DEVE scrivere
  un oggetto JSON valido: un JSON illeggibile conta come guasto del locale.
- `POST {STT_URL}/v1/audio/transcriptions` multipart (`file`, `model`,
  `language`, `response_format=json`) → `{ text }`.
Tetto: la centrale aspetta al massimo `LOCAL_AI_TIMEOUT_MS` (default 20 s)
per chiamata; un modello che ci mette di più è un modello sbagliato per la
macchina, non un tetto da alzare.

## Compito

**1. La scelta del modello dal numero del Mac.** In `bot/MODELLI_LOCALI.md`
scrivi la tabella hardware → modelli dello studio §4 verificata su ciò che è
CORRENTE al momento dell'installazione (nomi e quantizzazioni esatte,
dimensione su disco, memoria richiesta) e la scelta fatta per QUESTO Mac,
con la riga di `system_profiler` incollata. Testo (obbligatorio), visione
(solo se la memoria lo regge accanto al testo), STT (`large-v3-turbo`).

**2. Il server.** Prima scelta `llama-server` di llama.cpp (ha `--api-key`,
la JSON mode e la visione); alternativa Ollama SOLO dietro un reverse proxy
con auth (Ollama non ha chiavi). Un server, un modello caricato, `--api-key`
= il valore che finirà in `LOCAL_AI_TOKEN` (generato con `openssl rand -hex
24`, mai scritto nel repo). Se il Mac regge la visione, o un secondo
processo o lo stesso server con mmproj: documenta la memoria misurata a
freddo e sotto una richiesta.

**3. Il tunnel.** Tailscale Funnel (URL `*.ts.net` stabile, senza dominio) o
Cloudflare Tunnel con Access service token, in questo ordine di preferenza
salvo motivi scritti. L'URL è https. Verifica dal Mac che
`curl -H "Authorization: Bearer …" {URL}/v1/models` risponda e che SENZA
bearer risponda 401/403: un endpoint aperto su internet con dentro i
documenti dei clienti è la riga rossa più grossa.

**4. launchd.** Tre plist sul modello di `bot/com.boom.scout.plist`
(`KeepAlive`, `RunAtLoad`, log su file): `com.boom.modelli.plist` (server),
`com.boom.stt.plist`, `com.boom.tunnel.plist`. Un installer idempotente
`bot/install_modelli_locali.sh` nello stile di `install_scatto_contatto.sh`
(ritrova ciò che c'è, non clobbera `.env`, rilanciarlo aggiorna e basta).

**5. Lo smoke test** `bot/modelli_smoke.py` (python3, solo stdlib +
`requests` già presente sul Mac): `/v1/models`; una completion con
`response_format` json che chiede `{"ok":true}` e VERIFICA che sia JSON; una
con un'immagine 1×1 se c'è visione; una trascrizione di 2 s di silenzio
generati al volo (wav); poi `GET https://www.boomrome.com/api/ai/status`
con `X-Homie-Secret` e stampa `local.reachable` e `local.models`. Ogni
passo stampa OK/KO col perché e i millisecondi. **Nessun contenuto vero**
nei test (niente documenti, niente foto di clienti).

**6. Le env su Vercel** (le mette Valentino; tu scrivi l'elenco esatto
nella PR con i valori NON segreti): `LOCAL_AI_URL`, `LOCAL_AI_MODEL`,
`LOCAL_AI_VISION_MODEL` (se c'è), `LOCAL_STT_URL`, `LOCAL_STT_MODEL`,
`LOCAL_AI_TOKEN` (o `LOCAL_AI_CF_ID`/`LOCAL_AI_CF_SECRET`). Poi su Telegram
`/ai` → «🟢 Accendi il locale»: da lì è tutto dell'operatore.

**7. Test.** `tests/locale/runner.py` (come `tests/scout/runner.py`: estrae
le funzioni pure via AST, zero rete): la lettura della riga di
`system_profiler` → fascia di memoria → modelli consigliati; la costruzione
degli argomenti di `llama-server` dalla config; il rifiuto di un URL http
pubblico e di un token vuoto nell'installer. Verifica **per mutazione** i due
«mai» (http pubblico, token vuoto): rimetti il difetto, il test deve cadere.

**8. Documentazione.** In `bot/README.md` 4–8 righe nello stile del file
(cos'era: nessun modello sul Mac; cosa cambia; dove sta il test). Il resto in
`bot/MODELLI_LOCALI.md`. Se Homie (OpenClaw) può usare lo stesso server come
provider, scrivi COME in una sezione a parte: è documentazione, non codice.

## Regole dure

Nessun segreto nel repo (token, URL del tunnel con credenziali); ogni URL
BOOM è `https://www.boomrome.com`; niente dipendenze nuove sul server (il
lato Vercel non si tocca); nel Mac niente dati dei clienti nei test; niente
http pubblico; un server senza auth non si espone MAI.

## Fatto quando

PR aperta verso `main` dal ramo `codex/modelli-locali` con: la riga di
`system_profiler`, la scelta dei modelli motivata, l'output dello smoke test
(con `local.reachable:true` dal server), l'output di
`python3 tests/locale/runner.py`, e l'elenco delle env da mettere su Vercel.
Domande aperte nella PR, mai risolte indovinando.
