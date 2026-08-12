# STUDIO — HOMIE GAME CHANGER · v1
### Formato: decisioni, non opzioni. Le risposte dell'operatore sono dentro.

*Agosto 2026. Domanda dell'operatore: "come può Homie diventare davvero game
changer, magari studiando i dati di questi mesi dal wacli?". Risposte
raccolte prima di scrivere: (1) sul Mac c'è **tutto lo storico** WhatsApp,
mesi di chat leggibili; (2) autonomia **sì, ma graduale e misurata**; (3) la
priorità fra i poteri **la decidono i dati, non il gusto**; (4) studio +
prima tappa costruita in questa sessione.*

---

## 1 · L'asset che nessun competitor ha

Homie non diventa game changer aggiungendo un modello più grosso — quel
percorso è già stato fatto al contrario (vedi `bot/HOMIE.md`: da 74k
token/giorno a quasi zero, il giudizio spostato sul server dove è batchato e
ha un tetto). Diventa game changer **riscuotendo un asset che esiste già e
che nessuno sta leggendo**:

| Pezzo | Dove vive | Cosa contiene |
|---|---|---|
| Le conversazioni COMPLETE | wacli sul Mac (mesi, anche pre-mirroring) | ogni parola scambiata con ogni cliente, con direzione e orario |
| Gli ESITI | Firestore (`leads`, `viewings`, `preAgreements`, `contracts`, `payments`) | chi ha prenotato una visita, chi ha accettato, chi ha FIRMATO, chi è sparito |
| Le APPROVAZIONI | `action_queue` (mesi di bozze proposte) | cosa l'operatore approva senza toccare, cosa modifica, cosa rifiuta |
| Il MERCATO | libro del Perito (`marketListings`, `marketStats`) | nascite, morti provate, assorbimento per zona, canoni FIRMATI nostri |

Uniti **per numero di telefono**, i primi due diventano ciò che in machine
learning si chiama un dataset etichettato: *conversazione → esito*. Casafari
non ce l'ha. I portali non ce l'hanno. Nessuna agenzia di Roma se l'è mai
costruito. È il vantaggio competitivo che si compra solo con mesi di lavoro
vero — e quei mesi sono già stati pagati.

La divisione dei ruoli NON cambia (è la regola che regge `bot/HOMIE.md`):
**Homie è l'unico con la sessione** (WhatsApp, browser autenticati), **il
server è l'unico col giudizio** (batchato, testato, con tetto di spesa).
Ogni potere nuovo rispetta questa riga.

---

## 2 · La decisione di metodo: si misura prima di scegliere

Alla domanda "quale potere costruiamo per primo?" l'operatore ha risposto:
*"dobbiamo studiare prima i dati per capire quali poteri scegliere"*. È la
risposta giusta ed è diventata l'architettura: la tappa 1 non è un potere,
è **LA MINIERA** — lo strumento che legge lo storico wacli, lo incrocia con
gli esiti e produce un **VERDETTO misurato** su quale potere vale di più,
con i numeri che lo giustificano.

Il verdetto è una **funzione esportata e testata** (`verdict()` in
`js/miniera-engine.js`), non un'opinione in chat: dati gli stessi numeri dà
sempre la stessa classifica, e la classifica arriva con il *perché* scritto
("N persone senza risposta", "rispondere entro 30' converte +X punti").
Sotto campione minimo **non esce un numero** — dice "campione insufficiente"
(la lezione D4 del Perito: una mediana su 3 annunci è un'opinione
travestita).

---

## 3 · I poteri candidati (ciò che il verdetto ordina)

