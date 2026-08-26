# La fatturazione — dove sta il documento, e chi lo consegna

> Stato: **motore costruito e testato. Trasporto non deciso.**
> Aggiornato: 2026-08-26.

## 1 · Perché non si automatizza il gestionale

La richiesta iniziale era: *entrare nel TIC (Tieni Il Conto, Zucchetti) e
compilare le fatture da lì.* Non si fa, e non per scrupolo formale:

- Un login al gestionale fiscale è accesso all'intera posizione fiscale
  del gruppo, non a uno strumento. Non è una credenziale che si deposita
  in un container effimero.
- Un'automazione che clicca dentro un'interfaccia che **emette documenti
  fiscali verso lo SdI** ha un modo di fallire senza rimedio: la fattura
  parte, è numerata, è trasmessa. L'unica correzione è una nota di
  credito, che resta a registro per sempre.
- 2FA e captcha ci sono apposta. Aggirarli sarebbe la parte facile e la
  scelta sbagliata.

## 2 · Dove sta davvero il documento

Il TIC non *è* la fattura: è un produttore e trasmettitore di un file
standard, **l'XML FatturaPA**. Quel file è il documento fiscale. Quindi
la domanda utile non è *"come faccio cliccare qualcuno dentro il TIC"*
ma **"chi genera l'XML"** — e quello lo genera BOOM, in modo
deterministico, dai dati che ha già.

Da qui la separazione che regge tutto il progetto:

```
        dati (contratti, incassi, prestazioni)
                        │
                ┌───────▼────────┐
                │ fattura-engine │   ← il documento. Uno solo.
                └───────┬────────┘
                        │  XML FatturaPA
        ┌───────────────┼───────────────┐
        ▼               ▼               ▼
   import TIC      PEC → SdI       API provider
    (porta A)      (porta B)        (porta C)
```

**L'XML è identico nelle tre porte.** La porta è un adattatore sul
trasporto, non una variante del documento — per questo si è potuto
costruire il motore mentre la scelta della porta resta aperta.

### Le tre porte, a confronto

| | Come funziona | Costo | Cosa serve | Attrito |
|---|---|---|---|---|
| **A — import nel TIC** | BOOM genera l'XML, si carica nel gestionale, il TIC trasmette | zero | niente | nessuna credenziale, il commercialista non cambia abitudini |
| **B — PEC → SdI** | l'XML parte dalla PEC verso `sdi01@pec.fatturapa.it` | zero | la PEC (c'è) + il primo accreditamento | il TIC diventa archivio, non più emittente |
| **C — API provider** | Fatture in Cloud / Aruba / Openapi: BOOM emette e trasmette | ~€4-8/mese | contratto provider | pieno automatismo, ma il registro si sposta fuori dal TIC |

**Raccomandata: A come v1.** È l'unica che dà l'automazione senza
spostare il registro fiscale da dove il commercialista lo guarda — la
stessa regola già scritta in `STUDIO_BOOM_AUTONOMA.md` (D10: *«niente
commercialista sostituito — gli si consegna un fascicolo perfetto»*).
C si aggancia dopo, se serve: il motore XML non cambia.

## 3 · Due emittenti, due forme di documento

Il gruppo fattura da due soggetti con aritmetiche diverse. Il motore le
tratta come due forme dello stesso documento, non come due programmi.

### `provvigione` → TD01 · Egidi Immobiliare S.r.l.

Provvigioni di intermediazione e servizi BOOM. IVA 22%, nessuna cassa,
**nessuna ritenuta** (una S.r.l. non la subisce).

```
imponibile          1.500,00
IVA 22%               330,00
─────────────────────────────
TOTALE              1.830,00
```

### `parcella` → TD06 · studio legale

```
onorari                              2.000,00
spese generali 15%  (DM 55/2014)       300,00
─────────────────────────────────────────────
base CPA                             2.300,00
CPA 4%  (TC01, L. 576/1980)             92,00   ← IMPONIBILE IVA
─────────────────────────────────────────────
imponibile IVA                       2.392,00
IVA 22%                                526,24
spese anticipate art. 15               145,00   ← fuori IVA, natura N1
─────────────────────────────────────────────
TOTALE DOCUMENTO                     3.063,24
ritenuta 20% su 2.300,00              -460,00   ← NON su 2.392,00
─────────────────────────────────────────────
NETTO A PAGARE                       2.603,24
```

Le tre righe dove si sbaglia, e che il motore tiene ferme:

1. **La rivalsa CPA è imponibile IVA ma non subisce la ritenuta.**
   Calcolare il 20% sull'imponibile pieno dà 478,40 invece di 460,00:
   **18,40 € trattenuti in più a ogni parcella**, su un file che lo SdI
   accetta senza fiatare perché è formalmente valido. Nessun controllo
   automatico lo segnala mai.
2. **Le spese anticipate ex art. 15 non sono compenso.** Escono a natura
   N1, fuori IVA e fuori dalla base della ritenuta. Trattarle come
   compenso significa addebitare IVA su un anticipo.
