# Homie: invio selezionato con outbox ordinaria in pausa

Questa modifica aggiunge codice e test. **Non installa servizi, non attiva invii e non costituisce consenso a una comunicazione reale.** La regia resta l'unico responsabile della pubblicazione. La prima esecuzione deve essere autorizzata sul messaggio concreto già approvato.

## Che cosa cambia

Il precedente `wa-outbox.sh --once` esegue un ciclo, potenzialmente fino a dieci messaggi, e recupera ricevute precedenti. Non isola un invio. Il nuovo endpoint `/api/homie/wa-outbox-single` e il nuovo wrapper `wa-outbox-single.sh` lavorano invece su un solo `sgreply_…` già approvato ed eseguito nella coda BOOM.

Il protocollo `homie-wa-single-v1` vincola ID, revisione approvata e SHA-256 dei byte UTF-8 dell'array JSON compatto `[actionId, phone, text]`. I sette vettori in `tests/segretaria/fixtures/wa-single-protocol-v1.json` verificano la corrispondenza JavaScript/Python. Il trasporto conserva il testo dell'azione approvata: la normalizzazione già compiuta dall'approvazione esistente non viene modificata.

| Operazione | Effetti consentiti |
|---|---|
| `inspect` | Legge la sola selezione e il contesto richiesto dalle guardie esistenti. Restituisce ID, revisione e impronta; niente testo o destinatario, nessuna scrittura o claim. |
| `claim` / comando `send` | Riapplica approvazione, contesto, scadenza e impronta, poi usa il commit atomico esistente su azione/caso/conversazione. Restituisce un solo payload. |
| `ack` | Registra soltanto l'esito del bersaglio e della selezione acquisita. Un recupero ritenta la conferma, mai il mittente. |

Non esiste fallback al vecchio endpoint. Un endpoint assente, uno schema sconosciuto o una risposta incoerente arrestano la modalità singola. Il pull ordinario mantiene il proprio contratto; non vengono aggiunti modelli, dipendenze, segreti, grant, code o raccolte Firestore. Le sole estensioni di stato sono metadati nella ricevuta di consegna esistente e nel suo registro locale già presente.

Il codice base server è `0490cbcb16ffaf9eb0421d811190815cb80b0557`. Rispetto alla prima analisi, outbox e guardia consegna sono identiche; `_execution-guard.js` aggiunge i veti `contextCurrent` e `conversationBindingConflict`, preservati e coperti dai test. I due file base Mac inclusi nel repository sono copie byte-identiche della versione installata verificata il 21 settembre: wrapper SHA-256 `acb453533fdcf93fc839a39a272cb08d05cb2c127c8d7fbd9b7f19c01bb84444`, worker SHA-256 `70fe30c2a5604d237d1b89faff2d623ae344de25e5d4d2f797c942d0b2c0b969`.

## Preparazione di un'eventuale attivazione — regia

1. Ottenere approvazione del rilascio e dell'installazione, poi verificare che il candidato conservi eventuali modifiche pubblicate dopo la base. Verificare il commit realmente servito dal dominio prima e dopo la pubblicazione; nessun deploy parallelo.
2. Pubblicare l'endpoint con durata massima 60 secondi e i suoi helper tramite il normale rilascio. Un client nuovo davanti a un server vecchio si arresta senza ricadere nel pull.
3. Sul Mac, verificare in sola lettura che `com.boomrome.wa-outbox` non sia caricato e che `/Users/boomserver/.boom/wa-outbound-hold` sia un file regolare presente. Confermare che nessun altro operatore stia inviando la stessa azione tramite altre vie.
4. Confrontare i due hash base sopra con `/Users/boomserver/agent-os/bin/wa-outbox.sh` e `wa_outbox.py`. Verificare separatamente hash/versione dell'helper `send_whatsapp.sh` contro il pacchetto runtime revisionato. La presenza del file o del processo wacli non prova che la sessione sia autenticata e pronta.
5. Installare soltanto i nuovi `homie-bridge/agent-os/bin/wa_outbox_single.py` e `wa-outbox-single.sh` accanto al worker esistente in `/Users/boomserver/agent-os/bin/`, con proprietario corretto e permessi appropriati; registrare gli hash del candidato. Non sostituire la baseline se il confronto fallisce. Non modificare l'installatore, non caricare LaunchAgent e non rimuovere HOLD.
6. Usare la configurazione esistente caricata dal wrapper. Non copiare segreti in comandi, documenti o output. Il registro rimane `/Users/boomserver/.boom/wa-outbox-receipts` e usa lo stesso lock del worker ordinario.

