# Amministrazione BOOM: stato e percorso operativo

## Quello che esiste in questo ramo

Fatture BOOM riusa `invoiceReconciliations` (Firestore privato, revisioni immutabili) e l'API admin già esistente. La vista **Da fare** riassume bozze, scarti, verifiche aperte e uscite documentate. **Mastrini** conserva ogni riga con riferimento e classificazione; **Bozze** distingue data incasso e data documento; **Uscite previste** separa confermate, stimate, pagate e annullate, con importo/data sconosciuti espliciti. **Fonti** mostra controllo e copertura per sistema. Il collegamento a `/banca` riusa Banca & Fisco.

Il caricamento di un nuovo prospetto non sincronizza banca, Stripe o TIC. La data di composizione non rinnova le date delle fonti. Nessun saldo disponibile, ricavo o debito IVA è derivato dalle somme nei mastrini o dalle bozze. Le viste sono una proiezione delle evidenze private, non una seconda contabilità.

## Routine proposta al titolare

- **Prima di chiedere un pagamento:** collegare cliente, beneficiario del servizio e pratica; raccogliere i dati di fatturazione; indicare distintamente compenso, IVA, anticipo già versato, deposito e canone. Il pagatore può essere diverso dall'intestatario.
- **Alla ricezione:** acquisire la prova del pagamento; classificare ogni componente; collegare eventuale anticipo già fatturato; preparare la bozza e il controllo documentale. Il payout Stripe è un trasferimento, non un secondo incasso cliente.
- **Ogni giorno lavorativo:** controllare nuovi incassi non classificati, bozze ferme e ricevute SdI. Una mancata consegna va distinta da uno scarto; l'aggiornamento dell'anagrafica non sana il documento scartato.
- **Ogni settimana:** chiudere gli abbinamenti banca/Stripe, reperire le fatture passive mancanti, aggiornare le uscite delle prossime settimane e le somme da riversare ai proprietari.
- **Ogni mese:** consegnare al consulente un unico pacchetto con movimenti, fatture/XML, esiti, depositi/riversamenti e domande residue. Registrare il riscontro del consulente per ogni punto.

La routine “alla ricezione” è una regola organizzativa. La fattura immediata segue in generale il termine di dodici giorni dall'effettuazione dell'operazione; il presupposto IVA e l'eventuale differita vanno individuati per il servizio concreto, senza attendere un closing successivo per classificare l'anticipo. Fonte normativa verificata il 13 ottobre 2026: [DPR 633/1972, art. 21](https://www.normattiva.it/uri-res/N2Ls?urn%3Anir%3Apresidente.repubblica%3Adecreto%3A1972%3B633~art21=). Nessuna scadenza fiscale viene generata da questa frase o assegnata automaticamente alle pratiche storiche.

## Integrazioni: riuso e prove necessarie

| Sistema | Percorso esistente | Prossima prova prima di chiamarlo automatico |
| --- | --- | --- |
| Sella | `/banca`, `bankAccounts`, `bankTransactions`, `api/banking/import.js`, `sync.js`, `scan-inbox.js` | Verificare configurazione effettiva, consenso/copertura, ultimo successo, deduplica e riconciliazione. Non attivare il sync alla cieca: può registrare pagamenti riscontrati. |
| Stripe | Checkout/webhook esistenti, riferimenti charge/payment intent/payout | Verificare copertura dell'account e storico, rimborsi, commissioni e retry; collegare l'ID certo alla pratica. Export storico e webhook non sono la stessa copertura. |
| Zucchetti | Prospetti e XML originali importati | Verificare disponibilità e condizioni dell'integrazione/export e accesso agli esiti SdI. Nessuna API TIC già operativa viene presunta. |
| People / Pratiche / Contratti | Record esistenti del portale | Collegare tramite ID confermato; il nome o l'importo da soli non provano l'identità. Non creare seconda rubrica. |
| Costi | Costi Stripe documentati + nuove uscite censite nel prospetto | Acquisire fatture/contratti/rinnovi con importo, scadenza, stato e prova. Non proiettare una spesa storica come rinnovo certo. |
| Imposte | Indicazione scritta del consulente | Periodo, imponibili, crediti, importo, scadenza ed eventuali correzioni/ravvedimenti. La stima sulle bozze non è una liquidazione. |

## Passaggio di studio

Conferma del titolare del 13 ottobre: nuovo studio con decorrenza 1 gennaio 2027; gestione del 2026 ancora da chiarire. L'incarico al nuovo studio non è ancora documentato. Prima del passaggio assegnare per iscritto: chi chiude il 2026, chi cura dichiarazioni e adempimenti successivi relativi al 2026, chi sistema gli scarti e chi comunica importi/scadenze da versare. Preparare consegna di registri, mastrini, fatture/XML/esiti, F24/ricevute, saldi iniziali e questioni aperte.

## Sequenza di completamento

1. **Preparato:** estensione del portale e import privato del 13/10 con 104 righe e 25 bozze; test automatici. Nessun dato reale nel repository.
2. **Rilascio da completare:** merge secondo AGENTS, pubblicazione con regole Firestore, prova autenticata admin/non-admin e import del prospetto aggiornato. Il ramo non certifica il portale live.
3. **Da realizzare/verificare:** collegamenti automatici sopra elencati e modifica operativa delle uscite dalla UI con audit e gestione della concorrenza. Oggi le nuove voci si acquisiscono con una nuova revisione del prospetto.
4. **Da confermare col titolare/consulente:** le voci economiche ancora ambigue, trattamento degli scarti e scadenze fiscali; nessuna emissione automatica autorizzata.

Non servono nuovi abbonamenti o una migrazione di gestionale come prerequisito di questa prima consegna.
