# BOOM — Portal e comunicazioni, 14 ottobre 2026

## Risultato operativo

Una chat di regia è sufficiente. Il repository conserva codice, decisioni e verifiche;
la chat non è un database operativo. Firestore resta la fonte dei record BOOM.

Il percorso consegnato è: **apri persona/immobile/contratto → comunicazioni collegate
→ leggi o prepara la risposta → torna al contesto**. L'apertura non cancella «Da rispondere».
Su telefono la conversazione sostituisce la lista, la bozza sopravvive agli aggiornamenti
e il compositore resta raggiungibile con la tastiera. Desktop mantiene due colonne.

Persone mette ricerca e lista prima delle statistiche; i filtri si combinano con la ricerca.
Contratti distingue bozze, scaduti e terminati. Manutenzione ordina prima le urgenze.
La ricerca globale delle persone apre ora la scheda realmente presente nel portal.

## Fonti: cosa è collegato davvero

| Fonte | Stato verificato in questo lotto | Limite |
|---|---|---|
| Record BOOM | Motori e renderer reali; relazioni per ID tipizzato | Una relazione mancante non viene dedotta dal nome |
| Comunicazioni | Query mirate a `conversations` e seguiti confermati in `operatorTasks` | 100 seguiti / 50 conversazioni; incompletezza dichiarata |
| Gmail Workspace | Profilo `valentino@boom-rome.com` accessibile dal connettore della chat | Non prova che il portal abbia ricevuto tutte le email |
| Email dal portal | Payload corretto, oggetto/testo integri fino a SMTP simulato e storico | Collaudo autenticato SMTP reale ancora da fare; ricevuta ≠ consegna al destinatario |
| HOMIE / WhatsApp | Riutilizzati messaggi già registrati e percorsi esistenti | Nessuna riattivazione di HOMIE o prova di sincronizzazione completa |

Lo scanner email esistente non è un innocuo «Aggiorna»: legge solo parte della posta
e può avviare preparazioni AI. Non viene avviato dall'apertura di queste schermate.
Questo lotto non introduce modelli, chiamate AI, dipendenze o nuovi segreti.

## Verifica e limiti della preview

`tests/portal-workspace/ui.mjs --serve` espone il codice reale con dati dimostrativi.
Persone, Immobili, Contratti, Manutenzione, Inbox e passaggio fascicolo/messaggi sono
collaudabili. Gli invii sono bloccati e le azioni fuori perimetro sono dichiarate.
La Home è accessibile nella stessa preview; il cambio tra Home e fixture sezioni
ricarica i dati demo e non dimostra continuità di dati di produzione.

Prove dedicate: `portalworkspaceui`, `inboxconnected`, `inboxleadui`, `searchui`.
Regressioni: `mobile/mobileui`, `desktop/desktopui`, `actions`, `finish`,
`oggiquicktoolsui`, `oggihomeui`, `propertyui/propertyrender/propertyoggiui`,
`segretariafreshui`, sintassi pagine/script. Tastiera tramite VisualViewport simulato.
Email: doppio click, errore SMTP, errore dello storico con recupero senza reinvio,
nuovo invio volontario identico, cambio conversazione e bozze modificate durante l'invio.
Mutazioni riproducono perdita del realtime e cancellazione errata di «Da rispondere».

La protezione di retry email vive nella sessione browser: dopo ricaricamento o chiusura
non sostituisce una coda server durevole. Un esito incerto chiede verifica e non reinvia
automaticamente. Nessun invio a clienti o modifica di record reali in questo lotto.

## Rilascio e prossimo collaudo

Ramo `codex/portal-mobile-connected-20261014`, base Magic Sign #289 e main `3808a5f0`
integrato. Nessun merge su main o deploy di produzione eseguito da questo lotto.
La preview non certifica un rilascio: servono CI del candidato e verifica autenticata.
La sessione portal trovata era scaduta; richiesto accesso nella scheda Login già aperta.

Prossimo collaudo sui dati reali: una conversazione di lavoro nota, confronto con Gmail
e WhatsApp alla fonte, verifica immobile/pratica, destinatario e stato prima di qualsiasi
invio. Solo dopo si abilita un'automazione misurabile. HOMIE fermo non diventa attivo per
il solo fatto che la chat può accedervi. Revisione Magic Sign separata, come richiesto.
