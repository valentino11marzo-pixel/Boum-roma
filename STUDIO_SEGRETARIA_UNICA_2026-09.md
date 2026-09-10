# STUDIO — LA SEGRETARIA, UNA SOLA · settembre 2026
### Ristudiata dall'inizio, sopra ciò che esiste. Formato: decisioni, non opzioni.

*10 settembre 2026. La missione originaria dell'operatore, nelle sue parole:
«una segretaria vera e propria che possa leggere, scrivere e conoscere tutto
di BOOM, che rispetti molto il mio stile, sia realmente utile, e sappia
mandare a me in modo umano i clienti quando c'è bisogno di un'escalation».
Questo documento è la SPECIFICA che leggono Claude, Codex e ChatGPT. Se un
altro documento la contraddice, vince questo.*

---

## 0 · Perché ristudiare: la segretaria è stata costruita in otto pezzi

Negli ultimi due mesi la segretaria è nata a pezzi, ognuno col suo nome:
la Receptionist al telefono, la Segretaria su WhatsApp, il Commerciale per
la prima risposta, il Gestore per i solleciti, lo Smistatore per i
documenti, il Regista per la giornata, la scala della fiducia per
l'autonomia, il Postino per la consegna. Ogni pezzo funziona ed è testato.
Ma **non sono una segretaria**: hanno quattro prompt diversi, tre formati
diversi di card quando ti passano un cliente, nessuna memoria unica della
persona, e ognuno decide da solo cosa può fare. Il caos percepito è questo:
otto dipendenti part-time al posto di una persona.

La decisione di questo studio: **non si riscrive niente di ciò che regge**
(rotaie, veti, idempotenza, 107 suite di test — è il capitale). Si
costruisce sopra UNO strato di unificazione: una identità, una memoria, una
voce, una politica, un passaggio di testimone. È l'«identità globale» che
l'operatore chiedeva, resa concreta.

## 1 · La definizione (il contratto)

> **La Segretaria è una sola, su tutti i canali** — WhatsApp, email,
> telefono, Telegram. **Conosce** ogni persona e ogni casa di BOOM leggendo
> Firestore, mai una memoria propria. **Parla** con la voce misurata di
> Valentino. **Fa da sola** ciò che è provato dai numeri, **propone** ciò
> che non lo è, e **passa a Valentino in modo umano** — dicendo al cliente
> quando lo sentirà, sulla base della sua agenda vera — tutto ciò che
> tocca soldi, legge, rabbia, inquilini e proprietari. **Legge** ciò che
> arriva (documenti, email, messaggi) e lo trasforma in proposte da
> confermare, mai in scritture silenziose.

## 2 · Cosa esiste già, riletto come UNA segretaria

| Capacità | Oggi | Dove | Cosa manca |
|---|---|---|---|
| **Ascoltare** (telefono) | Receptionist ElevenLabs: bilingue, catalogo e slot veri in chiamata, risponde da sola agli sconosciuti | `api/phone/*`, `bot/RECEPTIONIST.md` | il prompt è scritto a mano, non deriva dalla voce e dalle regole condivise |
| **Conversare** (WhatsApp, email) | turno con fatti veri, tetti, escalation, kill switch; email solo per chat consegnate | `api/segretaria/_core.js` (`segretariaTurn`, `escalateSegretaria`), `scan-replies.js` | parte SOLO dopo il tuo tap 🤖 |
| **Aprire** | `segretariaOpen` risponde alla richiesta originale; il Commerciale propone la prima risposta | `_core.js`, `api/employees/commerciale.js` | due bocche per la stessa prima frase |
| **Leggere** | Smistatore (Telegram, email fidata) archivia per tipo; Innesto crea da un PDF ma non archivia | `api/documents/_smista.js`, `api/portal/ingest.js` | il giunto = lo Scrivano; WhatsApp salva gli allegati e non li legge; l'email di un proprietario non entra |
| **Ricordare** | lead, conversazioni, chiamate, visite, contratti: cinque collezioni | `leads`, `conversations`, `phoneCalls`, `viewings`, `contracts` | nessun fascicolo unico della persona |
| **Sapere** | catalogo con corsie, servizi e prezzi, slot, agenda Google | `dispo-engine`, `_catalog.js`, `viewings/_avail.js`, `_busyics.js` | i fatti si raccolgono in tre posti diversi |
| **Parlare come te** | 30 risposte misurate su 29.255 tuoi messaggi | `js/whatsapp-replies.js` | i prompt di telefono, WhatsApp ed email non ne derivano |
| **Decidere** | cancelli della Segretaria + scala della fiducia | `js/segretaria-engine.js`, `js/fiducia-engine.js` | il telefono e il Commerciale hanno regole proprie |
| **Passare a te** | card 🖐 (WhatsApp), card 📞 (telefono), card lead (notify-pending) | `api/telegram/*` | tre forme diverse, nessuna dice al cliente QUANDO lo sentirà |
| **Riferirti** | foglio di chiamata 07:30 | `api/regista/_brief.js` | non racconta le chat gestite di notte |

