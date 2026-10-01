# egidimmobiliare.it: PRD della home «Valentino Egidi Immobiliare»

Stato al 30/09/2026 notte: quarta direzione (v4). La home in
`egidi/index.html` è in anteprima e va commentata.

Direzioni precedenti, ancora nella storia del ramo:
- **v1 «Il Fascicolo»** (commit `c9f463e`): carta, inchiostro, un solo movimento. Bocciata come troppo basilare.
- **v2** (commit `0ad494c`): verbo che gira, casa in assonometria nell'hero. Giudicata «carina», ma ancora da template.
- **v3** (commit `3c976a7`): tabellone Solari, metodo recitato da un modello 3D in CSS, candidatura su WhatsApp.

La v4 risponde a «possiamo costruire ancora di meglio: animazioni,
l'appartamento, più complesso, realistico, dinamico, appagante; ristudia anche
i colori».

## 1. Il brand e le due case (invariato)
- **Valentino Egidi Immobiliare** è il marchio delle vendite: vendere,
  comprare, investire a Roma. **BOOM** è il marchio degli affitti.
- Una società per entrambi, Egidi Immobiliare S.r.l.; il piede lo dichiara.
- **Il passaggio a BOOM è esplicito in sei punti**, ognuno con gli UTM
  `utm_source=egidimmobiliare&utm_medium=referral` e un `utm_campaign` suo:
  1. la riga AFFITTARE del tabellone, in oro;
  2. la voce di menu «Affittare → BOOM» (chip nero, testo oro);
  3. la sezione delle due case;
  4. l'ultimo atto del metodo;
  5. il calcolo del rendimento;
  6. la candidatura (scegliendo «Affittare» si va subito a BOOM) e i contatti.

## 2. Cosa cambia nella v4
### 2.1 I colori: «Inchiostro»
- Notte `#111D36`, notte-2 `#1B2A45`, accento `#173FA4`, accento chiaro
  `#96C0FE`, nebbia `#C5CEDE`, luce `#F2EFE8`, carta `#F4F0E8`, inchiostro
  `#0D1626`.
- Il blu della v3 (`#2436F5` su `#070A2B`) è stato tolto per due ragioni:
  - elettrico e saturo, faceva «tech» generico;
  - la notte era quasi nera: ΔE_OK 3,7 dal nero BOOM, quindi il passaggio
    all'atto BOOM non si vedeva. Oggi è ΔE_OK ≥ 11, verificato dai test.
- Sistema:
  - oro `#FFD700` solo su nero BOOM `#060607`;
  - niente rosso: il nome Valentino in rosso è la casa di moda.
- In anteprima, con `?c=`:
  - `persiana`, verde scuro delle persiane romane;
  - `travertino`, hero chiaro color pietra.

### 2.2 Il tabellone, meccanico davvero
- Ogni cella è una paletta che cade (WAAPI, `rotateX`) con ombre e rimbalzo
  finale. Le lettere scorrono in avanti sul tamburo, come in un Solari vero.
- Un orologio a palette segna l'ora di Roma e cambia al minuto.
- Il giro è uno solo; alla fine il bottone dice «Riavvia il tabellone».
  «Ferma» posa subito tutte le parole (WCAG 2.2.2) e lo ricorda alla visita
  dopo.
- Senza JavaScript le parole sono già scritte nell'HTML. Con movimento ridotto
  il tabellone è fermo e il bottone non c'è.

### 2.3 Il metodo: un appartamento vero in WebGL
- Sorgenti in `design/egidi-3d/`, fuori dal deploy:
  - `metodo3d.js` (la scena), `plan.js` (la pianta in metri), `textures.js`
    (pavimenti e fogli disegnati);
  - `build.mjs` e `shoot.mjs`.
- Pacchetto `egidi/js/metodo3d.js`: three.js 0.186.1 impacchettato qui con
  esbuild; licenza in `egidi/js/LICENSE-three.txt`.
- Si carica solo quando il metodo si avvicina allo schermo. La versione è nella
  query (`?v=` = primi 8 caratteri dello sha256, scritti nel manifest), quindi
  la cache può essere immutabile.
