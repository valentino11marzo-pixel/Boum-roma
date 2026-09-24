# STUDIO_PROPRIETARI_2026-09 — la pagina /owners e il proprietario che deve fidarsi

Scritto il 23/09/2026, insieme alla V1 di `/owners` («la pianta che si alza»).
Questo file tiene insieme **perché** la pagina è fatta così, **cosa** può dire
(e con quale file dietro), e **cosa manca** prima di pubblicarla.

## 1 · Da dove si parte

La /owners di maggio prometteva una «garanzia di solvibilità scritta nel
mandato», un portale proprietari «in tempo reale», supporto 24/7 e statistiche
senza fonte. Nessuna delle quattro cose aveva un file dietro: il mandato
generato dal portale (`js/portal-app.js`, template `mandato_gestione`) non
contiene garanzie; `owner-dashboard.html` è una pagina statica che salva in
localStorage; l'area vera è `/portal` col ruolo landlord e legge i dati
all'apertura. Il difetto non era una frase: era che prezzi e promesse vivevano
dentro la pagina, scritti a mano, e niente li confrontava con ciò che si firma.

La prima riscrittura (commit 0a0fa3f) ha tolto le bugie. Questa V1 cambia il
modello: **la pagina non chiede fiducia, mostra le carte** — documenti veri,
prodotti dagli stessi builder di produzione, su una casa d'esempio.

## 2 · Chi legge, e di cosa ha paura

Pubblico: il proprietario romano, spesso 45–70 anni, che prende il suo tempo;
poi chi ha più case, società, fondi ed enti (il binario B2B). Metodo e limiti
della ricerca: il proxy ha bloccato l'apertura diretta delle fonti primarie;
i numeri qui sotto vengono da riassunti incrociati, quindi **in pagina non
entra nessuno di loro** finché qualcuno non apre la fonte e la data.

