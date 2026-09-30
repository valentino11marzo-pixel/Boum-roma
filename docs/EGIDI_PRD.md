# egidimmobiliare.it: PRD della home «Valentino Egidi Immobiliare»

Stato al 30/09/2026 sera: seconda direzione. La home in `egidi/index.html` è
in anteprima e va commentata. La prima direzione («Il Fascicolo»: carta,
inchiostro, un solo movimento) è stata bocciata dal fondatore perché troppo
basilare. Una copia resta nella storia del ramo (commit `c9f463e`).

## 1. Il brand e le due case
- **Valentino Egidi Immobiliare** è il marchio delle vendite: vendere,
  comprare, investire a Roma. **BOOM** è il marchio degli affitti.
- Una società per entrambi: Egidi Immobiliare S.r.l. Il piede lo dichiara:
  «Valentino Egidi Immobiliare è un marchio di Egidi Immobiliare S.r.l.».
- **Il passaggio a BOOM è esplicito in cinque punti**:
  1. nell'hero, sul verbo «Affitta»;
  2. nella voce di menu con il punto oro;
  3. nella sezione «Vendere è Valentino Egidi. Affittare è BOOM.»;
  4. nel calcolo del rendimento;
  5. nei contatti.

  Ogni link porta gli UTM `utm_source=egidimmobiliare&utm_medium=referral`,
  con `utm_campaign` diverso per punto.

## 2. Il linguaggio
- **Colori**: blu elettrico `#2436F5` per Valentino Egidi, nero `#060607` e
  oro `#FFD700` per BOOM, carta `#F4F2EE` per il fondo delle sezioni.
- **Carattere**: Helvetica Neue a pesi 200–300, titoli giganti, monospace per
  le etichette. Nessun font da scaricare.
- **Hero**:
  - il verbo gira: Vendi → Compra → Investi → Affitta;
  - su «Affitta» tutto diventa BOOM: nero, oro, pillola «BOOM affitta per te»;
  - a destra un appartamento in assonometria 3D, in CSS puro: i muri si alzano
    all'apertura e il modello segue il mouse;
  - fa due giri e si ferma su «Vendi»; il bottone «Ferma le animazioni» lo
    blocca subito (WCAG 2.2.2).
- **Il resto della pagina**:
  - nastro scorrevole;
  - le due case affiancate, che si allargano al passaggio del mouse;
  - quattro carte del metodo che si impilano allo scroll (sticky, senza
    dirottare lo scroll);
  - calcolo del rendimento;
  - check a 8 voci con anello di progresso;
  - Valentino;
  - contatti.
- **Movimento ridotto**: tutto fermo e al suo posto. Senza JavaScript la
  pagina è intera.
- **Varianti colore in anteprima**: `?c=rosso` e `?c=verde`, per confrontare
  l'accento senza pagine in più. In produzione esiste solo il blu scelto.

## 3. Decisioni prese (default)
1. **Nessuna foto.** Il ritratto è un campo blu col monogramma VE finché non
   arriva una foto vera di Valentino. Un brand col nome di una persona senza
   il suo volto resta vuoto: è la prima cosa da fornire.
2. **Il calcolo del rendimento lavora sui numeri del visitatore.** Mostra
   rendimento lordo e netto dopo la cedolare al 21% o al 10%. Il dato di
   mercato di BOOM (`/api/meteo`) in produzione oggi ha zero zone, quindi un
   calcolo «live» non mostrerebbe nulla. Il canone vero lo chiede a BOOM
   (UTM `investire`).
3. **Il modulo contatti non c'è ancora.** WhatsApp resta l'azione unica. Il
   modulo arriva al passo 4 con `/api/egidi-lead` e la guardia `isEgidi`.
4. **GA4 spento** finché manca l'ID della proprietà. Senza ID non si chiede
   consenso per niente.
5. **Sede operativa**: «Via dei Coronari 181/184», come la privacy di BOOM.

## 4. Criteri di accettazione (`tests/egidi`, 122 verifiche)
- **Test dei 5 secondi a 390×844**: brand, Roma e BOOM leggibili sopra la
  barra WhatsApp.
- **Nessuno scroll orizzontale** da 320 a 1440 px, «VALENTINO EGIDI» su una
  riga, nessun errore JS.
- **Hero**:
  - i muri salgono sopra il pavimento (verificato anche per mutazione);
  - su «Affitta» il fondo diventa `#060607`;
  - la pillola BOOM non copre bottoni;
  - «Ferma» funziona.
- **Movimento ridotto**: fermo, muri alzati, pin visibili.
- **Contrasto AA** per ogni coppia di testo e per le tre varianti di accento.
  Oro solo su fondi scuri o sul blu.
- **Calcolo esatto**: 250.000 € e 1.200 €/mese danno 5,8% lordo, 4,6% netto
  e 14.400 € annui; col concordato il netto è 5,2%.
- **Check**: nessun riepilogo prima della prima risposta, poi il conteggio
  corretto.
- **Contenuti**: segnaposto solo in anteprima, zero richieste esterne, home
  sotto 60 KB compressi.
- **Regole di sostanza del brief, invariate**: nessun numero, recensione o
  immobile inventato; nessun «consulenza fiscale»; Entratel non citato.

## 5. Cosa resta a te
| Domanda | Default se taci |
|---|---|
| Foto vera tua (e dello studio) | monogramma VE |
| Blu, rosso o verde come accento | blu |
| Coronari 181 o 181/184 | 181/184 |
| Numero dell'ufficio attivo? | solo WhatsApp |
| Un dominio col tuo nome (valentinoegidi.it) che rimanda qui? | nessuno |
| ID GA4 della proprietà | analytics spenti |
| Screenshot DNS e «I miei prodotti» di GoDaddy | nessun cambio DNS |

Invariato: nessun commit su main e nessun cambio DNS senza la tua conferma
esplicita.