- Cinque atti su T = 0…5, dallo scroll (mai dirottato) e con una molla che
  segue il dito:
  1. **Valutazione.** Pianta in sezione; una linea di rilievo scorre e sotto
     di lei i pavimenti diventano spina, cotto e marmo. Quote ed etichette delle
     stanze. Totale: «85,6 m² calpestabili · circa 107 m² commerciali (DPR
     138/98, all. C)».
  2. **Documenti in ordine.** Arrivano visura, planimetria, APE e conformità.
     La planimetria si posa sui muri e un tramezzo del bagno, sulla carta,
     «non combacia» di 60 cm; si corregge **la carta**, non il muro. Poi il
     timbro «Planimetria aggiornata allo stato di fatto», e i muri salgono.
  3. **Presentazione.** Si aprono le persiane e le porte, entrano gli arredi
     stanza per stanza. La camera parte dal pianerottolo, entra dal portone e
     scatta tre foto, passando fra una stanza e l'altra sopra i muri tagliati
     (casa di bambola). I provini finiscono nella colonna del testo.
  4. **Trattativa e rogito.** La casa si richiude nel suo palazzo, disegnato a
     fil di ferro, vista da chi passa in strada. Tappe: proposta, verifiche,
     rogito.
  5. **La affitta BOOM.** Sera: muri neri, filo d'oro, finestre accese stanza
     per stanza (luce di casa, non oro). Il fondo della sezione vira al nero
     BOOM; pin «Oppure la affitta BOOM».
- Tutto ciò che conta è anche DOM: nomi, metri, documenti, timbro, tappe. La
  tela è `aria-hidden`.
- Il cartellino «Illustrazione · appartamento tipo, non in vendita» è sempre
  visibile.
- I metri stampati dalla pagina vengono dalla stessa pianta della scena
  (`PIANTA`), e i test li confrontano.
- **Poster al posto del 3D** (`egidi/img/metodo-1…5.webp`) in questi casi:
  - movimento ridotto, risparmio dati, meno di 4 GB di memoria, niente
    WebGL2;
  - pacchetto che non arriva, contesto grafico perso due volte, fotogrammi
    troppo lenti (una scala di qualità scende prima di arrendersi);
  - senza JavaScript: poster negli atti impilati.
- `?m3d=0` spegne il 3D, `?m3d=forza` lo accende anche senza GPU (test),
  `?m3d=diag` mostra le misure (solo in anteprima).

### 2.4 Il resto
- **Hero**: «Prima i documenti. Poi il prezzo.» in Archivo (stretto e nero
  sulla seconda riga); sotto, la tesi con BOOM nominato; poi il tabellone.
- **Sezioni**, in quest'ordine: due case; metodo; Valentino (targa); la
  macchina, cioè quattro micro-demo marcate «Esempio» o «Illustrazione»;
  calcolo; candidatura; contatti.
  - La firma della demo si prova col dito e il certificato mostra data, ora e
    dispositivo veri di chi prova.
  - Il calcolo mostra i risultati su palette.
  - La candidatura ha quattro passi e finisce su WhatsApp col riepilogo, senza
    server.
- **Testata**: trasparente sull'hero, chiara sulla carta, scura sulle sezioni
  notte, nera BOOM all'ultimo atto.

## 3. Decisioni prese (default)
1. **Nessuna foto.** Targa col nome finché non arriva una foto vera di Valentino.
2. **Calcolo sui numeri del visitatore.** `/api/meteo` oggi ha zero zone.
3. **La candidatura finisce su WhatsApp.** Il modulo con salvataggio arriva
   col passo 4 (`/api/egidi-lead` e la guardia `isEgidi`).
4. **GA4 spento** finché manca l'ID della proprietà.
5. **Sede operativa**: «Via dei Coronari 181/184», come la privacy di BOOM.
6. **L'appartamento è un tipo, non un immobile in vendita**, e lo dice.
7. **Palette Inchiostro** in produzione; le altre due solo in anteprima.

## 4. Criteri di accettazione (`tests/egidi`)
- **Pagina**: nessuno scroll orizzontale da 320 a 1440 px, «VALENTINO EGIDI»
  su una riga, nessun errore JS, zero richieste esterne.
- **Piega**: il bottone «Candida» sta entro 860 px a 1440×900 ed entro 828 px
  a 390×844. A 390 px la tesi e la riga AFFITTARE → BOOM stanno sopra la
  barra WhatsApp.
