# STUDIO — Boom (boompay.app): cosa è davvero, cosa ce ne facciamo

*30 settembre 2026. Domanda dell'operatore: «ho trovato un omonimo negli USA,
ed è anche un'idea di cosa potrebbe diventare BOOM — o una versione migliore,
fatta per l'Europa e l'Italia».*

> **Nota sulle fonti.** Da questo ambiente `boompay.app` e tutte le pagine di
> terzi (store, stampa, Tracxn, recensioni) sono **bloccate dal proxy di
> rete**: nessuna pagina è stata letta direttamente. I fatti qui sotto vengono
> dai riassunti del motore di ricerca, con l'URL accanto. I numeri di Boom
> (+28 punti, 400 operatori, 500.000 unità) sono **dichiarazioni dell'azienda**,
> non verificate. Il sito e il design di Boom **non li ho visti**: nessun
> giudizio sul loro design in questo studio.

---

## 0 · Il verdetto in cinque righe

1. **Boom non è l'app dei pagamenti d'affitto che il nome suggerisce.** È nata
   (2020) come app consumer "costruisci il credito con l'affitto" ($2/mese) e
   in sei anni si è spostata sul **B2B**: software di screening e leasing per
   grandi gestori americani. L'app consumer è il pezzo che loro stessi hanno
   declassato.
2. **Il loro prodotto di punta non si trapianta in Italia.** Il "rent
   reporting" vive di tre cose che qui non ci sono: bureau che accettano i
   canoni, una legge che obbliga i proprietari a offrirlo (California AB 2747),
   e un inquilino il cui problema è il punteggio FICO. Il nostro inquilino ha
   un altro problema: **al momento della candidatura non ha garante né busta
   paga italiana**.
3. **Quello che si trapianta sono quattro lezioni, non un prodotto:** essere
   uno strato di DATI e non di SOLDI; lo screening come prodotto; il cuneo
   regolatorio come canale B2B; l'agente AI di leasing (dove BOOM è già avanti).
4. **Prima di qualunque "BOOM Pay" c'è un punto da chiudere oggi:** i canoni
   dei proprietari atterrano sul conto e sullo Stripe di BOOM. Va verificato
   con un legale (PSD2) e contro i termini Stripe, e — se un giorno si incassa
   per proprietari non in gestione — si passa a Stripe Connect.
5. **La mossa giusta adesso** è quella già decisa ad agosto e mai costruita: il
   **Tenant Passport per expat**. Il concorrente italiano esiste (CRIF
   Affittabile, €39) ma è costruito per chi ha SPID e un conto italiano.

---

## 1 · Chi è Boom, sui fatti

| | |
|---|---|
| Società | Boom Pay, Inc. — Austin, Texas. Fondata nel 2020 da **Rob Whiting** (CEO) e **Kirill Moizik** (CTO) |
| Finanziamenti | Seed $4,5M (guidato da Starting Line; tra gli angel i co-fondatori di Plaid) + **Serie A $15M ad agosto 2026** (guidata da S3 Ventures, con Mischief VC) = **$20,5M** in totale |
| Clienti dichiarati | screening per **400+ operatori, 500.000+ unità**; "oltre il 25% dei maggiori gestori terzi di case unifamiliari" e una quota delle prime 100 aziende di *manufactured housing* |
| Prossima espansione | multifamily e **student housing** (negli USA) |

### I prodotti

