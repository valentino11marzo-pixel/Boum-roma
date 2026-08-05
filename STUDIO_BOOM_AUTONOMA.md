# STUDIO — BOOM AUTONOMA
### La Squadra 2.0: le sole assunzioni che contano, e come diventare ordinati davvero

*Agosto 2026. Scritto sul codice, non sulle intenzioni: ogni "esiste già" è stato
verificato nel repo, ogni "manca" pure.*

---

## 0 · Il metodo: cosa rende giusta un'assunzione

Oggi la squadra conta **19 agenti su 23 cron**. Non serve assumerne altri venti:
serve un filtro. Un'assunzione è giusta solo se passa quattro porte:

1. **Tocca soldi o ore vere.** Se non si misura in euro incassati o ore tue
   restituite, è un giocattolo.
2. **Lavora su dati già in casa.** Niente servizi nuovi da mantenere, niente
   credenziali nuove da custodire. La nostra infrastruttura — Vercel, Firebase,
   IMAP, Telegram, Stripe, Claude — basta per tutto ciò che segue.
3. **Decide da sola o propone** — mai una via di mezzo ambigua. La lettera di
   assunzione (solo / porta / mai) esiste già nel registro: ogni assunto nuovo
   nasce con la sua, e il test anti-deriva lo costringe a dichiararsi.
4. **È testabile senza browser e senza Firestore.** Motore puro + test per
   mutazione: la disciplina che ha già pagato (canone-engine, dataops, avail).

Con questo filtro, le assunzioni che contano sono **tre**. Poi due idee che
sembrano lusso e non lo sono, e una lista onesta di cose da NON fare.

---

## 1 · IL PERITO — il nostro Casafari, ma col dato che Casafari non ha

**Il problema.** Ogni decisione di prezzo — quanto chiedere per un annuncio,
quanto accettare in una proposta, quanto promettere a un proprietario nuovo —
oggi si prende a memoria. Casafari e simili vendono comps a piattaforma: dati
larghi, generici, cari, e SENZA la cosa che conta: i canoni *veri* firmati.

**Il segreto: il magazzino esiste già.** Verificato in `api/pfs/_ingest.js`:
il radar archivia **ogni annuncio che vede** in `pfsProperties` — prezzo, zona,
mq, camere, arredo, inserzionista (privato/agenzia), date — anche quelli di
agenzia, «stored for analytics». *Analytics che non sono mai state scritte.*
Stiamo già pagando la raccolta e buttando il raccolto.

**Cosa si costruisce** (`js/market-engine.js`, puro, + sezione nel portal):

| Prodotto | Cosa fa | Da dove viene il dato |
|---|---|---|
| **Comps card** | Su ogni immobile/PA: "3 comparabili entro 500m, €/mq di zona, il tuo prezzo è al 78° percentile" | `pfsProperties` + zone di `PRE_ZONES` |
| **Il vero €/mq** | Mediana per zona dai canoni FIRMATI nostri, affiancata a quella dei portali (chiesto vs ottenuto) | `contracts` — il dato che nessun competitor ha |
| **Giorni-a-sparire** | Un annuncio che esce dal radar è (proxy) affittato: tempo di assorbimento per zona e fascia prezzo | firstSeen/lastSeen già scritti |
| **Price-drop radar** | Ribassi dei competitor in zona → occasioni PFS e argomenti di trattativa | diff sui re-ingest (dedupe già per URL) |
| **Verdetto prezzo alla creazione** | Quando pubblichi o scrivi una PA: fascia di mercato + verdetto concordato (canone-engine) in un colpo solo | market-engine + `js/canone-engine.js` |

**Cosa manca perché funzioni**: oggi il radar guarda solo le ricerche dei
clienti PFS. Si aggiungono a `radarSearches` ricerche **di copertura** per le
zone dove operiamo (stesso meccanismo, flag `market:true`, nessun cliente
attaccato). La fonte email-alert regge il carico — è già la fonte portante — e
gli occhi di Homie fanno il resto.

