# Magic Sign e affidabilità del portale — 13 ottobre 2026

## Decisione di prodotto

Magic Sign deve essere il luogo in cui Valentino prepara una firma e capisce chi manca, non un editor PDF da imparare. L'ingresso distingue un contratto BOOM già esistente da un documento esterno: il primo conserva il proprio flusso, il secondo usa un percorso guidato. Il dato non si ricopia e nessun link creato viene presentato come già inviato.

La priorità emersa dall'audit è la correttezza dei passaggi tra documento, firme e pagamento. Un'altra AI non correggerebbe gli errori rilevati: servono regole deterministiche, ricevute verificabili e azioni più chiare. Questo incremento non introduce chiamate a modelli, nuove dipendenze o automazioni periodiche.

## Evidenza e limiti

Baseline del prodotto: `ed25f4eecb6d57fb2d99173ce91637bd74ce971a`, già pubblicata per Home/strumenti. Il ramo `codex/magic-sign-rebuild-20261013` parte da questa versione e recupera la correzione custom `f2f1ccd` rimasta in un checkout separato. La proprietaria del lotto precedente ha confermato che non era live e che non sta modificando gli stessi file.

Verifiche: apertura autenticata della Home e dell'editor Magic Sign live; lettura del codice corrente; esecuzione degli handler con Firestore, Storage, Stripe e posta simulati, PDF generati con la libreria reale; regressioni di contratti, firme e pagamenti. Le simulazioni non firmano, incassano o inviano documenti a clienti reali.

L'audit copre i percorsi principali di firma, proposta, pagamento, consegna, aggiornamento del portale e preparazione AI. Non certifica ogni endpoint, la correttezza legale delle clausole, lo stato operativo di HOMIE/Telnyx/ElevenLabs o la completezza di tutti i dati importati. Le verifiche storiche sono indicate come tali: non valgono come prova di un rilascio attuale.

## Il percorso da consegnare

1. **Scegli:** contratto BOOM presente oppure PDF personalizzato. Su un contratto esistente si apre il flusso attuale, senza crearne un duplicato.
2. **Prepara:** documento e firmatari riconoscibili; nomi e indirizzi effettivi visibili. Un dato mancante si corregge prima di generare il link.
3. **Posiziona:** scegli il campo e tocca il documento. Il PDF si adatta al telefono; selezionare una firma non la cancella. Rimozione esplicita e annullamento.
4. **Controlla:** documento, destinatari e campi nello stesso riepilogo. Il comando dice “Crea link di firma”, perché non manda messaggi.
5. **Segui:** link pronti, firma parziale, PDF in preparazione/da recuperare e documento completo hanno significati distinti. Il completamento richiede un PDF effettivamente disponibile.

## Rilievi confermati sul punto di partenza

| Priorità | Difetto riprodotto | Correzione / intervento |
|---|---|---|
| P1 | Il custom accetta una firma senza consenso (`api/sign/custom/submit.js`). | Recuperare la patch esistente e verificare testo/impronta sul server. |
| P1 | Originale non disponibile: risposta `complete:true` senza PDF finale. | Separare raccolta firme e produzione PDF; nessuna conferma di completamento falsa. |
| P1 | Due firme concorrenti possono riportare lo stato da completo a parziale. | Precondizioni sulla versione Firestore, rilettura e finalizzazione esclusiva. |
| P1 | I byte dell'originale possono cambiare tra visualizzazione e firma. | Originale e campi congelati, impronta/versione verificata alla conferma. |
| P2 | Ripetere il submit dopo guasto PDF restituisce solo `already_signed`. | Recupero idempotente che conserva le firme e riprova la finalizzazione. |
| P1 | Il fallback legacy nel browser scrive firme direttamente su Firestore. | Rendere obbligatoria la pagina/server di firma; senza token valido fermare e spiegare il recupero. |
| P1 | Checkout fallito con importo dovuto permette la conversione in contratto. | Conversione automatica solo a dovuto zero; il pagamento verificato mantiene il proprio percorso. |
| P1 | Errore nel controllo di disponibilità non ferma accettazione e Checkout. | Errore esplicito e nessun avanzamento finché la disponibilità non è verificabile. |
| P1 aperto | Una proposta accettata può riprendere il Checkout anche se nel frattempo il lucchetto è passato a un'altra proposta pagata. Inoltre `_lock.js` assorbe alcuni errori interni di lettura. | Correggere insieme riacquisizione, precondizioni e recupero del lucchetto; il blocco degli errori propagati in questo ramo non risolve questo caso. |
| P1 | €900,49 + €119 diventano €1.019 al primo Checkout e €900 alla ripresa. | Un solo snapshot accettato, in centesimi, con le stesse voci anche sul retry e sul riepilogo. |
| P1 | Il verbale viene dichiarato firmato con nomi vuoti o immagini di firma illeggibili. | Validare prima di archiviazione e invio; nessun PDF “firmato” se una firma dichiarata manca. |
| P2 | Il journey dichiara avvenuto l'ingresso dalla sola decorrenza contrattuale. | Lotto successivo: usare la consegna attestata, distinguendo rinvio, decorrenza e ingresso. |
| P1 | Cambio account A → logout → B può conservare il profilo A nell'interfaccia. | Lotto sessione coordinato con il proprietario del boot; non è stato dimostrato un bypass delle autorizzazioni server. |
| P1 | Alcuni listener contratti/manutenzioni/firme smettono di aggiornare senza avviso utile. | Lotto dati: freschezza per fonte, recupero e una sola sottoscrizione per sessione. |
| P2 | Una vecchia lettura lazy di Inbox può sostituire dati realtime più recenti e svuotare la bozza. | Lotto dati: scarto dei risultati obsoleti e percorso di refresh che preserva la composizione. |
| P2 | Il conteggio AI avviene dopo il consumo, non è un tetto preventivo globale. | Lotto costi: prenotazione atomica del budget prima della chiamata, inclusi retry e fallback. |
| P2 | Il contesto dell'AI omette alcuni stati canonici di firma, registrazione e disponibilità. | Lotto contesto: portare fatti e riferimenti verificati, senza dedurre lo stato da riassunti. |

