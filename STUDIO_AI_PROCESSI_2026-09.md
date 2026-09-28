# STUDIO — L'AI NEI PROCESSI · settembre 2026
### Meno chiamate, più resa. Formato: decisioni, non opzioni.

*28 settembre 2026. La domanda dell'operatore: «ottimizzare i crediti, sfruttare
il modello locale sul Mac mini per tagliare il 50–60%, e cogliere l'occasione
per migliorare davvero l'uso dell'AI nei processi». Nessun codice in questo
studio: prima si decide, poi si esegue a lotti misurati.*

---

## 0 · La risposta in tre righe

1. **Il motore c'è già ed è giusto** (`api/_ai.js` + `js/ai-registry.js`: una
   porta, 26 scopi, cloud/ombra/locale, contatori). Non serve una nuova
   infrastruttura: serve decidere **cosa gli facciamo fare**. Oggi quattro
   componenti su Opus scrivono bozze per la stessa persona e il più caro
   lavora in anticipo su casi che nessuno apre.
2. **Il 50–60% non arriva dal Mac, arriva dal modello giusto e dal lavoro su
   richiesta.** Il 95% della spesa è una sola voce (preparazione della
   Segretaria, Opus): spostarla su Sonnet 5 vale da sola ~−57% del totale
   API; prepararla solo quando serve vale di più. Il Mac (M4, 16 GB,
   qwen3:8b) prende i lavori interni piccoli: pochi euro, dati in casa.
3. **C'è un difetto di classe più urgente dei costi: un guasto AI costa $0 e
   moltiplica le chiamate.** Il 28/09 `/ai` mostra 1.292 chiamate a $0,00:
   quasi certamente fallite, e ritentate all'infinito dai processi che non
   ricordano il fallimento. Nel frattempo i lead dalle email dei portali non
   entrano.

---

## 1 · I fatti (letti, non dedotti)