| Prodotto | Cosa fa | Chi paga |
|---|---|---|
| **BoomReport** (consumer) | Collega il conto (Plaid), riconosce il pagamento dell'affitto fra i movimenti e segnala **solo i pagamenti puntuali** a Experian, TransUnion ed Equifax. Retrodatazione fino a 24 mesi. Nessuna interrogazione del credito. Media dichiarata **+28 punti**. | Inquilino: $10 di iscrizione + $2/mese fatturati annualmente; $25 una tantum per i 24 mesi passati (alcune recensioni riportano $60/anno: il listino è cambiato) |
| **BoomReport per gestori** | La stessa segnalazione, attivata dal gestore per tutti gli inquilini — venduta come **conformità alla legge californiana AB 2747** | Gestore |
| **BoomSplit** | L'inquilino spezza l'affitto in più rate; Boom paga il proprietario in un'unica soluzione alla scadenza. Solo se si paga tramite portali (RentCafe, AppFolio). | Inquilino |
| **BoomScreen** | Screening "configurabile" regolato FCRA: verifica del reddito da conto (partnership con **Plaid**), busta paga o documenti; identità a tre vie; antifrode sui documenti; precedenti penali e sfratti per contea; criteri di punteggio impostati dal gestore. Prezzo a consumo; il gestore decide quanto far pagare la candidatura. | Gestore (che può ribaltarlo sul candidato) |
| **BoomCRM** (agosto 2026) | Risponde alle chiamate, qualifica i candidati, fissa le visite. Promessa: **approvazione in meno di un giorno contro i 7 dello standard**. Primo "agente AI" lanciato: *Application Support*. | Gestore |

Il racconto del fondatore: dopo aver aiutato i fratelli a trovare casa durante
il COVID, rifiutati per errori nel credito. La tesi dell'investitore: i gestori
usano criteri fissi ("3× il canone e 650 di punteggio") che non si piegano al
rischio vero — serve un underwriting "stile fintech".

### Il cuneo che li ha fatti crescere: AB 2747

Dal **1° aprile 2025** in California chi possiede o gestisce residenziale deve
**offrire** agli inquilini la segnalazione dei pagamenti puntuali ad almeno un
bureau, alla firma e poi ogni anno (esenti i privati con un solo edificio sotto
le 15 unità); le morosità non si possono segnalare. Boom ha una pagina dedicata
alla conformità AB 2747. **Una legge ha trasformato un'app consumer in un
obbligo per i gestori.** Questa è la lezione più preziosa dell'intera storia
(§4.3).

### Cosa dicono i clienti consumer

Le recensioni pubbliche (BBB, Trustpilot, ComplaintsBoard) si concentrano su
**abbonamenti difficili da disdire, addebiti dopo la disdetta, variazioni di
prezzo non comunicate** e verifiche del proprietario "perse" che bloccano la
segnalazione. È il difetto tipico di un abbonamento da $2 al mese: il margine
non paga l'assistenza. Coerente con il loro spostamento sul B2B.

### Il contesto USA che il nome non racconta

Boom è un operatore di nicchia, non il leader del settore. Il gigante del
"affitto come prodotto finanziario" è **Bilt**: valutata **$10,75 miliardi a
luglio 2025**, paga l'affitto con carta senza commissioni e con punti. Ma anche
lì l'economia è fragile: a luglio 2025 Wells Fargo è uscita in anticipo dalla
carta Bilt dichiarando **perdite fino a $10M al mese**, e a gennaio 2026 Bilt
ha rifatto il programma con un altro emittente. **In Europa quel modello è
impossibile per costruzione**: le commissioni interbancarie sulle carte dei
consumatori sono plafonate allo 0,2% (debito) e 0,3% (credito) dal Regolamento
UE 2015/751. Non c'è margine da cui pagare premi sull'affitto.

---

## 2 · Perché il prodotto di Boom non attraversa l'Atlantico

**Stress-test dell'idea "facciamo il Boom italiano":**

1. **Non c'è un bureau che riceva i canoni.** I sistemi di informazioni
   creditizie italiani (CRIF/EURISC, Experian, CTC) sono alimentati dai
   finanziatori che vi partecipano, sotto un codice di condotta approvato dal
   Garante. Un proprietario o un'agenzia non vi scrivono. La risposta di CRIF al
   mercato degli affitti infatti non è una scrittura, è una **lettura**:
   *Affittabile* (§3). *(Da far confermare a un legale prima di escluderlo del
   tutto; ma nessun canale pubblico è emerso.)*
