# Fatture BOOM: rilascio e importazione

La sezione distingue evidenze fiscali Zucchetti, pagamenti Stripe, trasferimenti verso Sella, costi e verifiche residue. Le registrazioni interne preesistenti restano consultabili e modificabili nel riquadro separato; non costituiscono prova di emissione o consegna SdI.

## Rilascio

1. Integrare la PR secondo AGENTS.md e verificare il commit realmente servito prima di pubblicare. Questo lavoro non ha effettuato merge o deploy.
2. Pubblicare anche la regola Firestore `invoiceReconciliations`: accesso admin, creazione consentita, aggiornamento/eliminazione negati. Il server usa le credenziali già previste dalla libreria condivisa; nessun nuovo segreto.
3. Aprire il portale autenticato come admin, pagina Fatture BOOM. Un archivio inizialmente vuoto deve essere dichiarato come tale; un errore di lettura non equivale ad archivio vuoto.
4. Importare il prospetto privato JSON verificato, controllare anteprima e data delle fonti, quindi confermare. I dati reali non vanno mai copiati nel repository, negli asset pubblici o nelle prove pubbliche.
5. Rileggere l’archivio e confrontare conteggi e totali con il prospetto approvato. Verificare anche che un account non admin riceva accesso negato.

L’importazione crea uno snapshot immutabile con digest e autore, senza modificare fatture o incassi, inviare comunicazioni, applicare correzioni anagrafiche o trasmettere a SdI. Il secondo invio dello stesso contenuto restituisce lo snapshot esistente; una correzione dei dati produce una nuova revisione. Il caricamento non è un collegamento automatico ai gestionali: la data delle fonti resta visibile.

## Collaudo iniziale del 6 ottobre

`node tests/run-all.mjs invoicereconciliation rent rentadmin agencyaccounting vercelfunctions`: cinque suite verdi. La nuova suite verifica 47 condizioni, inclusi handler reale con rete simulata, privacy admin, import concorrente/ripetuto, filtri, errori, cambio sessione e mutazioni sulle regole delicate.

Anteprima desktop con soli dati sintetici: resa visiva, filtro scartate e ricerca senza risultati verificati nel browser. Il collegamento Chrome si è poi interrotto: verifica responsive mobile, import autenticato e verifica dopo pubblicazione ancora da eseguire. Il test automatico del controller copre anteprima, conferma, errore e recupero, ma non sostituisce il collaudo autenticato in produzione.

## Limiti contabili espliciti

Gli incassi fuori periodo e i tentativi non acquisiti restano ispezionabili ma non entrano nel lordo del periodo. Rimborsi cumulativi dell’export distinti dalle commissioni. Payout e incassi non vengono sommati. Una corrispondenza di importo/data/causale banca non certifica l’identificativo payout nel testo Sella. Un candidato fattura non equivale a pagamento riconciliato. La classificazione di compensi, canoni e depositi resta esplicita, mai dedotta automaticamente dal solo nominativo.

## Estensione 13 ottobre

Dieci viste, inclusa Da fare, con mastrini, bozze e uscite previste. Schema v1 retrocompatibile: nuove sezioni opzionali, vecchi digest immutati. Il prospetto privato del 13/10 integra i riscontri del 12/10; non è un nuovo accesso live ai gestionali. Le righe mastrino restano distinte dai pagamenti Stripe; le bozze non diventano nuove fatture emesse. Conteggi e importi reali sono nel fascicolo privato.

Sei suite pertinenti verdi, con 62 verifiche della riconciliazione e 32 dell’import bancario manuale (handler reale, rete simulata e mutazioni). Le estensioni usano lo stesso handler, autorizzazioni e archivio: nessuna nuova collection, dipendenza o segreto. La roadmap operativa e le integrazioni ancora da verificare sono in [FATTURE_WORKFLOW.md](FATTURE_WORKFLOW.md).

Anteprima sintetica del 13/10 verificata in Chrome desktop e mobile 390 px: navigazione Da fare/Uscite/Mastrini, ricerca senza risultati e nessuno overflow della pagina. Non è una prova di import autenticato in produzione.