Questi sono passi futuri, non eseguiti dal lavoro offline. Non è disponibile da questa suite una prova della sessione d'invio o del comportamento effettivo dell'helper installato.

## Comandi concreti per il solo messaggio autorizzato

I segnaposto devono provenire dal caso BOOM approvato; non scegliere automaticamente un elemento dalla coda. Eseguire come utente `boomserver`, dopo l'installazione autorizzata.

Prima leggere soltanto i metadati:

```sh
/bin/bash /Users/boomserver/agent-os/bin/wa-outbox-single.sh inspect \
  --action '<actionId approvato>'
```

`inspect` non crea directory, lock o ricevute locali. Se restituisce `inspected`, prendere `revision` e `payloadHash` e confrontare la selezione con il messaggio che l'operatore ha approvato. Questa lettura non autorizza l'invio e non riserva l'azione: tutti i veti vengono riapplicati atomicamente al claim.

**Solo dopo consenso esplicito all'esecuzione di quel messaggio con il resto della coda in pausa:**

```sh
/bin/bash /Users/boomserver/agent-os/bin/wa-outbox-single.sh send \
  --action '<stesso actionId>' \
  --expected-revision '<revision verificata>' \
  --expected-hash '<payloadHash verificato>' \
  --execute
```

HOLD deve rimanere presente e il servizio ordinario non caricato. Il worker verifica questi requisiti e lo stop prima del claim e prima del mittente. `--execute` è un riconoscimento esplicito dell'operatore, non un nuovo grant né una sostituzione dell'approvazione applicativa.

Se una ricevuta esiste già, `send` non reinvia e non recupera ACK automaticamente. Per la sola conferma, quando il riscontro concreto ne giustifica il recupero:

```sh
/bin/bash /Users/boomserver/agent-os/bin/wa-outbox-single.sh ack \
  --action '<stesso actionId>' \
  --expected-revision '<stessa revision>' \
  --expected-hash '<stesso payloadHash>' \
  --execute
```

Questo comando legge solo la ricevuta del bersaglio. Non legge o modifica le altre ricevute, non ritira nuovi messaggi e non chiama il mittente. Una ricevuta assente, corrotta, legacy o con binding diverso blocca il recupero.

## Interpretare il risultato

Leggere insieme `outcome`, `state` e `ackStatus`. Un'uscita zero segnala il completamento dell'operazione richiesta, non prova da sola che un messaggio sia stato consegnato. `sessionReadiness: not_verified` resta esplicito.

- `sent` + `acked`: l'helper ha dichiarato successo e il server ha registrato l'ACK. Non equivale a ricevuta WhatsApp del destinatario.
- `sent` + `pending`: preservare la ricevuta, verificare il problema e ritentare eventualmente solo `ack`.
- `uncertain`: il tentativo potrebbe essere arrivato al destinatario; nessun reinvio automatico. Anche un ACK negativo con `send_outcome_unknown` conserva questa distinzione nel registro.
- `not_sent`: il worker ha arrestato il percorso prima di avviare il mittente. Il claim non viene cancellato per riutilizzare ciecamente la stessa azione.
- `claim_outcome_unknown`, `claim_invalid`, `local_state_error` o conflitto: fermarsi e riconciliare il caso; nessuna garanzia che il claim non sia avvenuto e nessuna procedura automatica di reset.

Un errore 500/503/504, un altro 5xx, un timeout o status 0 dopo il claim è
`claim_outcome_unknown`: il server potrebbe aver già acquisito l'azione. Solo
400/401/405/409 sono rifiuti definiti del protocollo; 404 rimane indisponibilità
dell'endpoint/azione. Redirect e altri status inattesi sono conservativamente
incerti. Il worker si ferma senza mittente, secondo claim o ACK automatico e
senza fabbricare una ricevuta. Un successivo comando esplicito non è una
procedura di recupero: il claim permanente impedisce comunque un nuovo invio.

