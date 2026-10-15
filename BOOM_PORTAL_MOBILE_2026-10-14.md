# BOOM — Portal e comunicazioni, 14 ottobre 2026

## Risultato operativo

Una chat di regia è sufficiente. Il repository conserva codice, decisioni e verifiche;
la chat non è un database operativo. Firestore resta la fonte dei record BOOM.

Il percorso consegnato è: **Home → persona/immobile/contratto → comunicazioni collegate
→ prendi in carico → conferma prossimo passo, responsabile e ricontrollo → torna al contesto**.
Un seguito non è una risposta inviata: l'apertura non cancella «Da rispondere».
Su telefono la conversazione sostituisce la lista, la bozza sopravvive agli aggiornamenti
e il compositore resta raggiungibile con la tastiera. Desktop mantiene due colonne.

La Home mantiene sedici strumenti, ora in quattro colonne sul telefono e sei sul desktop,
e mostra il lavoro da seguire senza doverlo prima scoprire in una sezione chiusa.
Menu: Oggi, Persone, Immobili, Contratti, Incassi, Inbox; tutti i 38 handler originali
restano accessibili in gruppi. Home e catalogo leggono lo stesso registro di strumenti.
Incassi apre la lista; «Nuova rata» apre il modulo, senza registrare falsamente denaro ricevuto.

Persone, Immobili, Contratti e Interventi mettono ricerca e lista prima dei riepiloghi;
i filtri si combinano con la ricerca e distinguono assenza di risultati da errore.
Contratti conserva bozze, scaduti, terminati e firme PDF; Manutenzione ordina le urgenze
senza cambiare l'array condiviso. Le righe contratto si aprono anche da tastiera.

## Fonti: cosa è collegato davvero

| Fonte | Stato verificato in questo lotto | Limite |
|---|---|---|
| Record BOOM | Motori e renderer reali; relazioni per ID tipizzato | Una relazione mancante non viene dedotta dal nome |
| Comunicazioni | Query mirate a `conversations` e seguiti confermati in `operatorTasks` | 100 seguiti / 50 conversazioni; incompletezza dichiarata |
| Presa in carico | Handler reale, fonte persistita, ricevute deterministiche e modulo esistente | 30 casi per conversazione; fonte tra 100 messaggi recenti. Ambiguità/incompletezza bloccano l'azione |
| Gmail Workspace | Profilo accessibile; una notifica immobiliare odierna corrisponde al lead visibile nel portal live | Verifica puntuale, non sincronizzazione di tutta la casella |
| Email dal portal | Payload corretto, oggetto/testo integri fino a SMTP simulato e storico | Collaudo autenticato SMTP reale ancora da fare; ricevuta ≠ consegna al destinatario |
| HOMIE / WhatsApp | SSH funzionante; ricevitore e forwarder già attivi, checkpoint ispezionato senza leggere chat personali | Invii in HOLD preservati; battito recente non significa tutti i messaggi importati |

La Home offre «Verifica collegamenti»: legge stato/configurazione delle fonti su richiesta.
In Inbox, «Importa email recenti» usa il nuovo percorso `sync_only` per la sola
conversazione scelta: tre giorni, massimo otto email, identità verificata, nessuna AI
o risposta automatica. Messaggio e intestazione sono atomici; identità cambiata
o verifica incompleta dei metadati (massimo 500 conversazioni) fermano l’importazione.
Il cron esistente resta distinto. Il primo compositore sceglie
un canale effettivamente disponibile: una email mostra subito oggetto e invio.

HOMIE il 14/10 conserva 11.122 elementi trattenuti nel checkpoint: storico da rivedere,
identità non risolta, media e cancellazioni. Non sono 11.122 incarichi da assegnare a
Valentino né prova di altrettante conversazioni perse. Non si importa indiscriminatamente
lo storico: classificazione delle chat personali e risoluzione identità restano necessarie.

## Verifica e limiti della preview

`PORT=8933 node tests/portal-workspace/ui.mjs --serve` espone a
`http://127.0.0.1:8933/workspace#oggi` una sessione unica con Home, Persone, Immobili,
Contratti, Incassi, Interventi, Inbox e catalogo. I renderer e il handler seguiti sono
quelli di produzione; soltanto autenticazione, Firestore e rete sono simulati.
Il passaggio tra sezioni conserva gli stessi record e la bozza. Ricaricare la pagina
ripristina i dati dimostrativi. Nessun contatto reale, firma, addebito o invio.
Le altre mutazioni sono bloccate al confine della preview, con avviso esplicito.

Tre percorsi di accettazione:
1. Casa → comunicazioni → incarico: scegli pratica, azione, responsabile e data;
   la conferma appare nella conversazione, la bozza resta e torni alla stessa casa.
