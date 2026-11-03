# Generatore sperimentale Mac — galleria e foto native

`experimental.mjs` costruisce un workflow di collaudo distinto dal comando distribuito. Legge i motori versionati e non contiene URL di annunci reali, dati di prova, percorsi del Mac o codice scaricato. Non modifica gli artefatti in `assets/tools` né `release.json`.

Servono le dipendenze dev del repository (`npm ci`): Acorn 8.15.0 ed Escodegen 2.1.0, fissati nel lockfile. La compattazione rimuove la formattazione e confronta gli AST prima e dopo, senza ottimizzazione o rinomina delle variabili. I riferimenti nativi vengono reinseriti con offset UTF-16 verificati. Le due dipendenze non entrano nelle API o nel comando generato.

Il solo passo di combinazione usa `merge-subset.mjs`: dal medesimo sorgente conserva `combineFrames`, il limite del payload e tutte le dipendenze transitive, comprese le validazioni. I corpi delle definizioni conservate restano identici; vengono eliminati soltanto gli altri nodi del modulo e ristretto l'export. Strutture non riconosciute, inizializzatori con effetti e dipendenze `RULES` dinamiche fermano la build. Il confronto con il motore completo verifica esiti validi, incompleti e non validi; non attribuisce a una dimensione precisa i blocchi osservati nel runtime nativo.

```sh
# Compila e mostra soltanto hash, versioni e dimensioni.
node tools/smartlink-shortcut/experimental.mjs

# Crea un nuovo plist unsigned nel percorso esplicito scelto.
node tools/smartlink-shortcut/experimental.mjs --output /private/tmp/boom-native-dynamic.unsigned.shortcut

# Prove offline del builder e del flusso simulato.
npm test -- smartlinkexperimental
```

L'output deve terminare in `.unsigned.shortcut`, stare fuori dagli asset distribuiti e non esistere già. Anche i collegamenti simbolici non possono indirizzare la scrittura negli asset. Il generatore non firma, installa, apre Safari, contatta la fonte o carica file. La firma ufficiale Apple e l'installazione sono passi separati.

Le 22 azioni compongono due cicli: piano → Repeat/Wait → frame sincroni → combinazione validata; quindi Repeat delle URL risultanti → download nativo → Base64 senza interruzioni → carrier media → appunti locali. Nessuna apertura automatica del Portal o pubblicazione. Le chiavi `downloadurl`, `base64encode` e `repeat.each` riproducono lo schema osservato negli export nativi Apple del 3 novembre 2026; nei sorgenti rimane solo la struttura, senza esportazioni personali.

Il prototipo usa il pannello Safari attivo sul Mac. `Nothing` prima dei JavaScript successivi al piano elimina l'input implicito Numero/Testo osservato nel runtime Mac; la pagina Idealista deve essere già aperta sulla galleria osservata. Altri portali non sono supportati da questo ciclo. Non è il percorso iPhone: il binding della pagina ricevuta da Condividi e il suo collaudo restano da completare.

Il motore verifica identità, ordine, conteggio e durata della raccolta. Il Portal mantiene il limite di 60 foto, 4 MB per foto e 16 MB di trasporto, richiede revisione e impedisce la pubblicazione di un risultato incompleto. Un errore nativo o un download negato non viene risolto tramite altre fonti, retry applicativi o credenziali.

Le prove automatiche eseguono il codice incorporato contro DOM e rete simulati: non sostituiscono la prova nativa dell'intera catena. In particolare vanno misurati il JavaScript di combinazione dopo l'espansione dei frame, gli errori nativi, la copia negli appunti e il passaggio nel Portal. Le prove native separate su acquisizione URL e download/trasporto di 15 foto non attestano ancora questa build completa né l'iPhone.