**Onestà sui limiti**: "sparito dal portale" ≠ sempre "affittato" (può essere
ritirato). Si dichiara come proxy, mai come verità. E il GDPR: in
`marketListings` si tengono i FATTI dell'annuncio, non i contatti del privato
(quelli restano solo nel flusso PFS che li usa per il mandato del cliente).

**Effort**: 2–3 sessioni. Motore + test prima, sezione poi. Zero servizi nuovi.

---

## 2 · IL RAGIONIERE — fattura elettronica vera, Sella in casa, e il commercialista che riceve un fascicolo invece di domande

Questa è l'assunzione più seria dello studio, e parte da una verifica onesta.

**2a. La fattura oggi, e il buco.** Il portal genera fatture (`invoices`,
`nextInvoiceNumber()`, auto-fattura sul canone pagato, PDF con i dati di
`settings/company`, link di pagamento Stripe). Ma nel codice **non esiste da
nessuna parte** FatturaPA, XML o SDI. In Italia la fattura B2B/B2C passa dallo
SDI come XML — per legge, dal 2019 (2024 anche per i forfettari). Quindi o
gli XML nascono oggi in uno strumento esterno (Fatture in Cloud, il gestionale
del commercialista) e i nostri PDF sono copie interne — **oppure c'è un buco di
conformità da chiudere subito**. Prima domanda per te, sotto.

**2b. La fattura di BOOM come dev'essere.** Due facce, un solo motore:

- **`js/invoice-engine.js`** (puro, testato per mutazione): numerazione
  progressiva per anno senza buchi, IVA per regime, bollo €2 dove va, natura
  operazione, e la **generazione dell'XML FatturaPA 1.2** — che è un formato
  deterministico: perfetto per la nostra disciplina (come il canone: aritmetica
  esatta, zero AI).
- **La copia di cortesia** nel design system che già firma ogni email BOOM:
  masthead nero, oro, QR al link di pagamento Stripe (già esistente:
  `/api/payments/link`). La fattura che il cliente VEDE è bella; quella che
  fa fede è l'XML dietro.
- **Trasmissione SDI**: due strade. (A) **PEC → SDI**: lo SDI accetta fatture
  via PEC, costo zero, e le ricevute (consegna/scarto) tornano per PEC — che
  leggiamo col pattern scan-inbox già rodato su banche e lead. Serve solo una
  casella PEC (probabilmente Egidi ce l'ha già). (B) Provider API (Acube,
  Openapi: centesimi a fattura) se vogliamo zero manutenzione. Decisione tua.
- **Stripe chiude il giro da solo**: il webhook già marca i pagamenti; ogni
  incasso servizio/canone genera la fattura corrispondente senza mani (oggi
  succede solo per il canone — si estende ai rami SERVICE/PFS/INVOICE).

**2c. Banca Sella, tre livelli — dal domani al definitivo.**

Verificato: `sella.it` è **già** nei domini riconosciuti dello scanner
(`api/banking/scan-inbox.js`). Quindi:

1. **Oggi, zero codice**: attivi nell'home banking Sella gli avvisi email di
   movimento e (se disponibile) l'invio periodico dell'estratto. Lo scanner li
   legge già, riconcilia gli accrediti contro le rate e propone i match dubbi
   in `/banca`. In più: export CSV movimenti da Sella → import manuale già
   esistente. *Questo si accende questa settimana.*
2. **Il livello vero — Sella API**: Sella è storicamente LA banca italiana
   delle API aperte (piattaforma Fabrick è del gruppo Sella). Da cliente
   business, l'accesso API al **proprio** conto è spesso attivabile. Se il tuo
   contratto lo consente: saldo + movimenti ogni mattina alle 04:15, senza
   consensi PSD2 che scadono ogni 90 giorni, senza aggregatori terzi. **Da
   verificare col tuo gestore Sella** — è la seconda domanda per te. Se sì, è
   un adapter nel sync esistente, non un sistema nuovo.
3. **Ripiego**: aggregatore TPP (GoCardless è chiuso ai nuovi; Enable Banking
   o simili). Solo se 1+2 non bastano — costo e consensi a scadenza.

