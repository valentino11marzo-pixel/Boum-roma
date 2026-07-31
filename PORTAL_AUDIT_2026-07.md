# Audit del Portal — luglio 2026

Oggetto: `portal.html` (shell, 716 righe) + `js/portal-app.js` (28.6k righe,
2,4 MB). 60 pagine, tre ruoli, ~1.100 funzioni in un unico scope globale.

Il portale è molto più sano di quanto la sua dimensione lasci temere: **zero
handler `onclick` che puntano a funzioni inesistenti** su ~4.200 punti di
interpolazione, i motori fiscali sono puri e testati, il boot Safari è
irrobustito con cura. I problemi veri non sono di stile — sono cinque, e tre
di questi mordono in produzione oggi.

---

## 1. Il pezzo che mancava davvero: la fattura

> «non riesco a creare una fattura, solo la ricevuta di pigione»

La diagnosi è più netta della richiesta. **Il portale non ha mai emesso una
fattura.** Non è un bottone mancante: è che in Italia una fattura *non è un
PDF*. È il file XML FatturaPA che viaggia sul Sistema di Interscambio —
obbligatorio B2B/B2C dal 2019, esteso a **tutti** i forfettari dal 1/1/2024.
Quello che il portale chiamava "Fattura" era un PDF con quattro campi, senza
IVA, senza dati fiscali del cliente, senza XML. Fiscalmente: niente.

Sotto, tre percorsi di creazione **scrivevano tre schemi diversi** nella stessa
collezione `invoices`:

| percorso | numero | IVA | dati cliente | esito |
|---|---|---|---|---|
| `openModal('addInvoice')` | `S.invoices.length + 1` | nessuna | solo `recipientId` | il numero **si ripete** appena si cancella un documento |
| `createQuickInvoice()` (⚡ Fattura Rapida) | **assente** | nessuna | nome sciolto | righe con scritto `undefined`, PDF salvato `BOOM_Fattura_undefined.pdf` |
| `autoInvoiceForPayment()` | `BOOM-YYYY-NNNN` | nessuna | inquilino | **fatturava il canone**: soldi dell'inquilino diretti al proprietario contati come ricavo BOOM |

Più: `parseInt(data.amount)` — una fattura da 1.383,50 veniva salvata **1.383**.
E `COMPANY.piva` valeva `17546591000`, che **non supera il controllo di
checksum** dell'algoritmo ufficiale a 11 cifre — stampata su ogni PDF prodotto
finora e destinata a far scartare dallo SdI ogni fattura elettronica.

Non era un dato ignoto: la P.IVA giusta — **`17322991005`** — era **già scritta
correttamente in cinque altri posti del repo**, compresa un'altra riga dello
stesso `portal-app.js`:

| file | valore |
|---|---|
| `js/portal-app.js:181` (`COMPANY.piva`) | `17546591000` ✗ |
| `js/portal-app.js:10825` (pagina «Egidi Immobiliare — Fiscale») | `17322991005` ✓ |
| `api/preagreement/_pdf.js` (piè di pagina del pre-accordo) | `17322991005` ✓ |
| `api/preagreement/_notify.js` (piè di pagina email) | `17322991005` ✓ |
| `docs/*-outreach.md` | `17322991005` ✓ |

Due P.IVA diverse nello stesso file, e quella sbagliata era la costante che
alimentava i PDF. È il caso da manuale per cui un dato del genere deve avere
**una sola fonte con una verifica automatica**: `checkVat()` lo respinge, un
test lo pinna, e la card Impostazioni lo dice a schermo mentre lo si digita.

### Cosa c'è adesso

**`js/invoice-engine.js`** — motore puro, nessun DOM, nessun Firebase, 47 test.

- Aritmetica **in centesimi interi**. L'IVA si calcola sul totale per aliquota
  (riepilogo), non riga per riga: sommare le imposte di riga produce scarti da
  1-2 centesimi che lo SdI rifiuta.
- **Numerazione progressiva** per anno e sezionale, letta dal *massimo emesso*
  e non dal conteggio. Le bozze non consumano numero: un documento prende il
  numero quando è emesso, non quando si apre l'editor.
- **Bollo €2** automatico: solo senza IVA esposta e solo *oltre* €77,47
  (a €77,47 esatti non è dovuto), con la scelta se riaddebitarlo.
- **Ritenuta d'acconto** con aliquota su quota di base (23% su 50% = l'11,5%
  delle provvigioni) e opzionale per riga, così un rimborso spese non la subisce.