## 3 · L'architettura: cinque strati, una copia ciascuno

### 3.1 La memoria della persona — `api/segretaria/_persona.js`
`personaDossier({ phone, email })` → chi è (lead / inquilino / proprietario
/ cliente PFS / sconosciuto), cosa ha chiesto e su quali canali, quali
visite e contratti, **cosa le abbiamo già promesso** (gli ultimi turni
nostri). DERIVATO da Firestore a ogni turno, mai salvato altrove (regola 6).
Riusa `phoneVariants` e `resolveCaller`. È la stessa memoria per WhatsApp,
email, telefono (post-chiamata) e per la card che ti arriva.

### 3.2 La conoscenza — `api/segretaria/_facts.js`
Una funzione `facts(ctx)` che oggi vive dentro `segretariaTurn`: catalogo
con le corsie di `dispo-engine`, servizi e prezzi da `_catalog`, slot da
`_avail`, **e la tua agenda** (`busyBlocks`: sei in visita? fino a che ora?).
Servita a WhatsApp ed email direttamente, e al telefono attraverso
`agent-tools` — lo stesso oggetto, mai due letture.

### 3.3 La voce — `js/voce-engine.js` (UMD, puro)
Le regole misurate sulla tua voce, in un posto solo: frasi corte (sotto i
400 caratteri, mediana 262), un link solo se vale il tap, la proposta di
chiamata nelle aperture, prima persona singolare nell'upsell, «noi di BOOM»
quando parla la Segretaria, e **la frase del passaggio**: *«ti passo
Valentino: è in visita fino alle 16, ti scrive lui dopo»*. Esempi presi da
`whatsapp-replies.js`. Un solo costruttore di prompt la rende per WhatsApp,
email e telefono (il system prompt della Receptionist si GENERA da qui, non
si scrive più a mano nel mandato).

### 3.4 La politica — `policy.decide()` in `js/segretaria-engine.js`
Un solo verdetto per qualsiasi canale: `reply` (fa da sola) · `propose`
(card a te) · `escalate` (passaggio di testimone) · `silence`. Ingressi:
canale, ruolo della persona (dal fascicolo), intento, testo, e i numeri
della scala della fiducia. I cancelli attuali della Segretaria e la scala
della fiducia si fondono qui; il Commerciale e il telefono smettono di
avere regole proprie. Testato per mutazione, come oggi.

### 3.5 Il passaggio di testimone — `api/telegram/_handoff.js`
UNA card, qualunque sia il canale: chi (una riga dal fascicolo), dove, cosa
vuole (una riga), **cosa gli ha già promesso**, la risposta suggerita nella
tua voce, tre tasti: ✅ manda così · ✍️ rispondo io · ⏰ stasera. Il cliente
sente sempre la stessa frase, con un orario VERO letto dall'agenda. E la
notte diventa mattina: ogni conversazione gestita dopo le 19 finisce nel
foglio di chiamata delle 07:30 («stanotte la Segretaria ha…», con ciò che
resta aperto).

## 4 · La decisione che cambia tutto: il primo contatto

Oggi su WhatsApp la Segretaria parte SOLO dopo il tuo tap. Al telefono la
Receptionist risponde da sola a chiunque, senza approvazione, da agosto: il
precedente esiste già in casa. La proposta: `settings/segretaria.firstContact
= 'tap' | 'auto'`, **default `tap`** (il deploy non cambia niente). Con
`auto`, uno sconosciuto che scrive su WhatsApp o email riceve la prima
risposta entro due minuti sotto la STESSA politica di §3.4: solo fatti,
slot veri, il nome, mai un prezzo negoziato, mai inquilini e proprietari,
parole sensibili → passaggio a te. La scala della fiducia la giudica come
tutti: categoria `segretaria:first`, dove ogni tua correzione o presa in
carico conta come rifiuto. **Decidi tu quando accenderla, coi numeri
davanti**, dopo una settimana di card.

## 5 · I lotti: chi fa cosa, su quali file