2. Stessa richiesta già presa in carico: riapri il seguito esistente; nessun duplicato.
   Una richiesta nuova dopo la chiusura può avviare un nuovo seguito senza riaprire il vecchio.
3. Due pratiche possibili o messaggio arrivato durante la conferma: nessuna associazione
   inventata né conferma obsoleta; scelta esplicita o aggiornamento richiesto.

Prove dedicate: `portaljourneyui` (30 controlli, una sessione/API reale con IO demo),
`portalnavigationui` (12), `portalworkspaceui` (41), `inboxtakecharge` (7 scenari),
`inboxtakechargeui` (3), `inboxtakechargeraces` (2), `seguito` (91),
`inboxconnected`, `inboxleadui`, `searchui`. Layout a 320/390/1280 px.
Regressioni: `mobile/mobileui`, `desktop/desktopui`, `actions`, `finish`,
`oggiquicktoolsui`, `oggihomeui`, `propertyui/propertyrender/propertyoggiui`,
`segretariafreshui`, sintassi pagine/script. Tastiera tramite VisualViewport simulato.
Email: doppio click, errore SMTP, errore dello storico con recupero senza reinvio,
nuovo invio volontario identico, cambio conversazione e bozze modificate durante l'invio.
Mutazioni riproducono perdita del realtime e cancellazione errata di «Da rispondere».

La protezione di retry email vive nella sessione browser: dopo ricaricamento o chiusura
non sostituisce una coda server durevole. Un esito incerto chiede verifica e non reinvia
automaticamente. Nessun invio a clienti o modifica di record reali in questo lotto.

## Affidabilità chiusa nel candidato

- **Sessione e fonti:** account A → logout → B, risposte tardive e stessa utenza
  riaperta non riusano dati della sessione precedente. Errori delle fonti visibili,
  recupero limitato e nessun «aggiornato» se una lettura è fallita. Bozze preservate.
- **Proposte e pagamento:** lock per tutti i mesi con precondizioni; errori di lettura
  fermano l'avanzamento. Tentativo Checkout persistito, stessa chiave Stripe nei
  retry, sessione precedente verificata prima di aprirne una nuova. Esito incerto
  resta da verificare, non viene trasformato in un secondo addebito.
- **Consegna:** email T+3 soltanto dopo verbale con data e PDF validi; la decorrenza
  contrattuale non viene presentata come ingresso avvenuto.
- **Interventi:** ripristinate le azioni di avanzamento/risoluzione e i metadati Regole
  rimossi accidentalmente nel riassetto del menu. Ruolo e sessione verificati.
- **Costi:** La Squadra → Costi AI mostra stime registrate e un limite Anthropic
  facoltativo. Prima dell'esecuzione prenota atomicamente il costo; richieste o
  prezzi ignoti fermano il cloud quando il limite è attivo. Nessun limite attivato
  senza un importo scelto. Spento, il limite non impedisce consumi.

I contatori reali letti il 14/10 riportano circa 92,37 USD nel mese, 89,12 USD per
`segretaria.prepare`, 0,18 USD oggi. Sono stime del portal, non la fattura né i crediti
Codex. Il nuovo limite copre Anthropic Messages: STT, ElevenLabs, Telnyx/TIM e questa
chat restano separati. Riserve incerte trattenute, massimo 2.048 tentativi al giorno;
il fallback server-side di Innesto non prezzabile viene fermato con limite attivo.

Prove aggiunte: `portalsessionui` (24, incluse mutazioni), `palockrecovery` (20+4),
`maintenanceactions` (7), `mailsource` (55, sei mutazioni), `mailsourceui` (14),
`aibudget` (26, cinque mutazioni), `aibudgetui` (16) e `journey`
(runner reale con IO in memoria, 57 verifiche e due mutazioni). Le prove simulate
non sostituiscono il collaudo autenticato del deploy.

## Rilascio e confini

Ramo `codex/portal-mobile-connected-20261014`, PR #290 (include Magic Sign #289).
Main `3808a5f0` è integrato, ma il live effettivo trovato serviva `960f3e2b` dal ramo
Claude: anche quel commit è stato integrato per conservare il lavoro già pubblicato.
Nessun merge su main eseguito da questo lotto. Stato attuale: candidato in collaudo,
non ancora dichiarato pubblicato; la prova finale del rilascio va registrata sotto.

Restano espliciti: sincronizzazione WhatsApp incompleta, invii sospesi preservati,
email in uscita senza coda durevole oltre la sessione, copertura parziale del contesto
AI, nessuna certificazione legale dei documenti. Il nuovo portal non riattiva da solo
HOMIE, non invia messaggi di prova ai clienti e non certifica disponibilità o firme
senza la fonte canonica. La revisione del Magic Sign resta separata dalle firme reali.
