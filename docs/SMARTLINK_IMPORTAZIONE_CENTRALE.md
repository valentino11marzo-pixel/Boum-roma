# SmartLink · lettore centrale BOOM

## Ripresa autonoma · 21 ottobre 2026

Il collegamento SSH temporaneo del 20/10 non esiste più. La connessione non interattiva al Mac BOOM è stata rifiutata; l'agente SSH locale non ha chiavi. Non sono state cercate password, cambiate autorizzazioni o riaperte le prove DevTools. Il Portal in Chrome conserva invece una sessione admin utilizzabile per il collaudo.

Nuovo percorso preparato: `/api/smartlink/extract` cerca prima in `smartlinks` le schede attive con lo stesso URL canonico. Restituisce soltanto foto Storage e dettagli essenziali, marcati come archivio e con data originale. Riordino/copertina e nuova pubblicazione riusano i file esistenti: nessun download dalla fonte o upload dal telefono. `create` rilegge il riferimento e verifica sorgente, stato attivo e appartenenza di ogni foto; la data non diventa artificiosamente quella di oggi. Nessuna collection, credenziale, libreria o API commerciale nuova.

L'importazione principale non chiama l'estensione. Tolta la guida ZIP/installazione dal Portal; chi dispone già del collegamento trova solo un'alternativa esplicita. Una fonte nuova non leggibile e senza archivio resta non importabile. Questo miglioramento non dimostra il recupero universale o il funzionamento del lettore centrale, ancora spento. Lettura HTTP CasaFari del 21/10 non conclusa entro 15 secondi: non attribuire un CAPTCHA senza averlo osservato.

Test: suite SmartLink, Actions e Crawl passate; 100 pagine/85 JS validi. Rimozione intenzionale del controllo stesso annuncio → test fallisce con pubblicazione 201 al posto di 400; controllo ripristinato e suite nuovamente verde. Rilascio e prova autenticata vanno registrati dopo l'esecuzione.

## Rilascio graduale completato · 20 ottobre 2026, ore 23:03

Su richiesta esplicita di Valentino di pubblicare senza attendere la prova interna Immobiliare, PR #300 unita a main: `47dfeea9f84a8d2c8f15e845fc5366a49b8e6d56`. L’albero Git è identico all’head testato `d52b5e4b` (CI completa verde, run `39491561285`). Produzione Vercel `dpl_HKKNowXi5tVdZynYdTuJbDKwKEEU`, progetto `valentino-boom/boum-roma`, READY, dominio `www.boomrome.com`, build 57 s. Nessun deploy manuale dal ramo.

`SMARTLINK_REMOTE_ENABLED` confermato assente in produzione; servizio Homie fermo. Sono live UI/mappa e percorso diretto precedente; la generazione centrale senza Chrome resta inattiva. Rules/Storage distribuite dal job `deploy-rules` del run `39497016074`; indice centrale ancora da distribuire prima dell’attivazione.

Controlli sul dominio: nove asset confrontati byte per byte con la revisione di rilascio, tutti identici; API jobs/worker senza credenziali 401; sorgenti tools/docs 404. Scheda esistente `6DqPja5V0WC6iFrtO00o`: API 200, 12/12 WebP raggiungibili, nessun URL fonte né identità operatore. Browser senza login: galleria 1→2/12 corretta; mappa con 40 POI, filtro Trasporti con 7 risultati. Query errori runtime delle API SmartLink sul nuovo deploy: nessun record restituito nella finestra del rilascio. Non è un nuovo collaudo autenticato di importazione o dell’account assistente.

Le note sotto registrano la diagnosi prima del rilascio e i prerequisiti della futura attivazione centrale.

## Stato precedente al rilascio del 20 ottobre 2026

Implementazione sul ramo `codex/smartlink-remoto-mappa`, PR #300. Il precedente adattatore API immobiliare è stato rimosso su richiesta di Valentino. Nessun abbonamento o credenziale di un fornitore immobiliare è necessario per questa implementazione.

**Non ancora attivo nel Portal pubblico. Lettura reale da Homie verificata su CasaFari; ancora bloccata sull'annuncio Immobiliare richiesto.** Il runtime è installato su Homie, con browser dedicato e servizio predisposto ma non avviato. La prova Chrome del 17/10 riguardava l'estensione locale. La preview locale a porta 4181 verifica il componente mappa, non importa annunci.

### Prove della ripresa del 20/10