| Lotto | Chi | Cosa | File posseduti | Fatto quando |
|---|---|---|---|---|
| **0** | Valentino, questa settimana | le leve già costruite: numero alla Receptionist, webhook `www` + secret, `/fiducia`, 🤖 sulle card | — | i quattro click |
| **1 · il cuore** | Claude, ramo `claude/segretaria-unica` | `_persona`, `_facts`, `voce-engine`, `policy.decide`, `_handoff`, la notte nel foglio, prompt Receptionist generato; test per mutazione | `api/segretaria/*`, `api/telegram/_handoff.js`, `api/regista/_brief.js`, `js/voce-engine.js`, `js/segretaria-engine.js`, `js/fiducia-engine.js`, `api/phone/agent-tools.js`, `bot/RECEPTIONIST.md` | `npm test` verde, card unica in produzione |
| **2 · le porte** | Codex, ramo `codex/porte-segretaria` | allegati WhatsApp → Smistatore; email per RELAZIONE (mittente noto in archivio) → archiviata sotto il suo immobile; test; righe in CLAUDE.md | `api/homie/message.js` (solo il ramo allegati), `api/documents/scan-inbox.js`, `tests/whatsapp/run.mjs`, `tests/documents/porte.mjs`, `tests/run-all.mjs` | PR verso main con `npm test -- whatsapp porte` verde |
| **3 · l'interruttore** | Valentino | `firstContact = auto`, coi numeri di una settimana | `settings/segretaria` | una decisione |
| **4 · leggere** | Claude | lo Scrivano passi 1-2 come capacità della Segretaria (il documento resta e si lega al record; il tipo) | `api/portal/ingest.js`, `js/portal-app.js` (innesto), `api/documents/_smista.js` | test + misura di §7 |
| **revisione** | ChatGPT | rilegge QUESTO studio col formato fisso di `docs/PROMPT_GPT_INTEGRAZIONE.md` §6 | — | obiezioni scritte prima del lotto 1 |

I lotti 1 e 2 non condividono un file: possono correre insieme. Un
conflitto è un errore di perimetro, non di merge. Il prompt d'apertura di
Codex è in `docs/PROMPT_CODEX_PORTE.md`; le regole che Codex legge da solo
in `AGENTS.md`.

**Il primo conflitto di perimetro, e come si è chiuso (10/09).** Codex si è
fermato (PR #234, come prescritto) perché `_smista.js` è del Lotto 4 ma
senza un id deterministico e un vincolo sul match le porte non potevano
garantire i due «mai». Aveva ragione. La soluzione non è spostare il file:
il proprietario del file (Lotto 4) ha esteso l'INTERFACCIA — `docId`
controllato prima di spendere, `relation` applicata prima di scrivere — con
la sua suite (`tests/documents/smista.mjs`). Regola generale che ne esce:
**quando un lotto ha bisogno di un file altrui, chiede un'interfaccia nella
PR, e il proprietario la costruisce e la testa**. Le porte restano di Codex,
che riprende unendo il ramo `claude/workload-gpt-integration-yvewv1` nel
suo (o main, dopo il merge) e chiamando la firma nuova.

## 6 · Le righe rosse

- **Mai una seconda memoria**: il fascicolo si deriva, non si salva. Il
  giorno in cui la Segretaria «ricorda» qualcosa che Firestore non sa, ci
  sono due verità.
- **Mai un prezzo, mai una trattativa, mai un consiglio legale o fiscale.**
- **Mai fingere di essere umana**: la disclosure resta in ogni canale. Ma
  il cliente non sente mai «un'AI non può»: sente «ti passo Valentino» con
  un orario vero.
- **Mai scrivere dati senza una proposta confermata** (lo Scrivano); mai
  un invio fuori dalle rotaie (`action_queue` → executor → outbox).
- **Mai una seconda casella di decisioni**: le card arrivano su Telegram e
  persistono nella coda Oggi. Una sola.
- **Mai un'autonomia non misurata**: la scala della fiducia giudica anche
  lei, categoria per categoria.
- **Le sue ore non sono le tue**: lei lavora 24/7, tu dalle 9 alle 18.
  Fuori orario risponde, tiene, e ti consegna la mattina.

## 7 · La misura (30 giorni, tutta derivata dai dati)

1. **Latenza della prima risposta** ai nuovi lead (mediana, dai timestamp).
2. **Ultime parole senza risposta** (la Miniera, settimanale): il numero da
   far scendere dai 544.
3. **Conversazioni chiuse senza di te** (visita prenotata o passaggio
   pulito) e **tasso di presa in carico** sulle sue risposte (le tue
   correzioni): se sale, la voce o la politica sono sbagliate.
4. **Dalla card alla tua risposta**: quanto aspetta un cliente passato a te.
Nessun cronometro. Se un numero non si può derivare, non è un criterio.
