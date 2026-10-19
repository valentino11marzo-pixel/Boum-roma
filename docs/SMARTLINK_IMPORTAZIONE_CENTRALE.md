# SmartLink · importazione centrale e mappa

## Stato del 20 ottobre 2026

Il codice del collegamento ufficiale è predisposto e coperto da test con rete simulata. **Il servizio non è attivo né collaudato con un account reale.** Le variabili necessarie non risultano configurate nel progetto Vercel BOOM. Il normale account Immobiliare.it o Casafari non dimostra l’abilitazione a queste API.

La versione precedente dipende da Chrome quando la fonte blocca il server. Questo requisito non soddisfa il paste da telefono. Il nuovo percorso server usa l’API ufficiale Immobiliare.it Insights per ID annuncio; HTML e Radar restano alternative quando accessibili. Idealista, Subito, Casa.it e Casafari non hanno un nuovo connettore centrale in questo incremento.

## Accesso necessario

Chiedere al referente Immobiliare.it Insights una prova del servizio **Comps — Comparable Detail per listing ID**, con galleria, per gli annunci in affitto a Roma. Prima dell’attivazione verificare con il fornitore:

- l’annuncio `124483437` e un annuncio pubblicato il giorno della prova sono presenti;
- disponibilità e latenza di aggiornamento, comprese rimozioni e cambi prezzo;
- galleria completa e modalità di accesso alle immagini;
- facoltà di ospitare le immagini sulle schede BOOM condivise con i clienti;
- costi, quota e limite di richieste adatti al lavoro di Valentino e assistente.

Nessuna richiesta al fornitore è stata inviata, nessun abbonamento acquistato. Non occorre installare un plugin sul telefono. Non inviare credenziali in chat.

Documentazione ufficiale consultata:

- [Dettaglio per ID](https://insights.immobiliare.it/webdocs/service/comps/comparable-detail/)
- [Campi e galleria](https://insights.immobiliare.it/webdocs/service/comps/mapping-output-data/)
- [OAuth](https://insights.immobiliare.it/webdocs/authentication/)
- [Tipi di contratto](https://insights.immobiliare.it/webdocs/service/comps/taxonomies-general/)

## Configurazione tecnica

Solo variabili server Vercel, inizialmente nell’ambiente di prova:

| Variabile | Uso |
| --- | --- |
| `REALITYCS_CLIENT_ID` | Client OAuth assegnato dal fornitore |
| `REALITYCS_CLIENT_SECRET` | Segreto del client OAuth |
| `REALITYCS_USERNAME` | Utente API abilitato |
| `REALITYCS_PASSWORD` | Password dell’utente API |
| `SMARTLINK_REALITYCS_ENABLED` | `1` attiva le chiamate; assente o `0` le ferma |

Endpoint fissati nel codice, nessun proxy arbitrario. Il token è riusato in memoria fino alla scadenza; non è inviato al browser, salvato in Firestore o scritto nei log. La galleria accetta solo il CDN della fonte o il percorso ufficiale `https://images.realitycs.it/img/{stessoListingId}/{imageId}`. Eventuali diversi formati osservati vanno verificati, senza ampliare indiscriminatamente gli host.

## Collaudo richiesto prima di dire «funziona da mobile»

1. Account API reale abilitato; verificare che la risposta identifichi esattamente l’URL richiesto e contenga fotografie.
2. Portal senza estensione, viewport mobile e poi telefono reale: incolla URL, importa, controlla prezzo e dati, scorri/riordina le fotografie.
3. Zona suggerita → controlla cerchio → conferma. Cambia annuncio: la vecchia zona deve sparire. In alternativa, scegli esplicitamente senza mappa.
4. Pubblica solo la scheda di prova richiesta. Apri il link senza login, verifica tutte le foto Storage, galleria e punti di interesse. Il JSON pubblico deve escludere la fonte e i dati dell’operatore.
5. Ripeti con un annuncio nuovo dello stesso giorno. Misura esito e tempi; un caso riuscito non garantisce copertura universale.
6. Verifica un account personale dell’assistente con i permessi appropriati. L’accesso allo Studio resta admin-only in questo incremento; nessun nuovo privilegio è stato concesso.

Test locali: `npm test -- smartlink actions crawl`; `node scripts/check-pages.mjs`. Test di rete simulata non equivalgono a disponibilità commerciale o collaudo di produzione. Il rilascio sul dominio deve seguire la regia coordinata del repository.
