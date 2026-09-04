# LO SCRIVANO — il prossimo capitolo

*Studio del 4 settembre 2026. Nasce da una frase dell'operatore mentre usava
l'Innesto: «renderlo realmente intelligente, facile e universale da usare
per me». Questo documento non propone un'AI migliore: propone di smettere di
avere cinque letture che non si parlano.*

---

## 1. Cosa c'è OGGI, misurato

BOOM legge documenti in **cinque posti diversi**. Non è una stima: è il
censimento dei file.

| Chi legge | Da dove entra | Cosa ne ricava | Cosa NON fa |
|---|---|---|---|
| `api/portal/ingest.js` — **l'Innesto** | solo il portale | 4 entità (proprietario, immobile, inquilino, contratto) | **non archivia il documento** |
| `api/documents/_smista.js` — **lo Smistatore** | Telegram, email | categoria + archiviazione in `documents` | **non estrae nessuna entità** |
| `api/documents/ocr.js` | portale, pagina Documenti | categoria + entità sciolte (date, importi, CF) | non crea né aggiorna niente |
| `api/profile/upload.js` | `/scheda`, lato cliente | anagrafica di UNA persona | solo quella persona |
| `api/contracts/inventario.js` | `/inventario` | elenco arredi | solo arredi |

Due di queste cinque fanno **metà lavoro ciascuna, sullo stesso documento**:

> Inoltri il contratto per email → viene **archiviato**, ma non nasce niente.
> Lo incolli nell'Innesto → **nasce il contratto**, ma il PDF sparisce.
>
> `innestoApply` non tocca la collection `documents`: zero riferimenti. Il
> file che hai appena letto era solo un trasporto, e viene cancellato.

Per avere entrambe le cose l'operatore deve fare **due volte la stessa
cosa**, o sceglierne una e perdere l'altra metà.

## 2. I tre soffitti

### Soffitto 1 — l'Innesto sa solo CREARE

In tutto `innestoApply` ci sono quattro `.add()` (le quattro entità) e due
`.update()`, entrambi di contabilità su record appena creati
(`paymentsGenerated`, `currentContractId`). **Nulla di ciò che esiste già
può essere modificato da un documento.**

Conseguenze concrete, tutte quotidiane:

- la carta d'identità di un inquilino **che hai già** → l'Innesto lo
  riconosce e poi non gli scrive niente: CF, scadenza documento, indirizzo
  restano vuoti come prima;
- l'email del proprietario con l'IBAN nuovo → non ha dove atterrare;
- «dal 1° gennaio il canone passa a 1.300» → non esiste il concetto di
  *modifica proposta*;
- una disdetta, una proroga, un subentro → non sono nello schema, quindi
  vengono letti e buttati.

### Soffitto 2 — una porta sola, e non è quella dove arrivano i documenti

L'Innesto vive **dentro il portale**. Ma un documento arriva su WhatsApp
mentre sei per strada, per email dal commercialista, come foto fatta al volo
sul pianerottolo. Lo Smistatore quelle porte le ha già (Telegram, email) —
ma è l'altra metà, quella che archivia e non crea.

### Soffitto 3 — lo schema è un contratto di locazione, e basta

Il prompt di `ingest.js` descrive un contratto d'affitto italiano, e le
quattro entità sono fisse. Lo Smistatore invece conosce **18 tipi** di
documento (F24, APE, visura, cedolare, ISTAT, bolletta, cessione
fabbricato…). Quella conoscenza esiste già nel repo e l'Innesto non la usa.

---

## 3. LA PROPOSTA — Lo Scrivano

**Un impiegato solo che legge quello che arriva, capisce cosa è, e lo scrive
dove va — tenendo il foglio.** Non un motore nuovo: l'unione dei due che ci
sono, più la cosa che manca a entrambi (saper aggiornare).

### Il principio che tiene tutto insieme

> **Il documento non è materia prima da buttare dopo l'estrazione:
> è la PROVA di ciò che è stato scritto.**

Da cui la regola d'oro dello Scrivano: **ogni scrittura porta con sé il
documento da cui viene**. Se il portale dice che il canone è 1.300, deve
poter mostrare la riga del foglio in cui c'è scritto.

### L'architettura, nella disciplina che il repo già usa

```
    QUALSIASI PORTA                    UN CERVELLO                UNA RESA
  ┌──────────────────┐          ┌──────────────────────┐    ┌──────────────┐
  │ portale (Innesto)│          │  1. CHE COSA È       │    │ PROPOSTA     │
  │ WhatsApp         │  ──────► │     (18 tipi noti)   │──► │ · entità     │
  │ email inoltrata  │          │  2. DI CHI PARLA     │    │ · MODIFICHE  │
  │ Telegram         │          │     (aggancio reale) │    │ · documento  │
  │ foto al volo     │          │  3. CHE COSA CAMBIA  │    │   archiviato │
  └──────────────────┘          └──────────────────────┘    └──────────────┘
                                                          nessuna scrittura
                                                          prima della conferma
```

- **`js/scrivano-engine.js`** — motore PURO (`window.BOOM_SCRIVANO`, UMD come
  `boom-geo`/`dispo-engine`): dal testo estratto decide *tipo → soggetto →
  differenze*. Nessun Firestore, nessuna rete: si testa in node, e le
  decisioni delicate si verificano per mutazione come già si fa per il
  Perito e il Radar.