2. **Non c'è una legge che lo imponga.** Senza AB 2747 il gestore non ha motivo
   di pagare per offrirlo.
3. **Il problema del nostro cliente è un altro.** Un expat a Roma non viene
   scartato per un punteggio italiano basso: viene scartato perché **non ha un
   garante né una busta paga italiana** al momento della candidatura. Un credito
   italiano costruito in 12 mesi arriva quando la casa l'ha già persa.
4. **L'abbonamento consumer è il pezzo che Boom stessa ha lasciato.** Portarlo
   qui significherebbe copiare la parte peggiore del loro modello.
5. **BoomSplit in Europa è credito al consumo.** Dal **20 novembre 2026** la
   nuova direttiva sul credito ai consumatori (CCD2, 2023/2225) porta dentro il
   perimetro quasi tutto il "paga dopo". Pagare il proprietario e farsi
   rimborsare dall'inquilino a rate = attività da intermediario finanziario.
   Resta legittimo ciò che BOOM già fa: la **cadenza delle rate pattuita col
   proprietario** nel contratto (`installmentMonths`), che non è credito.

---

## 3 · La mappa italiana: chi c'è già

| Chi | Cosa fa | Modello | Per noi |
|---|---|---|---|
| **CRIF — Mister Credit *Affittabile*** | Report di affidabilità dell'inquilino da mostrare a proprietari e agenzie: giudizio (alta → bassa), **canone mensile sostenibile** calcolato dal conto corrente, assenza di segnalazioni negative (SIC, protesti). Attivo 15 giorni. | **€39**, pagato dall'inquilino; attivazione con SPID o modulo firmato | È il BoomScreen italiano visto dal lato inquilino — e il prezzo di riferimento per il nostro Passport. Ma è costruito per chi ha **SPID, codice fiscale con storia e un conto italiano** |
| **Zappyrent** | Piattaforma che seleziona gli inquilini con un rating e **garantisce il canone** al proprietario (versato il 12 del mese anche se l'inquilino non paga; sfratto a carico loro). Pensata per studenti, Erasmus e giovani lavoratori senza garante. | Paga il **proprietario**: una mensilità il primo mese + **8% del canone** dopo | Il concorrente più vicino al nostro pubblico. Conferma che il dolore "niente garante" è monetizzabile — dal lato proprietario |
| **Rent2Cash** | Anticipa al proprietario fino a 36–48 mesi di canoni futuri e gestisce l'incasso; algoritmo *VAULT* su ~50 criteri; cartolarizzazione con Banca Finint. Round da **oltre €100M** (2026). | Sconto sull'anticipo | Il capitale che a BOOM manca. Possibile **partner** sulla gestione, non concorrente sul lead |
| **Fideiussione assicurativa** | Sostituisce il garante privato; premio annuo tipicamente **1,5–4%** dell'importo garantito | Paga l'inquilino | Solo imprese autorizzate al **ramo cauzione** (ramo 15). BOOM può solo distribuire, e distribuire assicurazioni richiede l'iscrizione al RUI |
| **Nova Credit** | Porta lo storico creditizio estero (USA, UK, altri 20 Paesi) nel Paese di arrivo | B2B; autorizzata in UK dal 2023 | Non risulta attiva in Italia. Se lo diventasse, sarebbe il pezzo mancante del Passport per gli expat |

**Il buco che nessuno copre bene:** l'expat appena arrivato — conto estero,
niente SPID, niente storia CRIF, niente busta paga italiana — che deve
convincere un proprietario **prima** di firmare. CRIF non lo vede, Zappyrent lo
serve solo dentro la propria piattaforma, la fideiussione costa e richiede
tempo. *(Ipotesi da verificare in 10 minuti: provare ad acquistare Affittabile
senza SPID e con un conto non italiano.)*

---

## 4 · Le quattro lezioni che valgono

### 4.1 Essere uno strato di DATI, non di SOLDI

BoomReport **non tocca l'affitto**: legge il conto dell'inquilino via Plaid e
riconosce il pagamento. Così Boom evita la licenza di trasferimento fondi per il
prodotto principale. Solo BoomSplit muove soldi, ed è il prodotto marginale.

**Da noi è il contrario, e va guardato adesso.** Oggi i canoni dei proprietari
arrivano sul conto e sullo Stripe di BOOM: carta via Stripe Checkout
(`api/payments/pay.js`), addebito SEPA sul mandato
(`api/payments/_sdd.js`), bonifico all'IBAN di `payout/default`. Il codice lo
sa già — `agencyCollections` in `js/rent-engine.js` li conta come
**capitale per terzi** — ma nessun codice lo gira ai proprietari: esiste solo
il rendiconto. Non ci sono Stripe Connect né conti collegati (verificato:
nessun `transfer_data`, `on_behalf_of` o account connesso in `api/`).

Le due domande per un legale (un'ora, prima di qualunque "BOOM Pay"):

- **PSD2.** Incassare per conto di terzi è un servizio di pagamento, salvo
  esclusioni. Quella dell'**agente commerciale** vale solo se si agisce per
  conto di **una sola** parte. BOOM incassa per il proprietario ma prende la
  provvigione anche dall'inquilino, e come mediatore (art. 1754 c.c.) non è
  agente di nessuna delle due. L'esclusione regge sul mandato di gestione?
- **Stripe.** I termini di un account Stripe standard normalmente non
  ammettono l'incasso di fondi per conto di terzi senza Connect. Il rischio
  concreto non è una multa: è un **congelamento dell'account con dentro i
  canoni dei proprietari**. Da leggere nei termini in vigore.

Esiti possibili: (a) si resta così, con la clausola di incasso nel mandato di
gestione e un conto dedicato; (b) carta e SEPA passano a **Stripe Connect**, con
ogni proprietario come account collegato: Stripe diventa il soggetto regolato e
BOOM la piattaforma. Il bonifico può restare diretto all'IBAN del proprietario,
con la causale `BOOM-XXXXXX` che la riconciliazione di `/banca` già legge.
**Prerequisito assoluto** se un giorno si incassa per proprietari che BOOM non
gestisce.

### 4.2 Lo screening È il prodotto

BoomScreen è ciò che i gestori pagano davvero. BOOM ha già i pezzi e non li ha
ancora messi in fila:

- `js/underwriting-engine.js` — punteggio A–D, perdite attese per fascia,
  premio minimo: è già un motore di **prezzo di una garanzia** (fermo, perché la
  garanzia in proprio è stata esclusa ad agosto — giustamente);
- `computeTenantMetrics` nello stesso file — puntualità dai pagamenti veri;
- La Scheda con OCR (`/scheda`) — l'identità da una foto;
- `/api/apply-lead` — fascia di reddito, tipo di garante, firmatari;
- token derivati per le pagine di verifica pubbliche.

Manca l'unica cosa che Boom compra da Plaid: la **verifica del reddito dal
conto**. GoCardless ha chiuso le nuove iscrizioni; le alternative europee
(Tink, TrueLayer, Salt Edge, la stessa CRIF come AISP) coprono i conti UE e UK,
non quelli americani. Per un expat americano la prova resta documentale
(contratto di lavoro, lettera dell'azienda, estratti conto) — ed è lì che
l'OCR già in casa lavora.

### 4.3 Il cuneo regolatorio come canale B2B

Boom non ha convinto i gestori con la bellezza del prodotto: **AB 2747 li ha
obbligati**. La domanda giusta per BOOM non è "chi segnala gli affitti in
Italia" ma **"quale obbligo pesa su proprietari e agenzie, e noi l'abbiamo già
automatizzato?"**

La risposta c'è: il **canone concordato**. Scheda di calcolo ARPE 1:1, iter
ASPI in un tap, contratto verbatim dei modelli dell'associazione, Fascicolo
Fiscale, pack RLI (vedi CLAUDE.md). Per un'agenzia piccola di Roma fare un
concordato attestato è lavoro manuale e rischio di errore; per BOOM è un
processo. **È il nostro AB 2747**: se mai BOOM farà il salto B2B che Boom ha
fatto, il cuneo è "concordato attestato come servizio", non la segnalazione
degli affitti.

*Stress-test:* la domanda delle agenzie è un'ipotesi, non un dato. E il mercato
italiano è frammentato in agenzie piccole che spendono poco in software;
Boom vende a gestori istituzionali con centinaia di migliaia di unità. Il
corrispettivo italiano sono gli operatori istituzionali — build-to-rent,
studentati, co-living — non l'agenzia di quartiere. Per questo la prova va fatta
**a mano, prima di scrivere codice** (§5, passo 5).

### 4.4 L'agente AI di leasing — qui BOOM è avanti

BoomCRM (agosto 2026) risponde alle chiamate, qualifica e fissa le visite. BOOM
ha già la Receptionist (ElevenLabs, catalogo e slot veri), la Segretaria su
WhatsApp ed email, il Commerciale, la griglia delle visite con conferma e il
Lead Brain. **Non c'è niente da copiare**. C'è un numero da prendere in
prestito: Boom si vende su **"approvato in meno di un giorno contro sette"**.
BOOM quel numero non lo misura. I due estremi ci sono (`leads.createdAt` e
`preAgreements.acceptedAt`), ma la proposta non porta il `leadId`: oggi si
possono unire solo per email o telefono. Va misurato — e, se serve, il legame
va scritto alla creazione della proposta — prima di dichiararlo.

---

## 5 · Cosa può diventare BOOM — le opzioni, con verdetto

| Opzione | Verdetto | Perché |
|---|---|---|
| **A. "BOOM Pay" consumer**: costruisci il credito con l'affitto | **NO** | Nessun bureau che riceva i canoni, nessuna legge che lo imponga, abbonamento consumer che Boom stessa ha declassato. |
| **B. Carta/pagamento dell'affitto con premi** (modello Bilt) | **NO** | Interchange UE plafonata allo 0,3%: non c'è margine. Negli USA ha fatto perdere $10M/mese all'emittente. |
| **C. BoomSplit italiano** (affitto a rate pagato da BOOM) | **NO in proprio** | Credito al consumo (CCD2 dal 20/11/2026). La cadenza pattuita col proprietario, già nel contratto, copre il bisogno legittimo. |
| **D. Tenant Passport per expat** | **★ COSTRUIRE ORA** | Già deciso il 5/08 (`SERVIZI_STUDIO_2026-08.md` §5), mai costruito. Il prezzo di riferimento esiste (CRIF €39), il buco è l'expat senza SPID e conto italiano. |
| **E. Attestato di puntualità** per gli inquilini BOOM | **SÌ, piccolo** | È BoomReport tradotto: senza bureau, ma con una prova verificabile. Costo quasi zero, i dati ci sono. |
| **F. Affitto garantito per i proprietari in gestione** | **PARTNER, non in proprio** | Conferma del verdetto di agosto. Ora con nomi: Rent2Cash (capitale), un'assicurazione del ramo cauzione. Zappyrent è concorrente, non partner. |
| **G. BOOM OS per altri** (la svolta B2B di Boom) | **ORIZZONTE, con prova manuale** | È il vero parallelo con Boom. Il cuneo è il concordato (§4.3), il cliente è l'operatore istituzionale. Serve prima la prova che qualcuno paghi. |

### Il Tenant Passport, rivisto alla luce di Boom e di CRIF

La specifica di agosto resta valida (intake col pattern `/scheda`, punteggio
dall'underwriting engine, PDF bilingue, pagina di verifica con token derivato,
approvazione in un tap su Telegram). Tre correzioni:

1. **Si posiziona dove CRIF non arriva**: "Nessun garante italiano? Nessun
   conto italiano? Il tuo dossier verificato in 24 ore, in inglese e in
   italiano." Mai "meglio di CRIF": per un italiano con SPID, Affittabile a
   €39 è la scelta giusta e va detto.
2. **Il prezzo si allinea**: €39–49, non €69 a regime. Il riferimento di
   mercato ora è noto.
3. **Il dossier dichiara il suo metodo**, come fa Affittabile: cosa è stato
   verificato (identità, reddito documentale, datore di lavoro), cosa no
   (nessun accesso ai bureau). Un proprietario si fida di un documento che dice
   i propri limiti — la stessa regola che vale per `/meteo` e per la Réunion.

### L'Attestato di puntualità

Per ogni inquilino con almeno 6 rate registrate: un documento firmato BOOM e una
pagina di verifica con token derivato. Mesi pagati, **quanti in tempo** (da
`computeTenantMetrics`), via di pagamento, periodo. Solo i fatti: nessun
punteggio, nessun giudizio. Serve all'inquilino che cambia casa, a chi chiede un
mutuo come prova di affidabilità (non sostituisce la centrale rischi, e va
detto), e a BOOM come motivo per restare e per consigliarci. Regole da
rispettare fin dall'inizio: lo richiede l'inquilino, mai generato per un terzo;
una rata segnalata come bonifico ma non riconciliata non conta come pagata.

---

## 6 · Il nome

Boom Pay, Inc. usa "Boom", "BoomPay", "BoomReport", "BoomScreen" negli USA, e
dichiara espansione solo sul mercato USA. Oggi non c'è sovrapposizione. Ma
"BOOM" è un marchio generico e affollato: **prima di chiamare qualunque cosa
"BOOM Pay"** si fa una ricerca su EUIPO e UIBM nelle classi 36 (finanza e
immobiliare) e 42 (software). Non è stato possibile farla da qui. Costo: zero.
Rinominare un prodotto già lanciato: alto.

---

## 7 · I passi, in ordine

1. **Il punto legale sui canoni incassati** (§4.1) — un'ora con un legale e la
   lettura dei termini Stripe. È il solo punto di questo studio che riguarda un
   rischio di oggi, non un'opportunità di domani.
2. **Il test di 10 minuti su CRIF Affittabile**: acquistarlo come expat (senza
   SPID, con un conto estero). Se non si può, il posizionamento del Passport è
   confermato; se si può, il Passport deve vincere sulla lingua e sulla
   velocità, non sull'accesso.
3. **Tenant Passport v1**, secondo la specifica di agosto con le tre correzioni
   del §5.
4. **Attestato di puntualità** — piccolo, sui dati esistenti.
5. **Prova manuale del cuneo B2B**: offrire a 3–5 operatori (una o due agenzie
   di Roma, uno studentato, un co-living) il concordato attestato "chiavi in
   mano" per contratto, eseguito con gli strumenti attuali. Nessuna riga di
   multi-tenancy finché qualcuno non paga.
6. **Misurare "dal lead alla proposta accettata"** (§4.4), prima di
   prometterlo in una pagina.
7. **Un contatto informativo con Rent2Cash** sulla gestione garantita — solo
   per capire le condizioni, nessun impegno.

**Cosa NON fare**: app consumer, abbonamenti, carte, rate pagate da BOOM,
garanzie in proprio, e qualunque incasso per proprietari non gestiti prima del
punto 1.

---

## Fonti

Boom (USA)
- [Boom — sito (bloccato da qui)](https://www.boompay.app/) · [BoomReport](https://www.boompay.app/boomreport) · [BoomScreen](https://www.boompay.app/boomscreen) · [Pagina AB 2747](https://www.boompay.app/ca2747) · [Partnership Plaid](https://www.boompay.app/post/boom-partners-with-plaid-to-modernize-income-verification-for-rental-underwriting) · [Agente Application Support](https://www.boompay.app/post/boom-launches-application-support-agent) · [Rent Reporting-as-a-Service](https://www.boompay.app/post/boom-launches-rent-reporting-as-a-service)
- [Serie A $15M — FinSMEs](https://www.finsmes.com/2026/08/boom-raises-15m-in-series-a-funding.html) · [S3 Ventures](https://www.s3vc.com/news-and-insights/boom-raises-15m-series-a) · [Axios](https://www.axios.com/pro/fintech-deals/2026/08/18/boom-15m-series-a-rental-leasing-software) · [FinTech Global — BoomCRM](https://fintech.global/2026/08/19/boom-bags-15m-series-a-unveils-boomcrm/) · [This Week in Fintech](https://www.thisweekinfintech.com/p/boom-raises-15m-series-a-to-bring-fintech-style-underwriting-to-rental-housing)
- [Seed $4,5M — HousingWire](https://www.housingwire.com/articles/rent-reporting-platform-boom-raises-4-5m-in-seed-round/)
- [Recensione e prezzi — FinMasters](https://finmasters.com/boom-review/) · [App Store](https://apps.apple.com/us/app/boom-build-credit-with-rent/id1534466495) · [Google Play](https://play.google.com/store/apps/details?id=com.boompay.boompay&hl=en_US)
- [Reclami — BBB](https://www.bbb.org/us/tx/austin/profile/financial-technology/boom-pay-inc-0825-1000219980/complaints) · [Trustpilot](https://www.trustpilot.com/review/boompay.app)
- [AB 2747 — Blake Law](https://www.blakelawca.com/articles/ab2747) · [FrontLobby](https://frontlobby.com/en/2025/03/understanding-californias-new-rent-reporting-law-ab-2747/)

Contesto USA
- [Bilt — $10,75 mld](https://newsroom.biltrewards.com/bilt-raises-250-million-at-over-10-billion-valuation) · [Bilt — Wikipedia (Wells Fargo, Bilt 2.0)](https://en.wikipedia.org/wiki/Bilt_Rewards)
- [Nova Credit — autorizzazione UK](https://www.novacredit.com/corporate-blog/nova-credit-receives-authorisation-to-become-uks-first-cross-border-credit)

Italia ed Europa
- [CRIF Mister Credit — Affittabile](https://www.mistercredit.it/servizi/affittabile/) · [Foglio informativo](https://www.mistercredit.it/media/4nafcta4/affittabile-norme-contrattuali.pdf)
- [Zappyrent — Protezione](https://www.zappyrent.com/it/protezione-zappyrent) · [StartupItalia](https://startupitalia.eu/economy/economia-digitale/zappyrent-lalgoritmo-da-il-rating-allinquilino-e-la-startup-paga-al-suo-posto-se-moroso/)
- [Rent2Cash — Milano Finanza](https://www.milanofinanza.it/news/rent2cash-round-da-100-milioni-il-co-fondatore-fioranelli-ecco-come-funziona-il-rental-cash-202603041906211486) · [Il Sole 24 Ore](https://www.ilsole24ore.com/art/arriva-rent2cash-start-up-che-monetizza-affitti-futuri-proprietari-AFwZ3CRC)
- [Fideiussione o deposito — idealista](https://www.idealista.it/news/finanza/fisco/2026/09/08/442103-qual-e-l-opzione-e-migliore-per-l-affitto-fideiussione-o-deposito-cauzionale)
- [UK Rental Exchange — Experian](https://www.experian.co.uk/consumer/guides/can-paying-rent-build-credit-score.html)
- [CCD2 — EUR-Lex](https://eur-lex.europa.eu/eli/dir/2023/2225/oj/eng) · [PSD2, esclusione agente commerciale — EBA Q&A](https://www.eba.europa.eu/single-rule-book-qa/qna/view/publicId/2020_5355)

Nel repo: `SERVIZI_STUDIO_2026-08.md` §5 (Tenant Passport) · `docs/nuovi-servizi-analisi.md` §2.8–2.11 (garanzia, escrow, B2B, BOOM OS) · `js/underwriting-engine.js` · `js/rent-engine.js` (`agencyCollections`) · `api/payments/pay.js`, `_sdd.js`.