| Potere | Cosa fa | Il numero della Miniera che lo giustifica |
|---|---|---|
| **Il Segugio dei silenzi** | Cliente la cui ultima parola è rimasta senza risposta → alert subito; nostra ultima parola + silenzio >48h su un intent aperto → follow-up contestuale proposto in `action_queue` | `silence.unanswered` + `silence.coldOpen` — quante persone stanno aspettando ADESSO e quanti thread caldi si sono raffreddati |
| **Le visite che si fissano da sole** | "posso vederlo giovedì?" → la bozza del Commerciale porta gli slot VERI di `/api/viewings/slots` (la griglia esiste già, con double-confirm) | `viewingIntentOpen` — thread con intenzione di visita che sono morti senza una visita |
| **La velocità che converte** | Risposta immediata alle categorie provate (vedi §4) | `latency` — la conversione per bucket di tempo-alla-prima-risposta, dai NOSTRI dati |
| **Il playbook (Commerciale 2.0)** | Le conversazioni d'oro (finite in firma) diventano esempi few-shot del Commerciale; le obiezioni ricorrenti diventano risposte pronte | `golden` (thread finiti in contratto) + `objections` (cosa uccide i deal) |
| **Il dossier per contatto** | La memoria per persona (budget, zone, date, promesse) dal Mac al server, iniettata in bozze, card Telegram, Inbox | `longThreads` — quante relazioni lunghe/ricorrenti esistono davvero |
| **Radar proprietari** | Privati fermi oltre l'assorbimento di zona → card "proponigli gestione BOOM" | **NON misurabile dalle chat** — si misura dal libro del Perito. Il verdetto lo dichiara invece di inventare un punteggio (onestà prima della completezza) |

---

## 4 · La scala della fiducia (autonomia: sì, graduale e misurata)

L'operatore ha detto sì all'auto-invio, con la testa. Le regole:

1. **Si misura prima di promuovere.** `approvalStats()` legge i mesi di
   `action_queue`: per ogni categoria di azione, quante proposte, quante
   approvate, quante rifiutate. La promozione si valuta sui numeri
   (obiettivo: ≥95% approvate su un campione vero), mai a sensazione.
2. **La promozione non è mai automatica.** Il sistema PROPONE la promozione
   con i numeri davanti; la decide l'operatore. Una manopola in
   `settings/squadra` (pattern già esistente), mai una costante nel codice.
3. **Auto-invio ≠ invio istantaneo.** Ritardo di grazia annullabile (il
   messaggio parte dopo N minuti, con un tap per fermarlo), kill switch
   globale, digest serale di tutto ciò che è partito da solo.
4. **Le sempre-escalation non si promuovono MAI**: rabbia, soldi, questioni
   legali, contatto sconosciuto al primo messaggio, qualunque cosa fuori
   dalla categoria provata → torna in approvazione.