- **Validazione preventiva**: checksum P.IVA e codice fiscale, codice
  destinatario a 7 caratteri vs `0000000` privato vs `XXXXXXX` estero, Natura
  obbligatoria a IVA 0, coerenza regime↔aliquote (un forfettario che espone IVA
  viene bloccato). Uno scarto SdI arriva giorni dopo via PEC e si gestisce a
  mano: molto meglio dirlo prima.
- **XML FatturaPA 1.2.2 (FPR12)** completo: `DatiTrasmissione`,
  `CedentePrestatore` con `IscrizioneREA` (obbligatorio per le S.r.l.),
  `CessionarioCommittente`, `DatiRitenuta`, `DatiBollo`, `DettaglioLinee`,
  `DatiRiepilogo` con `RiferimentoNormativo`, `DatiPagamento` con IBAN.
  Escaping XML, emoji rimossi (il charset SdI non li accetta), `Causale`
  spezzata sui 200 caratteri invece che troncata, date in ora **locale**
  (`toISOString()` avrebbe datato 31 dicembre una fattura emessa alle 00:30 del
  1° gennaio, cioè nell'anno fiscale sbagliato).
- **Nota di credito TD04** collegata all'originale. Una fattura emessa non si
  cancella: si storna.

**Nel portale**: editor a righe con totali live, validazione a schermo che
disabilita "Emetti" finché qualcosa non torna, anagrafica cliente che si
ricorda (i dati fiscali digitati una volta tornano sulla scheda del cliente e
la seconda fattura si compila da sola), PDF di cortesia che legge **gli stessi
totali dell'XML** (una sola aritmetica: PDF e XML non possono raccontare due
storie), download XML col nome file conforme (`IT<piva>_<progressivo>.xml`),
stato "da trasmettere / trasmessa" e KPI dedicato.

**Impostazioni → Dati di fatturazione**: denominazione, P.IVA (con controllo
checksum a schermo), regime, sede, REA, capitale sociale, IBAN, aliquota di
default, sezionale. Salvati in **`billing/company`**, collezione nuova e
admin-only: non in `settings`, che `firestore.rules` apre in lettura *a
chiunque* (il sito pubblico lo legge) — lì dentro ci sono IBAN e dati fiscali.

**Onestà in UI**: BOOM *genera* l'XML, non lo *trasmette*. Il file si carica su
"Fatture e Corrispettivi" dell'AdE o si passa all'intermediario del
commercialista. La schermata lo dice invece di fingere un invio.

### La ricevuta di pigione resta, ma smette di travestirsi

I documenti auto-generati sui canoni ora nascono `kind:'receipt'`, con serie
separata `RIC-…`. Non consumano numerazione fiscale, non sono trasmissibili
allo SdI, e **non entrano più nel "Fatturato"**. I documenti già esistenti sono
riclassificati al volo dal flag `autoGenerated`: nessuna migrazione.

---

## 2. Tre bug vivi, corretti

### `downloadContractPDF` era definita due volte — e vinceva quella sbagliata

Riga ~19344: l'implementazione vera, 68 righe — scarica il PDF *archiviato*,
rigenera solo se le firme sono più recenti, nomina il file con immobile e
inquilino. Riga ~21822: uno **stub da 4 righe**, aggiunto 2.500 righe più
sotto. In uno script classico l'ultima definizione vince: ogni "scarica PDF"
del portale finiva nello stub.

Il danno non era estetico. Lo stub chiamava `generateContractPDF()` a secco,
**scavalcando la guardia firme** che `regenerateContractPDF()` implementa
apposta. Su un contratto `signatureStatus: 'complete'`, premere "scarica"
riscriveva `generatedPDF` e `pdfHash` mentre `contratto-firmato.pdf` e il
certificato FES restavano congelati sui byte della firma: due copie divergenti
dello stesso atto, con l'hash del certificato che non torna più.

Stub rimosso. Nessun'altra funzione top-level è più definita due volte.

### Ogni inquilino in ritardo riceveva un IBAN inesistente

`COMPANY.iban` valeva `'IT00X0000000000000000000000'` con accanto il commento
`// ⚠️ UPDATE WITH REAL IBAN`. Non era un segnaposto dormiente: era usato in
**otto punti vivi**, fra cui il testo WhatsApp del sollecito di pagamento
all'inquilino, la card IBAN del portale inquilino, le email di benvenuto e i
PDF.

Ora c'è `payoutIban()`, che legge la fonte reale — `settings/payout`, già usata
da `/casa` per il bonifico del canone — con `billing/company` come seconda
scelta. Se manca, **dice che manca** invece di stampare un numero falso; nel
sollecito WhatsApp la riga IBAN semplicemente non compare. `COMPANY.iban` è
svuotato: se un PDF tornasse a mostrare quel numero, vuol dire che qualcuno ha
bypassato entrambe le fonti.

