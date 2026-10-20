# SmartLink · lettore centrale BOOM

## Stato del 20 ottobre 2026

Implementazione sul ramo `codex/smartlink-remoto-mappa`, PR #300. Il precedente adattatore API immobiliare è stato rimosso su richiesta di Valentino. Nessun abbonamento o credenziale di un fornitore immobiliare è necessario per questa implementazione.

**Non ancora attivo nel Portal pubblico e non ancora collaudato su un annuncio reale dal Mac.** Il runtime è installato su Homie, con browser dedicato e servizio predisposto ma non avviato. La prova Chrome del 17/10 riguardava l'estensione locale, non prova questo percorso remoto. La preview locale a porta 4181 verifica il componente mappa, non importa annunci. Un accesso di controllo il 20/10 dal browser integrato Codex ha mostrato DataDome Device Check: è prova di un blocco in quella sessione, non del risultato sul Mac Homie.

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

## Componenti e necessità

- `api/smartlink/jobs.js`: invio/ripresa privata, massimo cinque richieste pendenti per operatore (limite di cortesia, non transazione globale).
- `api/smartlink/worker.js`: autenticazione Homie, assegnazione atomica e ricevuta. `maxDuration: 180` per archiviare fino a 12 foto.
- `js/smartlink-import-engine.js`: stati, scadenze, lease e proiezione senza token.
- `api/smartlink/_archive.js`: Sharp già presente nelle dipendenze root/API, massimo 2400 px, metadati rimossi, CDN consentiti e nessun redirect.
- `smartlinkImports` e `smartlinkWorkers`: nuove collection admin-only, necessarie per ripresa e stato del lettore. Indice `createdBy + createdAt DESC` in `firestore.indexes.json`.
- `SMARTLINK_REMOTE_ENABLED=1`: nuova variabile server, necessaria come interruttore. Assente/0 ferma nuove richieste e nuove assegnazioni; una ricevuta già in corso può terminare.
- `HOMIE_SECRET`: già esistente, letto solo da `~/.boom/env` sul Mac; non copiato nel repo o nel browser.
- Playwright 1.64.1: nuova dipendenza **solo del runtime Mac**, necessaria per eseguire il browser. Il relativo lockfile è in `tools/smartlink-worker`; non aumenta le dipendenze delle funzioni Vercel. Browser scaricato dalla distribuzione ufficiale Playwright.

## Installazione e rilascio

Il rilascio del Portal segue AGENTS.md: merge su `main` da Valentino/regia, niente deploy manuali di produzione da questo ramo.

1. Rilasciare PR #300 con le regole Firestore. La CI attuale distribuisce rules/storage, **non gli indici**: distribuire anche l'indice di `firestore.indexes.json` e attenderne lo stato pronto.
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

Test automatici con rete simulata: `tests/smartlink/remote.mjs` usa handler veri e Sharp reale; verifica concorrenza, permessi, lease, ACK, archivio e fallimenti. `studio.mjs` verifica il controller reale per doppio invio, cambio URL, ripresa e riuso foto. `map.mjs` copre conferma/omissione e risposte obsolete. `tests/rules/runner.mjs` verifica le nuove collection nell'emulatore. Queste prove non dimostrano l'accessibilità reale degli annunci.

Collaudo UI del 20/10: Studio a 390 px, larghezza contenuto e pagina entrambe 390, senza scorrimento orizzontale; footer e campi corretti per mobile. Import/pubblicazione disattivati in questa prova. Configurazione Vercel entro 50 regole tramite gruppo finito geocode con timeout invariati, coperta da `npm test -- vercelfunctions` (17 mutazioni rilevate).
