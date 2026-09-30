# egidimmobiliare.it: PRD della home «Valentino Egidi Immobiliare»

Stato al 30/09/2026 sera: terza direzione (v3). La home in
`egidi/index.html` è in anteprima e va commentata.

Direzioni precedenti, ancora nella storia del ramo:
- **v1 «Il Fascicolo»** (commit `c9f463e`): carta, inchiostro, un solo movimento. Bocciata come troppo basilare.
- **v2** (commit `0ad494c`): verbo che gira, casa in assonometria nell'hero, check a 8 voci. Giudicata «carina», ma ancora da template.

La v3 è la risposta a «unica, non la classica, ultra tech, e chi vuole
lavorare con noi deve capire che non è facile».

## 1. Il brand e le due case
- **Valentino Egidi Immobiliare** è il marchio delle vendite: vendere,
  comprare, investire a Roma. **BOOM** è il marchio degli affitti.
- Una società per entrambi, Egidi Immobiliare S.r.l. Il piede lo dichiara:
  «Valentino Egidi Immobiliare è un marchio di Egidi Immobiliare S.r.l.».
- **Il passaggio a BOOM è esplicito in sei punti**, ognuno con gli UTM
  `utm_source=egidimmobiliare&utm_medium=referral` e un `utm_campaign` suo:
  1. la riga AFFITTARE del tabellone, in oro;
  2. la voce di menu col punto oro;
  3. la sezione delle due case;
  4. l'ultimo atto del metodo, «E se non vendi: la affitta BOOM»;
  5. il calcolo del rendimento;
  6. la candidatura (scegliendo «Affittare» si va subito a BOOM) e i contatti.