### XSS memorizzato: testo scritto da altri, eseguito nella sessione admin

`m.title` e `m.description` delle richieste di manutenzione — scritte da
**inquilini autenticati** via `saveTenantMaintenance` — finivano grezze in
`innerHTML` nella pagina Manutenzione e nella dashboard admin. Un inquilino che
apre un ticket intitolato `<img src=x onerror=…>` esegue JavaScript nella
sessione di un admin che ha permessi di scrittura su tutto Firestore.

Corrette 18 interpolazioni: manutenzione (titolo e descrizione), note libere di
clienti e utenti, nomi e indirizzi immobili, titoli dei modal di dettaglio, e i
`value="…"` degli edit-form dove un singolo apice usciva dall'attributo.

**Non è chiuso tutto.** Su ~4.200 interpolazioni in `innerHTML`, ~800 passano
da `esc()` o da un formatter. Le altre sono in larghissima parte id, numeri e
letterali, ma una passata sistematica sui campi *free-text* resta da fare — vedi
§5.

---

## 3. Cose senza senso, tolte

- **`openQuickInvoiceModal('PM')`** sulla dashboard: `SERVICES.PM` non esiste.
  Il bottone mostrava "PM €100" grazie a un `|| 100` e apriva un modal con
  importo vuoto. I bottoni ora si generano da `SERVICES`, così i prezzi non
  possono più divergere dal listino (mostravano DAS €150 e VV €80 quando il
  listino dice 249 e 89).
- **Chart.js a ogni navigazione**: `renderPage()` lanciava `loadChartJS()` su
  *ogni* pagina — Fatture, Documenti, Impostazioni comprese, dove non esiste un
  canvas — e `initDashboardCharts()` distruggeva e ricostruiva ogni istanza.
  Su 60 pagine, 3 hanno un grafico. Ora parte solo se un canvas c'è davvero.
- **`nextInvoiceNumber()`, `saveInvoice()`, `updateInvAmount()`, il modal
  `addInvoice`**: rimossi o trasformati in reindirizzi verso l'editor unico.