Ramo riallineato senza conflitti a `origin/main` `0da2bd42` (PR #301 email-pratica conservata). CI completa della revisione `18bfec0a`, inclusa assistenza/rilascio graduale: static-checks, firestore-rules, smoke, full-suite e Vercel superati (run `39479168154`). Non equivale al collaudo della fonte.

| Prova | Esito reale | Limite della prova |
|---|---|---|
| Homie → Immobiliare `124483437` | `needs_attention/source_blocked`, 0 foto, 4.138 ms | Resta da risolvere prima dell’attivazione centrale |
| Homie → CasaFari via Piave, share `23310686611` | Dopo correzione: `ready`, 6 foto su 6, cinque campi valorizzati, 2.357 ms | Prova lettura; non dimostra ancora upload e pubblicazione dal Portal |
| Scheda BOOM esistente `6DqPja5V0WC6iFrtO00o` | API 200, 12/12 foto scaricabili, WebP, nessuna fonte/identità operatore nel record pubblico | Conferma durata dell'archivio precedente, non nuova importazione |
| Sessione operatore | Valentino autenticato admin: importazione nel Portal pubblico senza estensione fermata dal blocco della fonte, zero foto | Prova del percorso precedente; nuovo percorso centrale e account assistente ancora pendenti |
| Accesso alla sessione Homie | Connessione autorizzata; tentativo del 20/10 alle 22:17:17: autenticazione `boomserver` riuscita, poi rifiuto grafico | Client: `server is unable to read/access the screen`; server: `screenCapture flag 0`, `postEvents flag 0`. MDM assente. Nessuna verifica della fonte completata |

Difetto CasaFari riprodotto sulla pagina reale: il parser escludeva il CDN originale Immobiliare e leggeva il prezzo come titolo. Ora usa h2/h1 del template, soltanto le immagini `Property photo`, apre la galleria e verifica il totale dichiarato. La prima correzione recuperava solo 5/6; la navigazione della galleria ha recuperato anche la sesta. Il controllo su foto mancanti è coperto da test di regressione.

Prima dell’autorizzazione finale al rilascio graduale, il blocco Immobiliare aveva fermato la pubblicazione. Il servizio persistente e il flag restano spenti anche dopo il rilascio della UI. La UI ora seleziona esplicitamente il percorso attivo: a flag spento conserva l'importazione precedente, a flag acceso usa la coda. Questo consente il rilascio graduale senza imporre un lettore disabilitato.

## Esperienza prevista

1. Portal → Strumenti → SmartLink esterno → incolla URL → Importa annuncio e foto.
2. La richiesta è salvata; si può chiudere la pagina e riprenderla da **Le tue importazioni recenti**, con lo stesso account anche su un altro dispositivo.
3. Homie legge l'annuncio in un browser standard. Il server scarica le fotografie, le converte in WebP e le archivia su BOOM. Lo Studio mostra fino a 12 foto, ordine e copertina modificabili. Nessuna estensione è richiesta sul telefono o sul computer dell'operatore.
4. L'operatore verifica dati e area della mappa, poi crea lo SmartLink. L'importazione non pubblica da sola e non invia messaggi.
5. La scheda pubblica non espone URL sorgente o identità dell'operatore. Le foto possono conservare i watermark già presenti nella fonte.

L'accesso è ancora **admin-only**. L'assistente deve usare un proprio account già abilitato; non viene creato un nuovo ruolo né condivisa la password di Valentino. La cronologia delle importazioni è personale. Integrazione con ricerche/clienti PFS da realizzare successivamente.

## Affidabilità e limiti

- Firestore è l'unica coda. ID deterministico per operatore e bozza: un doppio clic non duplica il lavoro.
- Un solo lettore possiede una richiesta; assegnazione atomica con lease di cinque minuti. Interruzioni: massimo due tentativi, poi esito visibile. Richieste ferme oltre un'ora scadono.
- Un ACK perso ritenta la ricevuta, senza rileggere l'annuncio. Un risultato vecchio non può sovrascrivere la nuova assegnazione.
- Foto archiviate prima dello stato pronto. Fallimento parziale dichiarato; zero foto non produce una scheda pronta. Il telefono non deve ricaricare le immagini già archiviate.
- 401/403/429, verifica umana o cambio dell'URL diventano un esito esplicito. Nessun tentativo di risolvere CAPTCHA, aggirare restrizioni, copiare cookie personali o usare proxy.
- Il Mac deve essere acceso, collegato a Internet e con sessione grafica attiva. L'avvio tramite LaunchAgent avviene al login, non prima. Dopo un riavvio senza login il lettore risulta offline.
- L'accessibilità della fonte e il suo DOM restano dipendenze esterne. Non promettere «sempre funzionante», zero manutenzione o copertura dei cinque portali prima delle prove. Il parser riusa quello già presente; gli aggiornamenti delle pagine possono richiedere adattamenti.
- La riduzione di manutenzione misurata riguarda l'archivio: le foto già copiate continuano a funzionare senza riaprire la fonte. La cache Radar del vecchio percorso può aiutare solo per annunci già acquisiti; non risolve la prima lettura di un nuovo annuncio bloccato. Non è stata verificata una copia Radar del link richiesto in questa ripresa.

## Diagnosi ripetibile

Sul Mac, dalla directory runtime:

```sh
/opt/homebrew/bin/node worker.mjs --probe 'https://www.immobiliare.it/annunci/124483437/'
```

Usa lo stesso browser, profilo e parser del servizio; chiude il browser al termine e non crea richieste né schede. Esce con codice 0 solo per una lettura pronta, altrimenti 1. Stampa soltanto stato, codice errore, numero di immagini, nomi dei campi presenti e millisecondi. Non avviarlo mentre il servizio usa lo stesso profilo. `ready` in questo comando significa «pagina letta», non «foto archiviate e scheda pubblicata».

Un blocco di accesso richiede un controllo umano della sessione dedicata sul Mac prima di una nuova prova. Completare una verifica non garantisce che la fonte non la richieda di nuovo. Dopo un cambiamento del DOM, usare una regressione del template e confrontare il numero di foto con la galleria, senza allargare la lettura a immagini estranee.

Per il controllo personale, con servizio e probe fermi:

```sh
/opt/homebrew/bin/node worker.mjs --assist 'https://www.immobiliare.it/annunci/124483437/'
```

Apre la pagina nel profilo dedicato e la lascia al responsabile; termina quando la finestra viene chiusa. Non estrae dati, non risolve verifiche e non crea job. Modalità assistenza copiata sul Mac (hash e sintassi verificati), testata nel codice, non ancora eseguita.

Diagnosi successiva al rifiuto segnalato da Valentino: i log confermano autenticazione riuscita e utente autorizzato al gruppo schermo. Il servizio rifiuta invece lettura/controllo grafico; non chiedere ancora la password come presunta soluzione. `profiles status -type enrollment`: MDM assente. Nessuna password, autorizzazione o protezione modificata. Passaggio richiesto: accesso grafico al Mac mini per verificare/riattivare Condivisione schermo, mantenendo l'accesso limitato all'utente esistente; poi nuovo collaudo. [Procedura Apple](https://support.apple.com/it-it/guide/mac-help/mh11848/mac/1000). [Limiti dell'attivazione da riga di comando](https://support.apple.com/en-bw/guide/remote-desktop/apd8b1c65bd/mac). Il listener attivo da solo non dimostra il permesso di acquisizione dello schermo.

Prova alternativa richiesta via SSH: browser dedicato con porta 9441 solo loopback, inoltro SSH locale e scadenza di 30 minuti. L'utente ha aperto manualmente Chrome Inspect (pagina interna bloccata dalla policy dello strumento browser) e confermato la vista remota alle 22:32. Alle 22:37 il CAPTCHA ha richiesto la chiusura di DevTools: questa vista non permette di completare la verifica di Immobiliare. Nessun tentativo di nascondere DevTools o risolvere automaticamente il CAPTCHA. Browser di assistenza e inoltro chiusi; verifica finale: nessun listener 9441 sui due Mac, processo terminato correttamente. Questo metodo non è una soluzione all'importazione richiesta e non va presentato come collaudo riuscito. Non sono stati trovati AnyDesk, TeamViewer, RustDesk, Chrome Remote Desktop Host, Jump Desktop Connect o Splashtop Streamer nei percorsi standard controllati.

## Componenti e necessità

- `api/smartlink/jobs.js`: invio/ripresa privata, massimo cinque richieste pendenti per operatore (limite di cortesia, non transazione globale).
- `api/smartlink/worker.js`: autenticazione Homie, assegnazione atomica e ricevuta. `maxDuration: 180` per archiviare fino a 12 foto.
- `js/smartlink-import-engine.js`: stati, scadenze, lease e proiezione senza token.
- `api/smartlink/_archive.js`: Sharp già presente nelle dipendenze root/API, massimo 2400 px, metadati rimossi, CDN consentiti e nessun redirect.
- `smartlinkImports` e `smartlinkWorkers`: nuove collection admin-only, necessarie per ripresa e stato del lettore. Indice `createdBy + createdAt DESC` in `firestore.indexes.json`.
- `SMARTLINK_REMOTE_ENABLED=1`: nuova variabile server, necessaria come interruttore. Assente/0 ferma nuove richieste e nuove assegnazioni; una ricevuta già in corso può terminare. La capability admin può essere letta prima del deploy delle regole/indice. Flag spento: nuove importazioni via extract/Radar/Chrome opzionale, con pagina aperta; storico centrale precedente ancora consultabile. Capability irraggiungibile/sconosciuta: nessuna importazione avviata.
- `HOMIE_SECRET`: già esistente, letto solo da `~/.boom/env` sul Mac; non copiato nel repo o nel browser.
- Playwright 1.64.1: nuova dipendenza **solo del runtime Mac**, necessaria per eseguire il browser. Il relativo lockfile è in `tools/smartlink-worker`; non aumenta le dipendenze delle funzioni Vercel. Browser scaricato dalla distribuzione ufficiale Playwright.

## Installazione e rilascio

Il rilascio del Portal segue AGENTS.md: merge su `main` da Valentino/regia, niente deploy manuali di produzione da questo ramo.

1. Dopo CI e revisione, rilasciare PR #300 con flag assente/0: la UI conserva il percorso precedente. La CI attuale distribuisce rules/storage, **non gli indici**: distribuire anche l'indice di `firestore.indexes.json` e attenderne lo stato pronto.
2. Configurare il flag server nell'ambiente scelto e verificare la distribuzione che lo contiene. Una Preview usa lo stesso progetto Firebase: senza nuove rules/index il percorso resta bloccato; non è un database isolato.
3. Su Homie il runtime è in `~/.boom/smartlink-runtime/tools/smartlink-worker/`, configurazione `~/.boom/smartlink-reader.json`. Il plist `~/Library/LaunchAgents/com.boom.smartlink-reader.plist` è predisposto, **non caricato**.
4. Eseguire `node worker.mjs --check` dalla directory runtime: controlla browser installato e heartbeat autenticato. Il secret resta sul Mac. Una Preview protetta richiede la modalità di accesso Vercel autorizzata, senza disattivare la protezione.
5. Dopo il check, avviare il servizio con `launchctl bootstrap gui/$(id -u) "$HOME/Library/LaunchAgents/com.boom.smartlink-reader.plist"`. L'installer `install.mjs` è idempotente sui file, prepara il servizio senza avviarlo; `--enable` è separato.
6. Stop immediato: flag a 0 e `launchctl bootout gui/$(id -u)/com.boom.smartlink-reader`. I dati restano in Firestore. Log locali contengono solo eventi e ID richiesta, mai URL o segreti.

## Collaudo prima della consegna

- Annuncio reale `https://www.immobiliare.it/annunci/124483437/` e un annuncio nuovo: esito, numero foto e tempi. Ripetere su altre fonti prima di dichiararle supportate operativamente.
- Portal senza estensione: incolla, chiudi, riapri, riprendi; controlla dati, galleria e cambio copertina.
- Telefono reale, poi account personale dell'assistente. Una viewport mobile non equivale alla prova su telefono.
- Conferma area della mappa, cambia annuncio e verifica invalidazione; prova la scelta senza mappa.
- Crea la scheda di prova e aprila senza login: foto Storage raggiungibili, galleria, POI e JSON senza fonte.
- Interrompi e riavvia il lettore su una richiesta di prova; verifica ripresa senza doppio risultato. Sito bloccato e Mac offline devono produrre messaggi comprensibili.

Test automatici con rete simulata: `tests/smartlink/remote.mjs` usa handler veri e Sharp reale; verifica concorrenza, permessi, lease, ACK, archivio, capability prima delle nuove regole/indice e assistenza senza azioni sulla verifica. `studio.mjs` verifica il controller reale in entrambi i modi: doppio invio, cambio URL durante capability/lettura, ripresa e riuso foto. Mutazione che ignora il flag spento: test fallito come atteso; codice ripristinato e suite verde. `map.mjs` copre conferma/omissione e risposte obsolete. `tests/rules/runner.mjs` verifica le nuove collection nell'emulatore. Queste prove non dimostrano l'accessibilità reale degli annunci.

Collaudo UI del 20/10: Studio a 390 px, larghezza contenuto e pagina entrambe 390, senza scorrimento orizzontale; footer e campi corretti per mobile. Import/pubblicazione disattivati in questa prova. Configurazione Vercel entro 50 regole tramite gruppo finito geocode con timeout invariati, coperta da `npm test -- vercelfunctions` (17 mutazioni rilevate).