## 2. Il linguaggio (perché non è un template)
- **Hero = tabellone delle partenze.**
  - Le celle split-flap girano e si posano su VENDERE, COMPRARE, INVESTIRE
    (destinazione Valentino Egidi) e AFFITTARE (destinazione BOOM, in oro).
  - Ogni riga è un link. È lo stesso lessico dello scalo di BOOM (carta
    d'imbarco, /board): le due case parlano la stessa lingua.
  - Il tabellone fa due giri e si ferma. «Ferma il tabellone» lo blocca
    subito (WCAG 2.2.2).
- **Tesi**: «Prima i documenti. Poi il prezzo.» La selettività viene dal
  metodo, non da una scarsità inventata.
- **Caratteri, scelti e ospitati qui** (niente Google Fonts, licenza OFL in
  `egidi/fonts/OFL.txt`):
  - **Archivo** variabile, con l'asse della larghezza 62–125%: la prima riga
    del titolo «respira» da stretta a larga, la seconda è compressa e nera;
  - **JetBrains Mono** per le celle e le etichette.

  Insieme pesano circa 130 KB, con cache immutabile.
- **Il metodo recitato**: una sezione di 460vh con un palco fisso. Lo scroll
  sceglie l'atto e un modello 3D in CSS puro lo interpreta:
  1. valutazione: le stanze si accendono;
  2. documenti: i muri salgono e i fogli volano dentro;
  3. presentazione: il modello ruota;
  4. rogito;
  5. BOOM: tutto diventa oro, «Affittata con BOOM».

  Lo scroll non è dirottato; senza JavaScript i cinque atti sono uno sotto
  l'altro.
- **La macchina**: «Un'agenzia costruita come un software». Quattro
  micro-demo degli strumenti veri: firma digitale, fascicolo dell'immobile,
  valutazioni sui dati, visite nel Wallet. Ognuna è marcata «Esempio» o
  «Illustrazione».
- **Candidatura, non modulo contatti**: «Candida il tuo immobile» in quattro
  passi (intenzione → immobile → documenti in ordine su 6 → nome e tempi).
  - Alla fine si apre WhatsApp col riepilogo, parola per parola: dalla
    pagina non parte nessun dato.
  - Chi compra non dichiara documenti.
  - Chi sceglie «Affittare» va subito a BOOM.
- **Colori**:
  - blu elettrico `#2436F5` e notte `#070A2B` per Valentino Egidi;
  - nero `#060607` e oro `#FFD700` per BOOM;
  - carta `#F3F1EC` per le sezioni chiare.

  **Niente rosso**: il nome Valentino in rosso è la casa di moda, e la
  variante è stata tolta. In anteprima restano `?c=verde` e `?c=nero`.
- **Movimento ridotto**: tabellone già posato, bottone nascosto, modello in
  piedi.

## 3. Decisioni prese (default)
1. **Nessuna foto.** Monogramma VE finché non arriva una foto vera di
   Valentino. È la prima cosa da fornire: un brand col nome di una persona
   senza il suo volto resta vuoto.
2. **Calcolo del rendimento sui numeri del visitatore.** `/api/meteo` in
   produzione oggi ha zero zone.
3. **La candidatura finisce su WhatsApp.** Il modulo con salvataggio arriva
   col passo 4 (`/api/egidi-lead` e la guardia `isEgidi`).
4. **GA4 spento** finché manca l'ID della proprietà. Senza ID non c'è nulla
   da consentire.
5. **Sede operativa**: «Via dei Coronari 181/184», come la privacy di BOOM.

## 4. Criteri di accettazione (`tests/egidi`, 171 verifiche)
- **Test dei 5 secondi a 390×844**: tesi e riga AFFITTARE → BOOM sopra la
  barra WhatsApp.
- **Pagina**: nessuno scroll orizzontale da 320 a 1440 px, «VALENTINO EGIDI»
  su una riga, nessun errore JS.
- **Senza JavaScript**: il tabellone si legge e i cinque atti sono visibili.
- **Tabellone**: gira all'apertura, si posa sulle quattro parole giuste;
  AFFITTARE è oro, porta a BOOM e ha gli UTM; «Ferma» posa subito le parole,
  «Riavvia» lo riaccende.
- **Metodo**: lo scroll vero produce s1…s5 con l'atto giusto; i muri salgono
  sopra il pavimento; all'ultimo atto il modello dice BOOM; la testata resta
  scura.
- **Candidatura**:
  - i quattro passi in ordine;
  - il conteggio dei documenti;
  - il link WhatsApp uguale al riepilogo mostrato;
  - «Affittare» va subito a BOOM;
  - «Comprare» senza documenti;
  - COMPRARE dal tabellone preseleziona.
- **Caratteri**: woff2 veri, precaricati, caricati nel browser, licenza
  presente, zero richieste esterne.
- **Contrasto AA** per le tre varianti, comprese le celle del tabellone e il
  testo nebbia sulla notte. Oro solo su fondi scuri o sul blu.
- **Calcolo**: 250.000 € e 1.200 €/mese danno 5,8% lordo, 4,6% netto e
  14.400 € annui; col concordato il netto è 5,2%.
- **Regole di sostanza del brief, invariate**: nessun numero, recensione o
  immobile inventato; nessun «consulenza fiscale»; Entratel non citato;
  segnaposto solo in anteprima; home sotto 60 KB compressi.

Mutazioni verificate (rimetti il difetto, il test cade):
- «Affittare» a quattro passi;
- celle vuote senza JS;
- testata chiara sul metodo;
- bottoni nascosti visibili.

## 5. Cosa resta a te
| Domanda | Default se taci |
|---|---|
| Foto vera tua (e dello studio) | monogramma VE |
| Blu, verde o nero come accento | blu |
| Coronari 181 o 181/184 | 181/184 |
| Numero dell'ufficio attivo? | solo WhatsApp |
| Posso creare il progetto Vercel di anteprima (senza Git, niente DNS)? | nessun progetto |
| ID GA4 della proprietà | analytics spenti |
| Screenshot DNS e «I miei prodotti» di GoDaddy | nessun cambio DNS |

Invariato: nessun commit su main e nessun cambio DNS senza la tua conferma
esplicita.