**2d. Lo studio di commercialista interno.** Non sostituiamo il
commercialista dove serve la firma dell'intermediario (dichiarazioni, F24
telematici): gli togliamo tutto il resto. Il 1° del mese il Ragioniere
compone la **chiusura**: prima nota categorizzata (esiste), estratto
riconciliato (esiste), fatture XML del mese (nuovo), scadenzario aggiornato
(esiste: `accounting/scadenzario`), incassi vs pendenze — un fascicolo ZIP
col pattern dell'Archivista, in casella sua e tua. Il commercialista passa da
"mandami le carte" a "confermo". È la differenza tra pagare uno studio per
ricostruire e pagarlo per verificare.

**Effort**: 4–5 sessioni (il grosso è l'invoice-engine + il ciclo ricevute
SDI). Rischi dichiarati: la variante regime fiscale di Egidi cambia le regole
dell'engine — serve la risposta prima di scrivere la prima riga.

---

## 3 · L'ISPETTORE — la vetrina sotto controllo continuo, con la data di libertà che non mente

**Il problema.** La qualità degli annunci oggi è presidiata da tre agenti
separati (Fotografo, Copywriter, Pagella) che non si parlano, e da nessuna
parte si risponde alla domanda commerciale: *questo annuncio, sul mercato di
oggi, è competitivo?*

**Cosa si costruisce**: una sezione **Vetrina** nel portal — una riga per
annuncio, tutto insieme:

- **Il voto** (motore della Pagella, esistente) + foto (Fotografo) + testo
  (Copywriter) — finalmente in una schermata sola invece che in tre console.
- **La data di libertà onesta**: `availableDate` nel passato è una bugia in
  vetrina che allontana chi cerca per settembre. Flag automatico + comando
  bot per sistemarla in un messaggio. (Oggi nessuno la controlla.)
- **Prezzo vs mercato** (dal Perito): "sei al 78° percentile di zona, i
  competitor a questo prezzo hanno il balcone" — il confronto coi portali che
  chiedevi, calcolato sui dati che già raccogliamo.
- **Giorni in vetrina vs giorni-a-sparire di zona**: se la zona assorbe in 12
  giorni e il nostro è lì da 30, la riga diventa gialla e dice perché
  (prezzo? foto? data?).
- **Next best action**: ogni annuncio con UNA azione suggerita, ordinata per
  impatto — la logica dello sweep del Fotografo (impact-first) applicata a
  tutta la vetrina.

**Effort**: 2 sessioni una volta che il Perito esiste (è composizione di
motori già scritti + market-engine). Senza Perito, 1 sessione per la parte
igiene (date, voto, foto, testo in una pagina).

---

## 4 · Le due idee che sembrano lusso e non lo sono

**L'ORACOLO — `/chiedi` sul bot.** "Quanto ha reso Cavour nel 2026?" "Chi è in
ritardo?" "Quante visite ha fatto il bilocale di Pigneto prima di affittarsi?"
Un endpoint **in sola lettura**: la domanda in linguaggio naturale, il
contesto sono i TUOI dati (contratti, pagamenti, visite, annunci), la risposta
è una frase con i numeri. Mai una scrittura, mai un'invenzione: se il dato non
c'è, lo dice. È il pattern di `/api/wizard/interpret` (che già capisce il
linguaggio naturale sul catalogo) esteso in lettura a tutto l'archivio.
*Effort: 1–2 sessioni. È la feature che fa sembrare magico tutto il resto.*

**LA VALUTAZIONE PUBBLICA — il lead magnet per i mandati.** Il rendiconto
mensile fa RESTARE i proprietari; niente oggi ne fa ARRIVARE. Una pagina
pubblica "Quanto affitta casa tua a Roma?" — zona, mq, camere → fascia di
canone vera (market-engine) + verdetto concordato (canone-engine, già scritto)
+ "vuoi il numero esatto? ti chiamiamo": lead `landlord` nella pipeline
esistente (Lead Brain → Telegram → Commerciale). È il prodotto che Casafari
vende alle agenzie, costruito coi nostri dati, che genera mandati invece di
costare un abbonamento. *Effort: 1 sessione dopo il Perito.*