**`/ai` del 28/09 sera** (incollato dall'operatore):
- Mese: **$55,92 su 2.236 chiamate, 7 giorni misurati** → ~$8/giorno,
  ~$240/mese (≈ €220). Tutto cloud, locale 0.
- Oggi: **1.292 chiamate, $0,00**. Per scopo: preparazione Segretaria 608,
  estrazione lead dalle email dei portali 478, Commerciale prima risposta
  195, analisi chiamate 7, Lead Brain 2, Smistatore 1, brief PFS 1.
- Riferimento: il 25/09 la preparazione faceva ~142 chiamate e $10,29
  (95% della spesa del giorno).

**Il Mac mini** (via SSH, 28/09): Apple M4, **16 GB**, Ollama con
**qwen3:8b**, ponte `boom_locale.py` acceso, Funnel attivo, `--smoke` tutto
OK, il server lo vede «configurato e acceso». Unico scopo in locale: la chat
del Concierge inquilino (0 chiamate oggi). Nessun server Whisper
(`STT_URL` assente). A margine: `com.boomrome.digest` esce con 2,
`com.boom.listing-wizard` ha un'uscita 1 precedente.

**Perché $0 su 1.292 chiamate vuol dire «fallite».** Il costo si calcola dai
token che Anthropic restituisce (`recordUsage` → `REG.costUsd(model, usage)`):
una chiamata rifiutata non ha `usage`, quindi non costa e non si vede. Il
volume lo conferma: 944 chiamate nei sei giorni prima, 1.292 in uno. Causa
più probabile: credito Anthropic esaurito (da verificare su
console.anthropic.com → Billing).

**Perché un guasto moltiplica le chiamate** (letto nel codice):
- `api/leads/scan-inbox.js`: se l'estrazione fallisce, `continue` **senza**
  `remember()` → la stessa email si ritenta ogni 10 minuti, per sempre
  (144 giri/giorno × email in finestra = i 478 di oggi).
- `api/employees/commerciale.js`: un errore conta `aiErrors++` e il lead
  resta `new` → ritentato a ogni giro.
- `api/segretaria/worker.js`: ha il backoff (1/5/15/60/360′), ma sui casi
  nuovi continua a provarci, uno al minuto.

Nessuno di questi si ferma quando è il **fornitore** a essere giù (credito,
chiave, 529): ognuno ritenta per conto suo, e `/ai` mostra «$0» invece di
«tutto rotto».

---

## 2 · La mappa dei 26 scopi

Colonne: **chi lo fa partire** · **chi legge l'output** · **decisione**.
«Resa» = l'output viene usato (approvato, corretto, letto). Dove scritto
«da misurare», la decisione arriva coi numeri di §5.

### A · Parlano ai clienti (Opus) — il 95% della spesa

| Scopo | Parte da | Output letto da | Decisione |
|---|---|---|---|
| `segretaria.prepare` | ogni evento sul caso (worker al minuto, dopo la quiete) | te, in Oggi, se apri il caso | **Sonnet 5 subito**; poi **su richiesta** (§3.2) |
| `segretaria.turn` | messaggio su chat consegnata col 🤖 | il cliente, dopo i binari | resta, **Sonnet 5**; misurare escalation |
| `commerciale.first` | cron ogni 2h, lead `new` dopo 20′ | te, card Telegram | **assorbito dalla preparazione** (§3.1) |
| `agent.reply` | Homie/portal su richiesta | te | **assorbito dalla preparazione** (§3.1) |

### B · Leggono documenti con peso legale o economico — restano Opus

| Scopo | Decisione |
|---|---|
| `portal.ingest` (Innesto, Opus 5) | resta: su richiesta, volume basso, vale il contratto |
| `inventario.video` (Opus 5) | resta: vale sul deposito |

### C · Lavori interni ad alto volume (Haiku) — candidati al Mac

| Scopo | Modalità | Decisione |
|---|---|---|
| `leads.inbox` (email dei portali) | testo | **ombra sul Mac** una settimana; + memoria del fallimento (§4) |
| `phone.analyze` | testo | **ombra sul Mac** |
| `banking.mail` | testo | **ombra sul Mac** (dati bancari restano in casa) |
| `leads.brain` | testo | ombra; volume già basso (Stage 0 gratis fa il grosso) |
| `docs.qa` | testo | ombra |
| `wizard.interpret` (Sonnet) | testo | ombra; il router gratis ne toglie già l'85% |
| `media.caption`, `wizard.describe`, `outreach.draft` | testo | restano Haiku: bassi volumi, testo pubblico |
| `listing.ask`, `canone.bot`, `concierge.chat` | testo, pubblico | restano Haiku (il Concierge è già «local»: verificare che abbia senso esporre il Mac a una chat pubblica) |
| `docs.smista`, `docs.ocr`, `profile.ocr`, `photos.audit` | documento/visione | restano Haiku: qwen3:8b non vede; un modello visivo a 16 GB ruba memoria a tutto il resto |
| `banking.pdf`, `parse.docs` | documento | restano cloud per costruzione |

### D · Rapporti — si tengono solo se letti

| Scopo | Decisione |
|---|---|
| `pfs.brief` (Opus, 1/giorno) | **da misurare**: se non lo leggi, si spegne; se sì, Sonnet |
| `stt.transcribe` (Whisper, $0,006/min) | resta cloud: il risparmio non ripaga un server in più sul Mac |

---

## 3 · I quattro principi della nuova architettura

### 3.1 · Un solo cervello per conversazione

Oggi per la stessa persona possono scrivere `commerciale.first`,
`agent.reply`, `segretaria.turn` e `segretaria.prepare`: quattro prompt,
quattro contesti pagati, bozze che possono contraddirsi. Resta **la
preparazione del caso** (è l'unica che legge persona, storia, immobile,
slot e decisioni). La prima risposta a un lead nuovo diventa **una modalità
della preparazione**, non un agente a sé; `agent.reply` diventa una chiamata
alla stessa funzione. Il Commerciale conserva il follow-up a template
(gratis, già nella scala della fiducia).

### 3.2 · Su richiesta, non in anticipo

La preparazione gira quando:
- **apri il caso** in Oggi (o tocchi la card su Telegram), oppure
- una **scadenza confermata** o una richiesta datata entro l'ora lo esige
  (le stesse eccezioni che oggi scavalcano la quiete).

Un messaggio in arrivo **non** fa più partire il modello: aggiorna la coda,
e il caso si prepara quando qualcuno lo guarda. Il costo diventa
proporzionale ai casi che leggi, non ai messaggi che arrivano.

### 3.3 · Il modello secondo la posta in gioco

| Livello | Chi | Cosa |
|---|---|---|
| 0 · regole | codice, gratis | date, veti, deduplicazione, router del bot, Stage 0 |
| 1 · Mac | qwen3:8b | estrarre, classificare, riassumere testi interni brevi |
| 2 · Sonnet 5 | cloud | bozze ai clienti che passano dal tuo tap |
| 3 · Opus 5 | cloud | documenti con peso legale o economico |

Opus 4.8 per le bozze esce dal registro come default.

### 3.4 · Ogni scopo si guadagna il posto

Per ogni scopo che produce qualcosa per te: **quante volte l'output è stato
usato** (approvato, corretto, ignorato). Due settimane sotto soglia → si
spegne. Le approvazioni esistono già (`action_queue`, preparazioni
approvate): manca solo metterle accanto al costo nella stessa riga di `/ai`.

---

## 4 · Il difetto di classe da chiudere prima di tutto

**Un guasto del fornitore deve fermare, non moltiplicare.**
1. **Interruttore unico in `api/_ai.js`**: N errori consecutivi di tipo
   fornitore (credito, 401/403, 529 ripetuti) → pausa di 15′ per tutte le
   chiamate cloud, **un** avviso Telegram, ripresa automatica. Le chiamate
   in pausa falliscono subito, senza rete.
2. **`/ai` dice ok/fail**, non solo chiamate e dollari: «1.292 chiamate,
   1.290 fallite» invece di «$0,00».
3. **`leads/scan-inbox` ricorda il fallimento** (tentativi per email, poi
   parcheggio con avviso): una email non si ritenta per sempre.

È piccolo, è codice, ed è la precondizione di tutto il resto: senza, ogni
ottimizzazione si misura su numeri falsi.

---

## 5 · I lotti (ognuno con la sua misura e il suo ritorno indietro)

| Lotto | Cosa | Tipo | Misura | Indietro |
|---|---|---|---|---|
| **0** · oggi | Credito Anthropic; `/ai` di una giornata normale; la tua risposta su cosa leggi (§6) | nessun codice | — | — |
| **1** · config | `segretaria.prepare` e `segretaria.turn` → Sonnet 5 in `settings/ai`; ombra sul Mac per `leads.inbox`, `phone.analyze`, `banking.mail` | una scrittura + tap in `/ai` | spesa/giorno in `/ai`; approvazioni invariate | una scrittura |
| **2** · piccolo codice | §4 (interruttore, ok/fail, memoria del fallimento) + scrittura di `cloudModel` da Telegram | PR piccola, testata | zero tempeste; `/ai` onesto | revert |
| **3** · architettura | Preparazione su richiesta (§3.2) | PR media | chiamate/giorno ∝ casi aperti | kill switch in `settings/segretaria` |
| **4** · architettura | Un cervello (§3.1): prima risposta come modalità della preparazione; `agent.reply` delegato | PR media | nessuna bozza doppia per la stessa persona | vecchi scopi restano nel registro, spenti |
| **5** · promozione | Scopi in ombra ≥30 coppie e ≥90% d'accordo → locale | tap in `/ai` | ricadute < 10% | tap |

**Stima** (sulla base di ~$8/giorno, da verificare coi numeri di una
giornata normale): lotto 1 → ~$3,4/giorno (−57%); lotto 3 → dipende da
quanti casi apri davvero, plausibilmente $1–2/giorno; lotto 5 → pochi euro
al mese in più. Il risultato vero lo dice `/ai`, non questa tabella.

---

## 6 · Cosa NON facciamo

- **Un modello più grande sul Mac** (14b, visivo): 16 GB li divide già con
  Homie, wacli, lo Scout e il bot; il guadagno sta nelle voci piccole.
- **Fine-tuning, RAG, database vettoriali, nuovi agenti**: nessun processo
  oggi è limitato da questo.
- **Spostare le bozze ai clienti in locale**: qwen3:8b su cronologie da
  20.000 caratteri è il posto dove la qualità cala per prima, ed è quello
  che firma BOOM davanti al cliente.

---

## 7 · Le domande che decidono i lotti

1. **Credito Anthropic**: era finito? (Se sì: ricaricare è il lotto 0, e il
   §4 diventa prioritario.)
2. **Cosa leggi davvero**, ogni giorno / a volte / mai: le proposte in Oggi,
   le card dei lead su Telegram, il brief PFS del mattino, il Foglio di
   Chiamata delle 7:30, il digest di sera.
3. **Il Concierge inquilino in locale**: è una chat che i tuoi inquilini
   usano? Se sì, col Mac spento ricade sul cloud (va bene); se no, si spegne.

## 8 · Fuori da questo studio, da chiudere dopo

**Gli abbonamenti.** Visti nella casella di BOOM: ElevenLabs Creator ($22/mese,
il primo a $11), Wispr Flow (€15/mese), Telnyx (ricarica 19/09 — il codice
usa Twilio: possibile doppione), Google Workspace e Cloud, Idealista,
Immobiliare Pro. Mancano: abbonamento Claude, ChatGPT/Codex, Vercel, OpenAI,
Twilio, Anthropic API (fatture su un'altra casella). Serve l'elenco con gli
importi per la tabella completa.

**Il costo che non è AI.** Dal 31/08 circa 24 chiamate su 30 dal numero
Immobiliare (+39 331 3251 961) risultano «Non risposta». Deviare quel numero
sulla Receptionist quando occupato o senza risposta costa zero e recupera
contatti già pagati al portale.

---

## 9 · Il Mac mini: si può mettere un modello migliore? (aggiunto il 28/09 sera)

**Sì, e qwen3:8b è ormai il modello sbagliato.** È di aprile 2025; da allora
sono usciti modelli piccoli molto più forti. I limiti veri del Mac:
- **16 GB unificati → ~11 GB utilizzabili dalla GPU** (macOS ne concede circa
  il 70%); il resto lo dividono Homie, wacli, Scout, il bot e il sistema.
- **Contesto 16k** impostato dall'installer: la cache del contesto occupa
  memoria in più rispetto al file del modello.

| Candidato | Uscita | Memoria (Q4) | Velocità su M4 16 GB | Punti forti | Verdetto |
|---|---|---|---|---|---|
| qwen3:8b (attuale) | apr 2025 | ~5,2 GB | — | già installato | da sostituire |
| **qwen3.5:9b** | mar 2026 | ~7 GB | ~17–22 tok/s (Ollama), 25–35 (MLX) | ragionamento da modello 30B della generazione prima; **vede le immagini**; 201 lingue; Apache 2.0 | **candidato principale** |
| **gemma4:12b** | giu 2026 | ~8–9 GB | ~15–19 tok/s | un filo più forte nel ragionamento; ottimo sulle lingue europee; vede immagini | **sfidante**: più stretto in memoria |
| gemma4:26b (MoE) | apr 2026 | ~16 GB | — | forte | **no**: non entra con il resto acceso |
| qwen3.6-35B-A3B «su 16 GB» | 2026 | 9–13 GB a 2–4 bit + pagine dall'SSD | ~17 tok/s nelle demo | impressiona nelle demo | **no in produzione**: quantizzazione a 2 bit (qualità), esperti letti dal disco a ogni token, e sul Mac girano altri 10 servizi |

**Cosa cambia davvero con qwen3.5:9b.** Un solo modello per testo e
immagini: nel registro `local.visionModel` = lo stesso modello, niente
secondo modello in memoria. Diventano candidati all'ombra anche gli scopi
con immagini (`profile.ocr`, `photos.audit`, le foto dello Smistatore). I
PDF restano cloud: il ponte non li converte.

**Cosa NON cambia.** Anche il migliore a 9–12 miliardi di parametri non
sostituisce Sonnet/Opus sulle bozze ai clienti con 20.000 caratteri di
storia. Il confine del §3.3 resta: il Mac fa i lavori interni.

**Hardware più grande?** Un Mac con 48–64 GB farebbe girare i 26–35B veri
(non compressi a 2 bit). Si giustifica solo se il locale deve prendere le
bozze ai clienti, che oggi valgono ~$3/giorno dopo il lotto 1: il ritorno
non c'è. Da riconsiderare solo coi numeri dei lotti 3–5.

### Come si decide: una gara sui NOSTRI compiti, non sui benchmark

I numeri qui sopra vengono da prove di terzi (fonti in fondo). Per BOOM
contano quattro compiti, provati sul Mac vero con testi finti ma realistici:
1. lead estratto da un'email Immobiliare/Idealista (IT ed EN) → JSON;
2. riassunto e intento di una chiamata trascritta;
3. movimento bancario da un avviso email;
4. categoria e dati da una foto di documento d'identità.

Per ogni modello (qwen3:8b, qwen3.5:9b, gemma4:12b): JSON valido,
campi giusti contro la risposta attesa, secondi per risposta, memoria
occupata con tutti i servizi accesi (`ollama ps`, `memory_pressure`).
Vince il più preciso che resta sotto i 20 s di tetto del server. Poi
l'ombra in produzione (§5, lotto 5) conferma o smentisce.

Fonti: [Qwen3.5 small models — Artificial Analysis](https://artificialanalysis.ai/articles/qwen3-5-small-models) ·
[Qwen/Qwen3.5-9B — Hugging Face](https://huggingface.co/Qwen/Qwen3.5-9B) ·
[Gemma 4 — Google](https://blog.google/innovation-and-ai/technology/developers-tools/gemma-4/) ·
[Qwen 3.5 MLX su Apple Silicon](https://willitrunai.com/blog/qwen-3-5-mlx-apple-silicon-guide) ·
[LLM migliori per Mac mini M4 16 GB](https://modelfit.io/blog/best-llm-mac-mini-m4-16gb/) ·
[Gemma 4 12B vs Qwen 3.5 9B](https://www.betterclaw.io/blog/gemma-4-12b-vs-qwen-3-5-9b) ·
[35B su Mac mini 16 GB con mmap](https://modelfit.io/blog/run-35b-llm-mac-mini-m4-16gb-mmap/)