## Cosa conservare

- Contratti BOOM e relativi modelli, firme per ruolo, deleghe/mandati e token separati: non sostituirli con copie di PDF scollegate.
- Conversione deterministica `pa_<id>`, controllo dei pagamenti già registrati e revisioni atomiche della manutenzione.
- Ricerca tipizzata della Home, fascicoli esistenti e fonti canoniche. Il nuovo editor è un ingresso a questi strumenti, non un archivio alternativo.
- Pausa intenzionale di HOMIE e limiti dell'automazione. Nessun riavvio necessario per usare il nuovo Magic Sign.

## Ordine dei lavori oltre Magic Sign

1. **Chiudere firma e denaro:** nuovo editor e correzioni riprodotte in questo ramo, preview su dati sintetici, verifica regressioni e rilascio coordinato. Resta prioritario il lucchetto alla ripresa del pagamento: i test attuali non certificano l'intero ciclo di disponibilità.
2. **Rendere affidabile ciò che leggi:** isolamento della sessione, aggiornamento delle fonti e conservazione delle bozze. Senza questo, “tutto interconnesso” può mostrare informazioni vecchie.
3. **Automatizzare solo su fatti e budget:** consegna reale prima del journey, budget prima dell'AI, stato canonico nel contesto. La misura utile è un'attività conclusa senza tuo intervento, non il numero di messaggi prodotti.

## Accettazione essenziale

- **Contratto già in BOOM:** lo selezioni e raggiungi le firme del record corretto; nessun secondo contratto, nessun messaggio inviato durante l'apertura.
- **PDF dal telefono:** scegli due firmatari, posizioni le firme con tap, correggi un campo e controlli il riepilogo; i link sono per le persone mostrate e un retry non crea una seconda richiesta.
- **Guasto o ambiguità:** originale modificato, destinatario incompleto, firme simultanee o Storage indisponibile non producono “completo” falso. Le firme valide restano recuperabili e l'interfaccia indica cosa manca.

## Stato della consegna

Implementazione completata sul ramo `codex/magic-sign-rebuild-20261013`; produzione non modificata. Preview locale: `http://127.0.0.1:8799/`, con il vero editor e PDF.js 3.11.174, contatti sintetici e servizi simulati. I link della preview non arrivano a clienti.

Verifiche completate: 26 controlli browser del nuovo editor a 1280/390 px; 17 scenari degli handler custom e 7 mutazioni; 3 prove della pagina firmatario collegata agli handler reali; 14 controlli del pannello dei contratti BOOM; 14 scenari Checkout più 5 mutazioni; 30 controlli del verbale più 2 mutazioni. Sono passate anche le regressioni di denaro, consenso proposta, blocchi, stato proposta, commissioni, parità, mandati, notifiche, token, finalizzazione, PDF contratto, download, firme, lingua e revisioni. Sintassi: 103 pagine, 72 file JS e vercel.json validi.

Le prove di rete sono simulate: nessun addebito, invio o firma reale. La CI remota e un collaudo autenticato del candidato restano verifiche distinte; non sono implicite nei risultati locali. L'audit conserva gli aperti P1: soprattutto disponibilità alla ripresa del pagamento, isolamento delle sessioni e fonti che smettono di aggiornarsi. Il nuovo editor non rende automaticamente risolti questi problemi.

### Limiti espliciti del nuovo protocollo

- I PDF nuovi sono congelati sul server prima della firma. Il completamento non dipende più dal solo arrivo dell'ultima firma.
- Le richieste custom precedenti senza firme si aggiornano con un'azione esplicita, mantenendo i token se i dati coincidono. Richieste già parzialmente firmate senza una vecchia impronta verificabile richiedono revisione: non si inventa retroattivamente la prova del documento visto. I PDF già completati restano consultabili.
- In questo primo lotto i PDF con rotazione nei metadati o ritaglio non standard vengono rifiutati con un rimedio esplicito, per evitare firme spostate. Non si dichiara supporto a qualunque impaginato. Il percorso dei contratti BOOM resta quello esistente.
- L'email di copia resta best-effort con stato distinto; il recupero del PDF non deve duplicare automaticamente le comunicazioni.