- **53 funzioni top-level mai referenziate** (`preOpenCasafari`,
  `boomExportJPG`, `preOpenAllHotZones`, `loadTemplate`, `openNewListing`,
  `clearAllDrafts`, l'intero blocco `pre*` del Property-Radar v1…). Le ho
  *lasciate*: sono resti di funzionalità che potrebbero tornare, e cancellarle
  in blocco nello stesso commit di un cambio fiscale rende il diff
  irrevisionabile. Vanno tolte, ma da sole. Elenco riproducibile:

  ```sh
  node -e "const s=require('fs').readFileSync('js/portal-app.js','utf8');
  const n=[...s.matchAll(/^[ \t]{0,4}(?:async )?function ([A-Za-z_]\w*)/gm)].map(m=>m[1]);
  const c={};for(const m of s.matchAll(/\b([A-Za-z_]\w*)\b/g))c[m[1]]=(c[m[1]]||0)+1;
  const d={};n.forEach(x=>d[x]=(d[x]||0)+1);
  console.log([...new Set(n)].filter(x=>c[x]<=d[x]).join('\n'))"
  ```

- **34 file `preview-*.html`** in root, serviti pubblicamente e indicizzabili.
  Fuori dallo scope di questo intervento, ma vanno spostati sotto una cartella
  esclusa da `sitemap.xml` o eliminati.

---

## 4. Il rischio strutturale: il boot admin legge tutto il database

```js
await Promise.all([
  db.collection('users').get(),      db.collection('properties').get(),
  db.collection('contracts').get(),  db.collection('payments').get(),
  db.collection('maintenance').get(),db.collection('clients').get(),
  db.collection('documents').get(),  db.collection('invoices').get(),
  …
]);
```

Nessun `limit`, nessuna finestra temporale. `payments` cresce di
*contratti × mesi* per sempre: 20 contratti attivi per tre anni sono già ~700
documenti, e non si fermano. `documents` e `invoices` idem. Ogni apertura del
portale, da ogni dispositivo, li scarica tutti — con costo Firestore
proporzionale e un tempo di boot che peggiora in modo monotono. Le collezioni
caricate in lazy hanno un `limit` (`leads` 100, `activityLog` 200, `messages`
500); quelle core no.

**Non l'ho toccato**: cambiare il caricamento dati tocca ogni pagina del
portale e non si valida senza il dataset reale. È il primo lavoro da fare dopo
questo. La direzione: finestra temporale sulle collezioni che crescono
(`payments` ultimi 18 mesi + tutti i `pending`/`overdue`, `documents` e
`invoices` per anno con caricamento a richiesta dello storico), il resto
invariato. Lo stale-while-revalidate del boot già copre la latenza percepita;
qui il problema è il volume.

Nota collaterale: l'auto-marcatura `overdue` gira dentro il ciclo di
caricamento e fa **una `update()` per pagamento scaduto** al primo boot dopo
una pausa. È auto-limitante (dal secondo giro lo stato è già scritto) ma è
lavoro che appartiene al cron, non al browser dell'operatore.

---

## 5. Sezioni vive che meritano il prossimo giro

Ordinate per rapporto valore/rischio.

1. **Fatture → soldi che rientrano.** Adesso che i documenti sono reali, il
   passo che paga è collegare `payments` e `invoices` alla riconciliazione
   bancaria che `/banca` già fa: una fattura emessa con IBAN e importo noti è
   riconciliabile esattamente come un canone, e l'ageing della pagina Fatture
   smetterebbe di essere una lista da guardare per diventare una lista che si
   svuota da sola.
2. **`esc()` sistematico.** Non a mano su 4.200 punti: introdurre un tag
   template (`` h`<div>${untrusted}</div>` ``) che escapa per costruzione e
   migrarci le pagine che mostrano dati scritti da terzi (leads, manutenzione,
   inbox, clienti). Il resto può restare com'è.
3. **Ageing fatture su `dueDate`, non su `date`.** Oggi i bucket 0-30/31-60/…
   si calcolano dalla data del documento; con termini a 30 giorni una fattura
   "scaduta da 45 giorni" è in realtà in ritardo di 15. Il campo `dueDate`
   adesso esiste su ogni documento nuovo: basta usarlo.
4. **Solleciti fattura → `action_queue`.** `sendInvoiceReminder` scrive un
   contatore e crea una notifica interna; per un destinatario che non è utente
   del portale non parte nulla, si limita a inoltrare all'operatore. La Squadra
   ha già il binario giusto (proposta → tap su Telegram → invio): il sollecito
   fattura dovrebbe percorrerlo invece di avere una via propria a metà.
5. **`invoicesPage` è la pagina più densa del portale** (5 KPI, ageing,
   forecast, sparkline, top debitori) e la meno *azionabile*: nessuno di quei
   numeri porta a un'azione con un tap. Il "Da trasmettere" aggiunto oggi è il
   modello — un numero che, cliccato, filtra la lista di ciò che si può fare
   adesso. Gli altri quattro dovrebbero seguirlo o sparire.

---

## 6. Cosa NON ho toccato, e perché

- **Il caricamento dati** (§4): fuori scope, va fatto contro dati veri.
- **Le 53 funzioni morte** (§3): vanno tolte in un commit dedicato.
- **La sede e il REA dell'emittente**: la P.IVA è ora quella vera
  (`17322991005`, checksum verificato e pinnato nei test) e precompila il form,
  ma `COMPANY.address` vale `'Roma, Italia'` — non è una sede: manca via,
  civico e CAP, e il numero REA non è noto. Senza quelli l'XML viene scartato,
  e la validazione lo dice. **Vanno completati in Impostazioni → Dati di
  fatturazione prima di emettere il primo documento**: la fatturazione
  elettronica legge `billing/company`, non `COMPANY`.
- **`firestore.rules`**: aggiunta solo la riga per `billing` (admin-only).
  Ricordarsi `npx firebase-tools deploy --only firestore:rules`.

---

## Test

```
node tests/invoice/run.mjs     47 test  · motore: totali, bollo, ritenuta,
                                          numerazione, validazione, XML, nota di credito
node tests/invoice/ui.mjs      13 test  · editor in Chromium con Firebase finto:
                                          si apre, i totali a schermo sono quelli del
                                          motore, la validazione blocca, l'XSS non passa
```

Entrambe registrate in `tests/run-all.mjs` (`npm test -- invoice invoiceui`).
`ui.mjs` si auto-skippa senza playwright-core, come `tests/safari/boot.mjs`.

Le suite `journey`, `review`, `fee`, `scheda`, `notify`, `vtelegram` falliscono
in questo ambiente per `ERR_MODULE_NOT_FOUND` (`nodemailer` e altri pacchetti
non installati) — **fallivano già prima di queste modifiche**, verificato con
`git stash`.