Le verifiche HOLD/servizio/stop dopo il claim rimangono: un timeout di launchctl
può lasciare un'approvazione acquisita senza invio, ma saltare il controllo
permetterebbe di inviare mentre il servizio ordinario è stato riattivato o il
consenso operativo è stato revocato. Il fallimento chiuso conserva `not_sent`
e richiede riconciliazione; non cancella il claim né autorizza un reinvio.

Il percorso singolo non richiama `/api/homie/message`: la ricevuta dell'azione viene aggiornata dall'ACK, ma non viene aggiunto il mirror del messaggio nella conversazione. Il controllo della UI dovrà distinguere la ricevuta di consegna dalla cronologia dei messaggi. Eventuali automazioni dipendenti dal mirror richiedono un lavoro separato prima di prometterne il funzionamento.

## Arresto e rollback

SIGINT/SIGTERM fermano il percorso singolo indipendentemente da HOLD, già presente. Se il mittente è stato avviato, lo stop non può annullare un messaggio partito: conservare l'esito o l'incertezza.

In caso di errore, mantenere HOLD e servizio ordinario non caricato. Ripristinare eventualmente solo i nuovi file di codice dopo aver fermato il processo; non ripristinare una vecchia copia del registro, non cancellare claim/ricevute e non creare una nuova azione per aggirare un esito incerto.

Una ricevuta single ancora `pending`/`conflict` deve essere riconciliata tramite il percorso dedicato prima di qualunque riattivazione generale. Il vecchio endpoint ACK rifiuta le claim single prive del relativo binding: il worker ordinario non è una procedura di recupero alternativa. Anche il rollback server può rendere indisponibile l'ACK dedicato; preservare la ricevuta finché un endpoint compatibile è disponibile.

## Verifica offline ripetibile

```sh
npm test -- segretariainviosingolo homieinviosingolo homieinviosingoloe2e \
  segretariainviosingolomutazioni homieinviosingolomutazioni \
  segretariaconsegna segretariaesecuzione segretariaripresa
```

Le suite usano handler/guardie reali con Firestore e rete simulati e ricevute locali sintetiche temporanee. Il test completo collega JavaScript e Python via standard input/output: nessun server locale o remoto, nessun mittente reale. Comprende arretrato misto, approvazione cambiata, corse CAS, due host simulati, crash di processo, riavvio e perdita dell'ACK. Le prove non autorizzano o effettuano accessi a dati operativi.

| Scenario previsto | Copertura sintetica |
|---|---|
| 1. Bersaglio in arretrato misto | Server e test completo con 121 azioni estranee immutate |
| 2. ID errato, mancante o legacy | Server; worker `test_02` |
| 3. Approvazione/impronta/contesto cambiati | Server con corse sul commit; worker `test_03` |
| 4. Scaduto, chiuso o già acquisito | Server; worker `test_04` |
| 5. Vecchio endpoint, redirect o protocollo | Server; worker `test_05` e `test_22` |
| 6. Risposta diversa, multipla o malformata | Worker `test_06` |
| 7. Concorrenza tra esecutori e host | Server, worker `test_07`, test completo con due registri separati |
| 8. Registro corrotto/impronta diversa | Worker `test_08` e `test_17` |
| 9. Stop/crash alle fasi critiche | Worker `test_09`, `test_12`, `test_20`; crash reale del processo sintetico nel test completo |
| 10. ACK perso, ripetuto, discordante o 5xx | Server, worker `test_10`, test completo con ACK perso e recupero |
| 11. Ricevute estranee pendenti | Worker `test_11`, server con ricevuta estranea immutata |
| 12. HOLD e riavvio del servizio ordinario | Worker `test_12`, `test_12b`, `test_12c` |
| 13. Timeout/errore dopo possibile effetto | Worker `test_13`; nessun reinvio |
| 14. Unicode e testo esatto | Sette vettori condivisi, server, worker `test_14`, test completo |
| 15. Riavvio e rollback | Worker `test_15`, test completo; conservazione delle ricevute |
| 16. Tracciamento e monitor | Worker `test_16`, inspect server privo di contenuti; nessun mirror |