- **Stabilità**: CLS ≤ 0,02 mentre il tabellone gira.
- **Tabellone**:
  - gira con palette animate e si posa sulle quattro parole;
  - AFFITTARE è oro, va a BOOM e ha gli UTM;
  - «Ferma» posa subito e dice «Riavvia»; «Riavvia» riparte; a fine giro il
    bottone offre di rifarlo; fermo resta fermo alla visita dopo;
  - l'orologio segna l'ora di Roma.
- **Metodo senza 3D**: lo scroll porta ogni atto sulla sua posa; un atto per
  volta nel testo; il poster e il binario seguono l'atto; un tocco sul binario
  porta all'atto; testata scura e nera BOOM all'ultimo; la sezione dura meno
  schermi.
- **Metodo in 3D** (`?m3d=forza`):
  - la scena si monta e disegna, dentro il budget GPU;
  - le stanze si etichettano all'atto 1;
  - «Non combacia» appare all'atto 2 e i documenti si spuntano;
  - il pin BOOM appare all'atto 5;
  - se il pacchetto manca, restano i poster e le spunte, senza errori.
- **Pacchetto**:
  - lo sha256 corrisponde al manifest e la pagina chiede quella versione;
  - nessun segnaposto `00000000`; tutti i riferimenti con `?v=`;
  - ≤ 620 KB e ≤ 140 KB brotli, nessun server esterno nominato, licenza MIT;
  - cinque poster WebP 1200×900 ≤ 90 KB; cache immutabile su `/js` e `/img`.
- **Colori**:
  - contrasto AA in tutte e tre le palette, compresi hero, board, carta e
    notte;
  - ΔE_OK ≥ 11 fra notte e nero BOOM;
  - oro solo su fondi neri.
- **Macchina**: quattro schede, frecce da tastiera, fascicolo con una voce che
  manca, niente in ciclo.
- **Calcolo**: 250.000 € e 1.200 €/mese danno 5,8% lordo, 4,6% netto e
  14.400 € annui; col concordato il netto è 5,2%; le palette si posano su quei
  numeri.
- **Candidatura**: invariata dalla v3 (quattro passi, WhatsApp uguale al
  riepilogo, «Affittare» subito a BOOM, «Comprare» senza documenti,
  COMPRARE dal tabellone preseleziona).
- **Regole di sostanza del brief, invariate**:
  - nessun numero, recensione o immobile inventato (i metri sono
    dell'appartamento tipo, dichiarato);
  - nessuna «consulenza fiscale»; Entratel non citato;
  - segnaposto solo in anteprima;
  - home sotto 60 KB compressi.

Mutazioni verificate (rimetti il difetto, il test cade):
- celle del tabellone vuote senza JS;
- testata chiara sulla macchina;
- niente «Riavvia» a fine giro;
- notte quasi nera (ΔE_OK 7,8 dal nero BOOM);
- bottoni nascosti visibili nella candidatura;
- pin e mirino con la classe accesa ma invisibili (una regola CSS più pesante
  li teneva a opacità 0: trovato così, ora il test legge l'opacità calcolata);
- pin BOOM bianco invece che oro (stessa classe di difetto: il colore lo
  decideva la regola di base);
- versione del pacchetto sbagliata nella pagina.

## 5. Cosa resta a te
| Domanda | Default se taci |
|---|---|
| Foto vera tua (e dello studio) | targa col nome |
| Palette: inchiostro, persiana o travertino | inchiostro |
| Coronari 181 o 181/184 | 181/184 |
| Numero dell'ufficio attivo? | solo WhatsApp |
| Posso creare il progetto Vercel di anteprima (senza Git, niente DNS)? | nessun progetto |
| ID GA4 della proprietà | analytics spenti |
| Screenshot DNS e «I miei prodotti» di GoDaddy | nessun cambio DNS |
| Nota «conformità catastale al rogito (DL 78/2010, art. 19 c. 14)» nell'atto 2 | non stampata finché non la rileggi |
| Il 3D sul tuo telefono (`?m3d=diag`): fluido o a scatti? | scala di qualità automatica |
| Soggiorno 23,58 m² (5,75 × 4,10 = 23,575, arrotondato a metà in su come la cucina) | 23,58 |

Invariato: nessun commit su main e nessun cambio DNS senza la tua conferma
esplicita.
