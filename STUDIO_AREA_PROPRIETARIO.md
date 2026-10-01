# STUDIO — L'area proprietario come prodotto (1 ottobre 2026)

> La richiesta: «elevare il design a qualità altissima — animazione,
> micro-design che soddisfa, stilizzazione, un badge 3D per ogni sezione —
> un prodotto vero, da lanciare, che CONVERTE. Chiaro, facile, che dà
> dipendenza.» Questo studio dice cosa significa davvero ognuna di quelle
> parole per QUESTA pagina, cosa si costruisce e cosa si rifiuta.

## 0. Le tre obiezioni, prima del design

1. **Una pagina dietro il login non converte nessuno.** /owner la vede solo
   chi è già cliente: il proprietario che deve ancora decidere non la vede
   mai. Il convertitore vero è una **demo pubblica dell'area vera**
   (`/owner?demo=1`): stessa pagina, stesso motore
   (`js/owner-vault-engine.js`), dati di esempio dichiarati — non un
   mockup. Il prospetto vede ESATTAMENTE il prodotto che riceverà.
2. **La pagina che oggi dovrebbe convertire (owners.html) vende un prodotto
   che non esiste.** Il "device" mostra `app.boomrome.com/proprietari`
   (dominio inesistente), «Occupazione 96% — media annua» (numero
   inventato), e la sezione Portale promette approvazione preventivi
   online, ticket manutenzione con foto, alert di pagamento in ritardo,
   ispezioni programmate, promemoria rinnovo APE — niente di questo c'è.
   Un proprietario che firma per quelle promesse e poi apre l'area vera
   scopre un altro prodotto: il primo giorno di rapporto è una delusione.
   Si correggono le promesse e il bottone porta alla demo.
3. **"Dipendenza" in un'area che si apre una volta al mese non viene da
   streak, badge-trofeo o notifiche finte.** Viene da tre anelli ONESTI:
   (a) *c'è sempre qualcosa di nuovo quando BOOM ha lavorato* — «dalla tua
   ultima visita: 2 documenti, 1 canone incassato»; (b) *il fascicolo si
   completa* — 2/4 → 3/4, con la soddisfazione del cerchio che si chiude;
   (c) *i soldi si vedono crescere* — dodici barre d'oro che si riempiono
   mese per mese. Niente che il dato non possa sostenere.

## 1. Il lavoro della pagina (in ordine)

1. «Devo fare qualcosa?» — UNA riga in testa, con l'orbe di stato.
2. «Cosa è cambiato?» — il digest dall'ultima visita.
3. «Come vanno i soldi?» — il numero in gestione, l'incassato dell'anno,
   l'atteso, gli arretrati; e il polso di 12 mesi.
4. «Le mie case» — una carta per immobile, con volto (foto o facciata).
5. «I miei documenti» — la cassaforte, cartelle + ricerca + "Nuovi".
6. «Parlo con qualcuno» — WhatsApp sempre a un tocco (dock su telefono).

## 2. Il sistema visivo

- **Stanza**: vuoto `#050506`, oro `#D4AF37` (il portal, non il `#FFD700`
  del sito pubblico), Helvetica Neue 300, filo d'oro in testa ai pannelli.
- **Emblemi (il "badge 3D")** — un medaglione per sezione, in **CSS 3D +
  SVG**, non WebGL: zero librerie, zero peso, nessun rischio Safari (la
  lezione di Cesium/Photoreal: 3MB scaricati per fallire). Due metalli,
  e il metallo È gerarchia:
  - **oro pieno** = richiede te (l'unico emblema che chiede un'azione);
  - **ossidiana con bordo d'oro** = sezioni normali.
  Faccia con bevel (`inset` chiaro in alto, scuro in basso), riflesso
  speculare che segue il puntatore, glifo inciso (tratto 1.6 su griglia
  24). Entrata: si "conia" (rotateY −70° → 0, scala .86 → 1, 700ms), un
  riflesso la attraversa una volta. Inclinazione ±12° col puntatore solo
  su `pointer:fine`. `prefers-reduced-motion` → fermo.