---

## 5 · La pagella della squadra attuale — cosa tenere, cosa fondere

Nessun licenziamento: la macchina regge. Ma tre razionalizzazioni:

1. **Le console sparse rientrano nel portale.** `/team` è già rientrato; il
   percorso naturale è che `/banca`, `/photo-lab` e `/pfs-command` diventino
   sezioni (stesso pattern della Squadra: si disegnano senza await, dati poi).
   Una app, non otto schede.
2. **Il trio Vetrina si presenta come UN reparto** con l'Ispettore a capo:
   stessa pagina, stessi dati, un solo posto dove guardare.
3. **Ogni agente nuovo nasce col contratto**: registro, lettera di assunzione,
   manopole solo se collegate, test anti-deriva. Il telaio costruito questa
   settimana è esattamente per questo — le tre assunzioni sopra ci si
   agganciano senza inventare niente.

---

## 6 · Cosa NON fare (e perché)

- **Non comprare un gestionale immobiliare** per poi piegarlo: la nostra
  macchina è già più integrata di qualunque ERP orizzontale, ed è nostra.
- **Non fare la guerra di scraping ai portali** oltre Homie: l'abbiamo già
  scritto nel codice — l'email-alert è la fonte portante per costruzione, il
  resto è bonus. Il Perito è disegnato per vivere di quella fonte.
- **Non promettere "commercialista sostituito"**: dichiarazioni e F24
  telematici restano a un intermediario abilitato. Noi gli consegniamo un
  fascicolo perfetto e negoziamo la parcella di conseguenza.
- **Non collezionare dati personali dei privati** nel magazzino di mercato:
  fatti dell'annuncio sì, contatti no (quelli vivono solo nel flusso PFS che
  ha una ragione contrattuale per usarli).

---

## 7 · Il piano — quattro tappe, ordine obbligato

| Tappa | Cosa | Perché prima | Effort |
|---|---|---|---|
| **1** | Perito v1: market-engine + copertura zone + comps card | Tutto il resto (Ispettore, Valutazione) beve da qui; il dato si accumula da SUBITO — ogni settimana persa è storia di mercato persa | 2–3 sessioni |
| **2** | Ragioniere: invoice-engine + XML SDI + Sella livello 1 (email/CSV, si accende subito) | Conformità prima di tutto; il resto della contabilità esiste già | 4–5 sessioni |
| **3** | Ispettore: sezione Vetrina + igiene date + prezzo vs mercato | Composizione di 1 + motori esistenti | 2 sessioni |
| **4** | Oracolo + Valutazione pubblica | I moltiplicatori: uno ti restituisce il tempo, l'altro porta mandati | 2–3 sessioni |

Ogni tappa: motore puro → test (mutazione compresa) → sezione → registro →
push. Come sempre.

---

## 8 · Le domande che servono a te (bloccano le tappe segnate)

1. **[blocca tappa 2]** Le fatture di Egidi oggi passano dallo SDI tramite
   qualche strumento esterno (commercialista, Fatture in Cloud…) o i PDF del
   portal sono l'unica emissione? E il **regime fiscale** di Egidi
   (ordinario/forfettario) — cambia le regole dell'engine.
2. **[blocca tappa 2, livello Sella API]** Chiedi al tuo gestore Sella se il
   tuo contratto business include l'accesso API al conto (piattaforma
   Fabrick/Sella API). Se sì, la banca entra in casa senza aggregatori.
   Intanto: attiva gli **avvisi email di movimento** nell'home banking — lo
   scanner li legge già da oggi.
3. **[blocca la trasmissione SDI]** Egidi ha una **PEC**? Se sì, la strada
   PEC→SDI è a costo zero con l'infrastruttura che abbiamo.
4. **[per il Perito]** Le zone di copertura: partiamo dalle ~10 dove avete
   immobili e clienti, o tutta la mappa `PRE_ZONES` da subito?

---

*Il filo di tutto lo studio: ogni pezzo nuovo beve da dati che già scorrono e
scrive in schemi che già esistono. Non è un'espansione — è smettere di buttare
quello che la macchina già raccoglie.*