- **`api/scrivano/leggi.js`** — la porta unica. Riusa `_modeljson.js` (la
  lettura del JSON del modello), `_budget.js` (il tetto sulla chiamata), la
  tabella `CATS` dello Smistatore e `findMatch` di `dataops-engine`. Poco
  codice nuovo: quasi tutto esiste già, sparso.
- **La resa è sempre una PROPOSTA.** La regola dell'Innesto non si tocca:
  *nessuna scrittura prima che l'operatore abbia visto.* Cambia solo la
  ricchezza della proposta — ora contiene anche *modifiche* a record
  esistenti, e ogni modifica mostra **prima → dopo** con la frase del
  documento che la giustifica.

### La cosa nuova: la MODIFICA proposta

È il pezzo che oggi non esiste e che sblocca il resto.

```
  Inquilino · Marta Neri                         (già in archivio)
  ┌──────────────────────────────────────────────────────────┐
  │ Codice fiscale   ―                → NREMRT99T41H501K   ✓ │
  │ Documento        ―                → CI AX1234567       ✓ │
  │ Scadenza doc.    ―                → 2031-04-18         ✓ │
  │ Indirizzo        Via Cavour 12    → Via Cavour 12/B    ⚠ │
  │                  «…residente in Via Cavour 12/B…»        │
  └──────────────────────────────────────────────────────────┘
     ✓ = riempie un buco    ⚠ = CAMBIA un valore esistente
```

Le tre regole che la rendono sicura, tutte già nel DNA del progetto:

1. **Riempire un buco ≠ cambiare un valore.** Un campo vuoto si riempie con
   una spunta; un campo pieno che cambia parte **deselezionato** e va
   confermato a mano. (È `mergeProposal`, portata dalla proposta al record.)
2. **Ogni modifica cita la fonte.** La frase del documento sta accanto al
   campo. Senza citazione, niente proposta di modifica.
3. **Un atto firmato non si riscrive.** La stessa guardia di
   `ensureContractPdf`: sotto una firma viva il documento è congelato.

---

## 4. Il piano, in quattro passi che valgono da soli

Ogni passo è utile il giorno in cui arriva, anche se i successivi non
arrivassero mai.

| # | Passo | Cosa cambia per te | Costo |
|---|---|---|---|
| **1** | **Il documento resta** | l'Innesto archivia il file che ha letto e lo attacca al contratto/immobile/persona: il fascicolo fiscale e la checklist del commercialista si spuntano da soli | ½ giorno |
| **2** | **Lo Scrivano capisce COSA è** | l'Innesto usa i 18 tipi dello Smistatore: un F24, un APE, una visura non finiscono più a forza nello schema del contratto | 1 giorno |
| **3** | **La modifica proposta** | la carta d'identità aggiorna l'inquilino che hai già; l'IBAN nuovo aggiorna il proprietario; il canone che cambia diventa una proposta con prima→dopo | 2 giorni |
| **4** | **La porta unica** | mandi qualsiasi cosa al bot Telegram (porta che esiste già) e ottieni **entrambe** le metà: archiviato *e* proposto, con la card di conferma sul telefono | 1 giorno |

**Prima il passo 1**: è mezza giornata, non rompe niente, e chiude subito il
buco più assurdo — un contratto creato da un PDF che poi non ha il PDF.

### Sull'iPhone, una nota onesta

Il gesto ideale sarebbe *Condividi → BOOM* dal foglio di condivisione di
iOS. Il Web Share Target non è supportato da Safari/iOS (**da riverificare
prima di prometterlo**): la porta universale su iPhone resta **l'inoltro al
bot Telegram**, che è già costruita e già autenticata. In alternativa un
Comando (app Scorciatoie) che POSTa sulla stessa porta — una configurazione
sola, una volta.

---

## 5. Le righe rosse

Sono le stesse che reggono il resto della piattaforma. Vanno scritte prima,
non scoperte dopo:

- **Nessuna scrittura senza conferma.** Vale anche per le modifiche, e a
  maggior ragione: un valore sovrascritto in silenzio non si vede.
- **Mai inventare.** Un campo vuoto è corretto; un campo inventato finisce
  in un contratto registrato. Se il documento non lo dice, resta vuoto — e
  la proposta *dichiara* cosa non ha trovato.
- **Una risposta troncata non si ripara mai** (`_modeljson.js`): un dato
  mezzo letto è peggio di uno mancante, perché non si vede.
- **Nei log va la forma, mai il contenuto.** Qui passano codici fiscali e
  IBAN di persone reali: ci sono già finiti una volta.
- **Un atto firmato è congelato.** Nessun documento successivo lo modifica.

---

## 6. Perché questo capitolo e non un altro

Il portale sa già fare quasi tutto: contratti, firme, incassi, fascicoli,
registrazione, vetrina, radar, agenti. Quello che ancora costa tempo ogni
giorno è **la trascrizione** — prendere quello che è arrivato su un canale e
riportarlo a mano dove serve.

Lo Scrivano non aggiunge una funzione: **toglie un lavoro**. Ed è l'unico
pezzo dove «intelligente» significa davvero qualcosa, perché la decisione
(che documento è, di chi parla, cosa cambia) è esattamente ciò che un
modello sa fare e un `if` no — mentre tutto ciò che è deterministico
(l'aggancio, la validazione, la scrittura) resta deterministico e testato,
com'è già oggi.