- **Icone**: un set SVG unico (sprite inline) al posto delle emoji. Le
  emoji cambiano da un sistema all'altro e su un archivio legale sembrano
  un giocattolo.
- **Facciate**: un immobile senza foto riceve un'illustrazione generata
  (facciata romana: piani, finestre, arco del portone) derivata dall'id —
  ogni casa ha il suo volto, stabile, e non è MAI spacciata per una foto.
  Con `heroPhoto`/`photos` (Photo Studio del portal) si usa la foto vera.

## 3. Il movimento (un sistema, non effetti)

| momento | durata | curva | regola |
|---|---|---|---|
| entrata sezione | 600ms | `cubic-bezier(.16,1,.3,1)` | sfasata 60ms, una volta |
| conio emblema | 700ms | `cubic-bezier(.2,1.4,.4,1)` | solo al primo ingresso |
| numeri | 900ms | easeOutExpo | testo finale nel DOM per lettori e test |
| barre | 700ms + 35ms/barra | ease | crescono dalla base |
| pressione | 120ms | ease | scale .97 |
| casa → dettaglio | View Transitions | — | la facciata si trasforma nell'eroe; senza API, dissolvenza |
| caricamento riuscito | 650ms | — | scintille d'oro + anello che avanza |

Tutto si spegne con `prefers-reduced-motion: reduce`. Nessun movimento in
loop tranne l'orbe di stato (respiro lento, 3.2s).

## 4. Il grafico dei canoni (procedura dataviz)

- **Forma**: cambiamento nel tempo di una grandezza → barre mensili, 12
  mesi (9 passati, il corrente, 2 futuri: il prossimo canone conta).
  I numeri di testa stanno nei riquadri, non sopra le barre.
- **Colore per lavoro = STATO**: incassato oro `#D4AF37`, in ritardo rosso
  `#E5484D`, in arrivo = **barra cava** (forma, non un terzo colore).
  Validatore (`validate_palette.js`, superficie `#0B0B0C`): oro vs il
  vecchio corallo `#FF8A70` **fallisce** (ΔE 4.8 deutan, 13.8 normale) →
  rosso `#E5484D`: ΔE 14.3 deutan, 23.8 normale, contrasto ≥ 3:1. La
  banda di luminosità fallisce sull'oro del marchio ma è un controllo da
  palette categoriche: qui sono stati, accompagnati SEMPRE da icona +
  etichetta (legenda e tooltip).
- **Segni**: barre sottili, 4px arrotondati in cima, ancorate alla base,
  2px di spazio fra segmenti impilati; mese corrente segnato con un punto.
- **Interazione**: tooltip al passaggio/tocco su ogni barra (mese, importi
  per stato). **Accessibilità**: `role="img"` con riassunto + tabella
  equivalente per lettori di schermo.

## 5. La demo che converte (`/owner?demo=1`)

- Stesso file, stesso motore: i dati d'esempio passano da `buildVault`
  come quelli veri. Nessuna chiamata a Firebase o alle API.
- Nastro fisso «Esempio dal vivo — dati di prova» + «Voglio quest'area per
  la mia casa» (WhatsApp col testo pronto).
- I documenti si aprono in un avviso («nell'area vera qui si apre il PDF»),
  il caricamento finge il successo (si vede il fascicolo completarsi) —
  mai un link a un file inesistente.

## 6. Cosa NON si fa

- Niente WebGL, niente librerie d'animazione, niente font nuovi.
- Niente gamification finta: niente streak, livelli, trofei.
- Niente «Nuovo» al primo accesso (sarebbe tutto nuovo, cioè niente).
- Niente numeri animati che restano a metà: il valore finale è sempre nel
  DOM, l'animazione è solo uno strato.
- Niente movimento che blocca la lettura: ogni animazione è < 1s e si
  salta da sola se la scheda è nascosta.