- La paura n. 1 non è il canone perso: è **non riavere la casa**. Censis–
  Federproprietà (dic. 2025) riporta l'82,9% di italiani frenati dal timore di
  non rientrare in possesso; a Roma circa l'80% degli sfratti è per morosità
  (Unione Inquilini su dati del Ministero dell'Interno); ASPPI stima 12–18 mesi
  per una procedura. **Conseguenza in pagina**: la serratura è la prima stanza e
  una «luce spenta» — si dice che la legge ha i suoi tempi e che non li
  accorciamo, e accanto si mette solo ciò che controlliamo (pagamento prima
  delle chiavi, deposito fino a 3 mensilità, sollecito dal 3° giorno, SEPA che
  non si ritenta alla cieca, carte pronte per l'avvocato). Nessuna cifra.
- Quasi il 20% degli sfratti romani è per finita locazione: la data di
  scadenza non libera la casa da sola. Quindi non si vende il transitorio come
  «casa libera garantita».
- Il proprietario teme la burocrazia fiscale più dell'inquilino: registrazione,
  cedolare, attestazione, IMU. Risposta: tre righe «noi / tu» alla scrivania, e
  lo scadenzario dell'immobile.
- «Gratis» è la parola che fa diffidare: se la prima locazione non costa
  provvigione al proprietario, va detto **chi la paga** (l'inquilino) — è il
  movente, e dirlo è ciò che rende credibile il resto.
- Da non fare (sono anche regole di legge): niente scarsità finta (art. 23 Cod.
  Consumo), prezzi ai consumatori IVA inclusa (art. 49), niente filtri per
  nazionalità (art. 43 D.Lgs. 286/1998), niente recensioni senza fonte, niente
  cedolare «10%» senza dire che serve l'attestazione, niente cedolare promessa
  su contratti con aziende (questione pendente, AdE contraria).

## 3 · Cosa la pagina può dire, e con quale file

Ogni frase ha un file. Le principali:

| Frase | File |
|---|---|
| Verbale firmato sul posto, PDF a te in italiano e all'inquilino in inglese | `api/contracts/verbale.js` |
| L'AI non scrive «buono stato»; il danno su oggetto non dichiarato non si addebita | `js/inventario-engine.js` (diffInventory) |
| Modelli dell'accordo di Roma 27/07/2023; confronto automatico solo studenti e 3+2 | `js/contract-pdf.js`, `tests/contractpdf/verbatim.mjs` (il transitorio non ha il `.doc` in `reference/`) |
| Firma elettronica semplice, art. 21 CAD; prima l'inquilino poi «Tocca a Lei» | `api/magic-sign/submit.js`, `api/sign/_notify.js` |
| Rendiconto il 1° del mese, solo se c'è movimento | `api/owners/rendiconto.js` (cron `10 6 1 * *`) |
| Sollecito dal 3° giorno, con il via di una persona | `api/employees/gestore.js` (manopola, default 3) |
| SEPA rifiutato non si ritenta | `api/payments/_sdd.js` |
| /casa: manuale, guasti con categoria e priorità, email a 30/14/7/1 giorni | `tenant.html`, `api/journey/_run.js` |
| Ricerca rovesciata sui lead degli ultimi 120 giorni | `api/leads/_reverse.js` (MAX_AGE_DAYS 120) |
| La stessa casa non si promette due volte | `api/preagreement/_lock.js` |
| Canoni per conto terzi, non ricavi | `js/rent-engine.js` |

Cosa **non** si può dire (il registro completo è in `research.json` del giro di
studio): garanzia sui canoni; verifica del reddito o CRIF; firma qualificata;
pubblicazione automatica sui portali; area proprietari in tempo reale;
riversamento automatico sul conto del proprietario (oggi è manuale); 4+4 o
uso foresteria.

## 4 · Le decisioni del fondatore (23/09/2026) e come sono diventate codice

- **Prima locazione: 0 € di provvigione** per il proprietario; la paga
  l'inquilino (di norma 10% del canone annuo + IVA, `api/preagreement/create.js`).
- **Dalla seconda**: ½ o 1 mensilità + IVA, **caso per caso, scritta nel mandato**.
- **Pluriennale**: fee annua fissa su preventivo, scontata; **servizio** di
  registrazione e attestazione incluso, imposte escluse. Il flag
  `registrazioneInclusa` (proprietà o contratto) spegne la fattura ASPI
  (`api/fiscal/_aspi.js`, testato in `tests/aspi`).
- **I soldi**: a scelta del proprietario. Oggi esiste solo la corsia «incassiamo
  noi e riversiamo»; «li incassi tu» esce quando c'è il backend (V2).
- **Garanzia**: oggi non esiste e la pagina non la vende (§6).

Tutto questo vive in **una copia sola**: `js/owner-offer.js`. La pagina lo
legge alla build (`design/owners/costruisci-owners.mjs`) e `tests/owners`
pretende che pagina, owner-offer, `ASPI_DEFAULTS` e catalogo dicano gli stessi
numeri.

## 5 · Il concept: perché la pianta

Tre concept (Fascicolo, Stanze, Ibrido) giudicati da cinque giurie
(proprietario, portafoglio, conversione, ingegnere, art director): l'Ibrido
vince 5 su 5 (media 8,2), a condizione che sia un **taglio** e non una somma.
Il Fascicolo aveva la prova e non l'immagine; le Stanze l'immagine e non la
prova. L'Ibrido tiene un oggetto solo — la pianta tecnica di un 70 m² a Prati
— che fa da immagine firma, da indice della pagina e da chiusura («tutto
acceso, tranne due luci»), e in ogni stanza mette un documento vero nel punto
dove sta la paura che risolve.

Scelte che sembrano di gusto e sono di sostanza:
- la pianta si alza **solo su un gesto** del lettore (bottone, cartiglio
  compilato, tocco su una stanza), mai al caricamento: una rotazione non
  chiesta di una grande superficie, per un pubblico di 45–70 anni, è un rischio
  vestibolare e `getAnimations()` deve essere vuoto al load;
- proiezione **ortografica** (niente perspective): è l'assonometria del disegno
  tecnico, ed è affine — la build la ricalcola identica;
- il tocco su un foglio apre il PDF nel **visore nativo** del telefono (zoom e
  tutte le pagine) invece di un lettore fatto in casa;
- **nessun numero del concordato** finché il cancello P0-canone è chiuso (§7).

## 6 · La garanzia sui canoni: la proposta, non la promessa

Il fondatore vuole poter dire «se vuoi gestiamo tutto noi, siamo responsabili
e tratteniamo una piccola percentuale», **senza sublocazione**. La struttura
più vicina, da validare con un legale:

- **Patto di star del credere** accessorio al mandato (art. 1736 c.c.): il
  mandatario che incassa risponde verso il mandante dell'adempimento del terzo,
  a fronte di una **maggiore provvigione**. Si applica al mandato; nel nostro
  caso il mandato con rappresentanza per la gestione della locazione.
- **Rischio da verificare**: che la garanzia, se generalizzata e remunerata,
  sia qualificata come rilascio di garanzie nei confronti del pubblico
  (art. 106 TUB, attività riservata) o come attività assicurativa (IVASS). Lo
  star del credere è tradizionalmente accessorio e limitato: il parere deve
  dire fino a dove resta tale (tetto per contratto? solo canoni, non danni?
  durata? esclusioni?).
- **Alternative** se il parere è negativo: polizza «affitto garantito» di una
  compagnia (BOOM intermediario o semplice segnalatore), oppure fideiussione
  bancaria/assicurativa dell'inquilino al posto o accanto al deposito.
- **Cosa fa la pagina oggi**: dice che la garanzia non c'è, non la vende, e
  raccoglie solo l'interesse con una casella **mai pre-spuntata** nel modulo
  («Garanzia: interessato» arriva nel lead). Esce come prodotto solo quando
  `OFFER.garanzia.stato === 'attiva'`.

## 7 · I cancelli prima di pubblicare (P0)

La pagina vive sul branch; il merge su main aspetta questi punti.

1. **Regole dello zero** (fondatore): cosa conta come «prima locazione». La
   pagina stampa la proposta — conta la casa, non il proprietario; il rinnovo
   con lo stesso inquilino non è una nuova ricerca — e `OFFER.regole.confermate`
   è `false`.
2. **Parere legale** su «la provvigione la paga l'inquilino» mentre BOOM è
   mandataria del proprietario (Cass. SU 19161/2017, mediazione atipica) e
   sulla struttura della garanzia (§6).
3. **Il mandato coi prezzi della pagina**: il template «Mandato di Gestione»
   del portale ora stampa le righe di `mandatoRighe()` (js/owner-offer.js) —
   0 € prima locazione, ½ o 1 mensilità scritta caso per caso, pluriennale,
   pratiche, nessuna garanzia, recesso del consumatore — e non esce più con
   un compenso di default né con l'incasso dei canoni senza termine di
   riversamento. Resta da fare: il PDF del mandato riletto dal legale, poi
   `OFFER.mandato.pdf` (finché è `null` la pagina non linka un mandato e non
   ha la FAQ sul recesso).
4. **Cifre esterne**: nessuna in pagina; entrano solo con fonte primaria aperta
   e data.
5. **★ su Google**: esce solo con il link al profilo (`OFFER.prova.google`).
6. **P0-canone** (non blocca la pubblicazione, la pagina esce «senza numero»):
   si apre quando ASPI conferma la tabella delle zone e quando il fondatore
   scrive in `OFFER.canone.notaCatalogo` perché **12 annunci concordato:true**
   (letti da /api/listings il 23/09) stanno sopra il tetto che il motore dà
   anche con tutte le dotazioni — per esempio Trilocale Pigneto 100 m² a
   2.000 € contro 1.310 € (C30), Pigneto 80 m² a 1.600 € contro 1.048 €,
   Bilocale Flaminio 55 m² a 1.800 € contro 1.392 € (C49). È un problema della
   vetrina prima che della pagina.
7. Da scrivere quando esistono: giorni di riversamento, preavviso di recesso,
   polizza RC (compagnia e numero), referente e sostituto, conto dedicato.

8. **Firma dei contratti di locazione** (legale, PRIMA di tutto il resto):
   la locazione abitativa vuole la forma scritta (art. 1 c. 4 L. 431/1998),
   e per gli atti dell'art. 1350 n. 13 c.c. su documento informatico il CAD
   (art. 21 c. 2-bis) chiede firma elettronica **avanzata**, qualificata o
   digitale a pena di nullità. Il Magic Sign oggi è una firma elettronica
   semplice (FES, art. 20 c. 1-bis). La pagina è stata corretta per non
   promettere più di «firma elettronica»; il prodotto va verificato con il
   legale — se il rischio è reale, riguarda ogni contratto già firmato così.
9. **Sovrapprezzo sui pagamenti** (legale): D.Lgs. 11/2010 art. 3 c. 4 vieta
   al beneficiario di applicare spese per l'uso di uno strumento di pagamento
   (carte dei consumatori, bonifici e addebiti SEPA). `/casa` applica una
   commissione carta (`api/payments/pay.js` `rentFee`) e una commissione SEPA
   (`api/payments/_sdd.js` `sddFee`). Tolto dalla pagina /owners; il prodotto
   va deciso (commissione assorbita nel compenso, oppure parere che la
   escluda).
10. **Recesso del consumatore**: il mandato ora porta l'informazione (artt.
    49, 52, 57 Cod. consumo); manca il modulo tipo di recesso (allegato I,
    parte B) da allegare al mandato firmato a distanza.
11. **terms.html** contraddice la pagina (regola della provvigione, depositi,
    commissioni): va riscritta sulle stesse fonti (`js/owner-offer.js`,
    `api/_catalog.js`).
12. **privacy.html**: nessuna sezione per i proprietari (il modulo /owners
    raccoglie nome, telefono, zona, metri) e l'elenco dei responsabili del
    trattamento non corrisponde ai servizi usati. La pagina /owners ha già
    «Che fine fanno questi dati»; l'informativa deve dire lo stesso.
13. **Identità della società sul sito**: il capitale sociale (art. 2250 c.c.)
    non compare; il JSON-LD delle altre pagine dichiara `legalName` «BOOM
    Rome» invece di Egidi Immobiliare S.r.l.
14. **Banner cookie in inglese**: «No ads following you» mentre «Accept»
    concede anche i cookie pubblicitari (`ad_*`). Corretto il ramo italiano
    (`js/boom-consent.js`); quello inglese va riscritto.
15. **Deposito oltre tre mensilità**: la console delle proposte accetta
    `depositMonths` fino a 6 (`api/preagreement/create.js`), l'art. 11
    L. 392/1978 fissa il tetto a tre. L'Innesto già lo segnala come avviso;
    la console no.

## 8 · V2

Versione inglese; una riga di minuti GTFS dal centro della zona (serve una
tabella zona → centro per le 75 zone); contratto personalizzato generato sul
telefono; corsia «li incassi tu» (payoutMode, /casa in modalità diretta);
certificato e fascicolo fiscale nello ZIP; `tenant.html?demo=1`; recensioni di
proprietari con consenso; `/api/owners/polso` (aggregati di domanda).

## 9 · Come si mantiene

- Il testo si scrive in `owners.html`; ciò che sta fra i marcatori lo scrive
  `node design/owners/costruisci-owners.mjs` (idempotente; `--check` in test).
- La pianta: `design/owners/pianta.json` (sorgente unica, in cm) →
  `design/owners/pianta.mjs` + `pianta.css`; runtime `js/owners-pianta.js`.
- Le carte: `node design/owners/genera-fascicolo.mjs` → `carte/`.
- La pagina viva: `js/owners-app.js` (+ `js/owners-foglio.js` a cancello aperto).
- La card social: `design/owners/genera-og-owners.py` → `og-owners.png`.
- Test: `node tests/owners/run.mjs` e `node tests/owners/ui.mjs`.