3. **`<Ritenuta>SI</Ritenuta>` non va dentro `DatiCassaPrevidenziale`.**
   Lì dentro significherebbe *"la rivalsa CPA subisce la ritenuta"*: per
   la Cassa Forense non è così, quindi l'elemento si omette.

## 4 · Le due regole dure del motore

**(a) Tutta l'aritmetica gira in centesimi interi.** Un centesimo di
scarto fra `DatiRiepilogo` e `ImportoTotaleDocumento` fa **scartare** il
file (controlli SdI 00419/00422/00423), e lo scarto arriva ore dopo, per
email, senza dire quale riga. I float non entrano nel motore: si
convertono alla porta e si formattano all'uscita.

**(b) Il motore non inventa mai un dato fiscale.** P.IVA che non passa il
checksum, cliente senza né P.IVA né CF, aliquota 0% senza codice Natura,
`0000000` senza PEC → `ok:false` con l'elenco dei motivi, e **nessun XML
esce**. Un XML formalmente valido con dentro una P.IVA sbagliata è il
difetto peggiore possibile: viene accettato dallo SdI, recapitato al
soggetto sbagliato, e *sembra riuscito*.

Codice fiscale e IBAN non si rivalidano: si delega a
`js/dataops-engine.js`, che li valida già per l'Innesto (omocodia
compresa). Una seconda copia divergerebbe, e il giorno che diverge lo
stesso CF viene accettato da una porta e rifiutato dall'altra.

## 5 · Come si usa

```js
const F = require('./js/fattura-engine.js');   // o window.BOOM_FATTURA

const { ok, errors, xml, filename } = F.emit(
  { kind: 'parcella',
    righe: [
      { descrizione: 'Assistenza giudiziale — primo grado', imponibile: 2000 },
      { descrizione: 'Contributo unificato anticipato', imponibile: 145, art15: true }
    ] },
  STUDIO,          // emittente
  CLIENTE,         // cessionario/committente
  { numero: 'PA-2026-0001', data: '2026-08-26',
    pagamento: { iban: '…', scadenza: '2026-09-25' } }
);
```

Manopole per il singolo incarico: `speseGenerali: false | <percentuale>`,
`cassa: false`, `ritenuta: false`, `bollo: true|false`, e `cfg` per
aliquote diverse dai default (`DEFAULTS`).

Test: `node tests/fattura/run.mjs` — **93 check**, con le tre regole
verificate *per mutazione* (rotta la regola, la suite deve accorgersene:
la ritenuta sulla cassa fa cadere 6 check, la cassa fuori dal riepilogo
8, l'art. 15 imponibile 8).

## 6 · Cosa manca ancora

| # | Cosa | Blocco |
|---|---|---|
| 1 | **Scelta della porta** (A/B/C) | decisione dell'operatore |
| 2 | Endpoint `api/accounting/fattura.js`: da un doc `invoices` → XML scaricabile | libero, dipende solo da 3 |
| 3 | **`invoices` non ha l'IVA**: `amount` è un intero piatto, senza imponibile/aliquota/natura | va esteso lo schema |
| 4 | **Fatture e ricevute condividono la serie `BOOM-YYYY-NNNN`** | vanno separate (vedi sotto) |
| 5 | Riconciliazione estratto conto → emissione | serve l'estratto conto in CSV |
| 6 | Anagrafica emittente studio legale (albo, n° iscrizione, data) | dato da raccogliere |

### Il punto 4, spiegato

`autoInvoiceForPayment()` in `js/portal-app.js` scrive *"Ricevuta canone
di locazione"* dentro `invoices` con un numero `BOOM-…`. Ma un canone
incassato per conto di un proprietario privato **non è una fattura
elettronica**: è una ricevuta, con marca da bollo €2 sopra €77,47. Farla
vivere nella stessa serie numerica delle fatture Egidi è la prima cosa
che un controllo contesta. Servono serie separate per tipo documento —
il motore già le distingue, il portale no.

## 7 · Da confermare col commercialista

Prima di emettere qualunque cosa in produzione:

1. **Il bollo si riaddebita al cliente?** Oggi il motore lo *dichiara*
   in `DatiBollo` senza sommarlo al totale (bollo assolto dal
   prestatore). Se va riaddebitato serve una riga in più, esclusa art. 15.
2. **`ImportoTotaleDocumento`: lordo o al netto della ritenuta?** Il
   motore usa il **lordo** e mette il netto in `ImportoPagamento`. Lo SdI
   accetta entrambe le convenzioni; va allineata a quella che il
   commercialista già usa, o la quadratura con la prima nota salta.
3. **Spese generali 15% sempre, o solo sul giudiziale?** Oggi default
   15% sulla parcella, disattivabile per incarico.
4. **`TipoRitenuta`**: RT01 (persona fisica) è il default. Se lo studio
   fattura come associazione professionale è RT02.
5. **`RegimeFiscale`**: assunto RF01 (ordinario) per entrambi i
   soggetti, come da risposta dell'operatore.
