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
| Gmail Workspace | Profilo `valentino@boom-rome.com` accessibile dal connettore della chat | Non prova che il portal abbia ricevuto tutte le email |
| Email dal portal | Payload corretto, oggetto/testo integri fino a SMTP simulato e storico | Collaudo autenticato SMTP reale ancora da fare; ricevuta ≠ consegna al destinatario |
| HOMIE / WhatsApp | Riutilizzati messaggi già registrati e percorsi esistenti | Nessuna riattivazione di HOMIE o prova di sincronizzazione completa |

Lo scanner email esistente non è un innocuo «Aggiorna»: legge solo parte della posta
e può avviare preparazioni AI. Non viene avviato dall'apertura di queste schermate.
Questo lotto non introduce modelli, chiamate AI, dipendenze o nuovi segreti.

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

## Rilascio e prossimo collaudo

Ramo `codex/portal-mobile-connected-20261014`, base Magic Sign #289 e main `3808a5f0`
integrato. Nessun merge su main o deploy di produzione eseguito da questo lotto.
La preview non certifica un rilascio: servono CI del candidato e verifica autenticata.
La sessione portal trovata era scaduta; richiesto accesso nella scheda Login già aperta.

La PR #290 resta in bozza: include #289, quindi non va unita separatamente dalla sua
revisione. Main verificato su GitHub durante questo lavoro: `3808a5f0`; già integrato.
La chat «Rivedi i materiali cloud di BOOM» conserva le decisioni contrattuali e via dei
Latini: questo lotto non riscrive quelle decisioni né interviene sulle firme reali.

## Aperto nell'audit generale, prima di dichiarare affidabile l'intero sistema

Il dettaglio resta in `MAGIC_SIGN_E_PORTAL_AUDIT_2026-10-13.md`; non è stato cancellato
perché le nuove schermate funzionano. Priorità successive, con ambito distinto:

| Priorità | Rilievo | Criterio di chiusura |
|---|---|---|
| P1 | Cambio account può conservare vecchio profilo nel browser; nessun bypass server dimostrato | Isolamento completo A→logout→B, anche con risposte tardive; coordinare proprietà boot |
| P1 | Ripresa Checkout di proposta accettata senza riacquisizione sicura del lucchetto | Disponibilità atomica e prova di due proposte concorrenti, senza doppi incassi |
| P1 | Errori di alcuni listener contratti/interventi/firme non mostrati né recuperati | Ogni fonte espone errore/freschezza, un recupero e una sola sottoscrizione |
| P2 | Aggiornamento globale può dichiarare successo dopo errore assorbito | Esito vero per fonte, nessun «Dati aggiornati» falso |
| P2 | Budget AI contabilizzato dopo il consumo | Prenotazione prima dell'esecuzione, retry inclusi |

L'obiettivo non è aggiungere un'altra chat: ogni richiesta deve diventare un'attività
rintracciabile con una prossima azione. Per automatizzare gli invii servono poi
sincronizzazione misurata, destinatario certo, ricevuta server durevole e budget prima
dell'esecuzione. Sono requisiti ancora da chiudere, non capacità già consegnate.

Prossimo collaudo sui dati reali: una conversazione di lavoro nota, confronto con Gmail
e WhatsApp alla fonte, verifica immobile/pratica, destinatario e stato prima di qualsiasi
invio. Solo dopo si abilita un'automazione misurabile. HOMIE fermo non diventa attivo per
il solo fatto che la chat può accedervi. Revisione Magic Sign separata, come richiesto.