5. **Inquilini e proprietari non sono lead**: mai marketing automatico a chi
   scrive per la caldaia (l'esclusione è già nel `_lead.js` e resta).

---

## 5 · Le decisioni

- **D1 — Mac = sessione, server = giudizio.** Invariata. Il Mac ESTRAE e
  spedisce righe; ogni decisione (join, statistica, verdetto) vive nel
  motore server-side, dove è testata. Il Mac non torna a "pensare".
- **D2 — Nel magazzino entrano FEATURE, mai l'archivio integrale.** Ogni
  thread diventa UNA riga: conteggi, tempi, direzione dell'ultima parola,
  campioni corti di testo (≤240 caratteri a campo, ≤1200 il campione
  cliente — quanto basta per lingua e obiezioni). Il testo pieno resta sul
  Mac e nel mirror live già esistente (`conversations`). I gruppi WhatsApp
  non entrano proprio.
- **D3 — Il join è per telefono in TUTTE le forme.** `phoneVariants` — la
  lezione già pagata (internazionale vs nazionale sdoppiava le persone). La
  copia nel motore è tenuta uguale a `api/homie/_lead.js` da un test di
  parità (pattern `tests/bonifico/parity.mjs`).
- **D4 — Sotto campione non si pubblica un numero.** `minSample` sul totale
  e sui singoli bucket; "campione insufficiente" è una risposta legittima,
  un 3% calcolato su 7 thread no.
- **D5 — GDPR per costruzione.** Gruppi scartati alla porta; inquilini,
  proprietari e clienti PFS mai nelle liste di re-ingaggio; lead morti e
  contratti firmati mai ricontattati; `memory.sh forget` resta la
  cancellazione per contatto; la D5 del Perito (niente rubrica di privati)
  resta intatta.
- **D6 — Il verdetto è una funzione.** Esportata, deterministica, con i
  motivi dentro. I test la verificano per mutazione (un campione piccolo
  che pubblicasse percentuali fa fallire la suite).
- **D7 — Idempotenza ovunque.** Riga = `minieraThreads/<sha1(chatId)>`,
  hash di contenuto `msgCount:lastTs`: ri-sincronizzare tutto lo storico è
  un no-op, lo studio è rigenerabile a piacere.
- **D8 — Un sync che muore non tace.** Heartbeat `pfsRadarHealth/miniera`
  → l'allerta Telegram esistente (3 run falliti) copre anche la Miniera
  senza codice nuovo (stesso pattern di perito-eyes / homie-eyes).

---

## 6 · Costruito in questa sessione (tappa 1 — La Miniera)

- **`js/miniera-engine.js`** — il motore puro (UMD, `BOOM_MINIERA`):
  normalizzazione righe, indice esiti per telefono, join, funnel, bucket di
  latenza, lingua/orari, obiezioni, libro dei silenzi (unanswered +
  coldOpen con tutti i veti), thread d'oro, `approvalStats`, `verdict`.
- **`api/homie/miniera.js`** — la porta (auth `X-Homie-Secret`):
  `GET` → stato sync + mappa `id→hash` per il sync incrementale;
  `POST {op:'threads', rows}` → upsert idempotente in `minieraThreads`;
  `POST {op:'study'}` → legge esiti reali da Firestore, esegue motore,
  scrive il rapporto in `teamReports/miniera-<data>` + heartbeat, recap
  Telegram col podio del verdetto.
- **`homie-bridge/agent-os/bin/miniera.sh` + `miniera_extract.py`** — il
  lato Mac: estrae TUTTO lo storico wacli (tollerante alle varianti di
  campo, come `wacli.sh`), riduce a righe per-thread, salta gli invariati
  (hash), POSTa a lotti, chiede lo studio.
- **`firestore.rules`** — `minieraThreads` admin-only (la lezione
  propertyLocks: senza la riga, default-deny e il magazzino non esiste).
- **`tests/miniera/run.mjs`** — parità telefoni, veti del libro dei
  silenzi, onestà del campione (per mutazione), verdetto motivato,
  handler vero su Firestore in memoria (idempotenza, auth, studio E2E).

**Per lanciarla sul Mac** (una volta, poi ogni volta che vuoi aggiornare):

```bash
cd ~/Boum-roma && git pull origin main
bash ~/Boum-roma/homie-bridge/agent-os/bin/miniera.sh        # sync + studio
bash ~/Boum-roma/homie-bridge/agent-os/bin/miniera.sh --dry  # solo conta, non manda
```

Il rapporto arriva su Telegram (podio dei poteri + i numeri); il dettaglio
completo sta in `teamReports/miniera-<data>` e si rilegge dal portal.

---

## 7 · La sequenza dopo il verdetto

1. **Tappa 2 = il potere che vince il verdetto**, costruito nello stile
   della casa (motore puro + test + approvazione dove serve).
2. **Tappa 3 = la scala della fiducia** sulle categorie che i numeri di
   `approvalStats` dichiarano mature (§4).
3. **Orizzonte** (non ora, ma il binario è pronto): Sofia voce (già nel
   SOUL come Tier-2), il centro messaggi dei portali (già nel mandato), il
   dossier iniettato in ogni superficie.

---

## 8 · Cosa NON si fa

- Niente auto-invio prima delle misure — nessuna categoria nasce promossa.
- Niente archivio integrale delle chat nel magazzino server (D2).
- Niente contatto automatico ai privati dei portali — la D5 del Perito non
  si tocca; il radar proprietari, se il Perito lo giustificherà, produce
  CARD per l'operatore, mai messaggi.
- Il Mac non torna a pensare: niente modelli per messaggio sul Mini — quel
  costo è stato ucciso apposta (`bot/HOMIE.md`) e resta morto.
