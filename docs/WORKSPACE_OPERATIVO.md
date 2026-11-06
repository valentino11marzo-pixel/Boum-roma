# Workspace BOOM: dalla posta al lavoro

Configurazione e verifiche del 7 novembre 2026. Questa guida separa ciò che
è stato verificato in produzione dal percorso introdotto dalla PR #305.

## Il percorso per Valentino

1. In **Oggi → Cerca nelle email**, cerca il mittente o una frase. La ricerca
   comprende la casella Valentino e i suoi alias, anche posta archiviata e
   inviata; spam e cestino sono esclusi. La ricerca non consuma AI.
2. Apri l'originale. Se esiste una conversazione, scegli esplicitamente quella
   corretta. Dopo il rilascio di #305, una nuova email di lavoro può diventare
   una richiesta con **Crea richiesta da questa email**, confermando il recapito.
3. In Inbox, **Segui tu** conserva chi deve agire, il prossimo passo e il momento
   del ricontrollo. Collega la pratica verificata; un indirizzo condiviso non
   autorizza a fondere persone, case o ordini.
4. La preparazione propone una risposta e un seguito. La fonte deve essere
   leggibile; destinatario, disponibilità, prezzi e promesse vanno verificati
   prima della conferma. Leggere l'email non conclude il lavoro.

Il passaggio 2 per nuove richieste è nella PR #305, non ancora in produzione.
L'importazione è manuale. Non scansiona l'intera casella per creare pratiche,
non abilita invii automatici e non modifica letto/non letto di Gmail.

## Una casella, più porte

| Indirizzo @boom-rome.com | Impiego |
| --- | --- |
| valentino | Conversazioni personali, trattative e relazioni già avviate |
| hello | Nuovi contatti e richieste generali |
| affitti | Richieste di ricerca e locazione |
| proprietari | Relazioni con proprietari |
| documenti | Documenti collegati a una pratica identificata |
| amministrazione | Fatture, pagamenti e contabilità |
| assistenza | Problemi e assistenza su rapporti esistenti |

Gmail li raccoglie nell'account Valentino; le etichette descrivono la porta
d'ingresso, non la priorità né lo stato del lavoro. Non sono utenze distinte
né confini di accesso per collaboratori o AI. Non occorre riscrivere ai clienti
per spostarli su un alias. La corrispondenza alla casella primaria resta inclusa.

Le identità e firme di Gmail non configurano automaticamente Nodemailer,
Telegram o altri invii del server. #305 conserva A/Cc della fonte, ma non cambia
il mittente delle email server. Una scelta di mittente richiede un intervento
separato sui produttori, con prove di consegna e risposta.

## Confini fra strumenti

- **Gmail**: originale della corrispondenza e invio manuale. Una mail letta non
  equivale a un'attività conclusa.
- **Portale/Firestore**: pratica, relazioni verificate, decisione e ricontrollo.
  Nessun registro parallelo in Sheets, Tasks o memoria del modello.
- **Drive**: documenti originali e materiali condivisi della pratica. Il legame
  con il fascicolo deve essere esplicito; un allegato non si assegna dal solo nome.
- **Calendar**: appuntamenti confermati; una proposta AI non occupa uno slot.
- **Telegram**: avvisi all'operatore con link alla pratica e azione richiesta.
- **WhatsApp**: relazione con il cliente; copertura effettiva del bridge da
  verificare, senza presumere accesso alle chat personali o a tutti i gruppi.

Obiettivo delle notifiche: decisione, scadenza reale, errore che richiede una
persona. Stesso evento = un solo avviso; attesa invariata = silenzio. Questo è
il criterio di consolidamento, non una nuova policy già attivata su tutti i bot.

## AI e controllo dei costi

Il collegamento locale e l'instradamento cloud/local esistono già in
`api/_ai.js` e `js/ai-registry.js`. Verificare `GET /api/ai/status` prima di
cambiare modelli: la raggiungibilità del Mac non dimostra qualità o utilizzo.
Per la posta, iniziare dall'estrazione di campi espliciti su casi di prova,
misurando errori e tempi. Il confronto fra modelli non dimostra correttezza.

Il tetto Anthropic Messages non include telefonia, STT, abbonamenti e costi del
Mac. Conteggi locali, stime cloud e fatture sono misure distinte. Non attivare
un secondo sistema di AI o una seconda scansione della casella per lo stesso
scopo. La configurazione dei costi e le verifiche dell'account restano nel
resoconto interno, non in questa guida del codice.

## Attivazione, nell'ordine

1. Integrare #305 con main corrente, prove server e browser, revisione e normale
   rilascio da main. Verificare poi una email reale e un alias nella sessione
   autenticata. Il collaudo con dati sintetici non sostituisce questa verifica.
2. Prendere in carico pochi casi espliciti e misurare: originali recuperati,
   doppioni, proposte corrette e tempo risparmiato. Prima di abilitare il worker,
   controllare configurazione, data di partenza, tetto giornaliero e salute fonti.
3. Consolidare gli avvisi sui cambiamenti del caso, riusando il trasporto
   Telegram esistente. Non attivare contemporaneamente lo stesso lavoro in Studio.
4. Collegare Drive e Calendar alle pratiche verificate. Il connettore nella chat
   non è il collegamento del server: OAuth, ambito e destinatario dei dati sono
   configurazioni distinte. Nessun nuovo accesso è stato concesso qui.
5. Solo se la latenza dell'IMAP attuale limita il lavoro: valutare Gmail API +
   Pub/Sub con accesso alla sola casella necessaria, cursore historyId, rinnovo
   watch, deduplicazione e recupero dei buchi. Spegnere i poller sostituiti dopo
   il confronto, non affiancare un secondo sistema di ammissione.

Google richiede di rinnovare watch almeno ogni sette giorni e consiglia ogni
giorno; le notifiche possono perdersi, quindi serve sincronizzazione di recupero.
Non è un'automazione attiva per il solo fatto che esistono gli alias.

Fonti ufficiali consultate: [Gmail push](https://developers.google.com/workspace/gmail/api/guides/push),
[Workspace Studio](https://support.google.com/workspace-studio/answer/16444479).
Nessun contenuto email, consumo reale dell’account o segreto in questa guida.
