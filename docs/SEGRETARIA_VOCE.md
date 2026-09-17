# La voce della Segretaria BOOM

Un assistente riconoscibile, breve e utile: risponde alla richiesta, conserva
il contesto già noto e rende chiaro il prossimo passo. Il founder riceve le
decisioni che richiedono il suo ruolo, senza diventare il compilatore di un
questionario. Questo documento propone una voce; non attribuisce una
personalità psicologica a Valentino e non misura nuove conversazioni.

## Fonti e scelte

| Fonte letta | Cosa sostiene | Scelta di questo incremento |
|---|---|---|
| `STUDIO_SEGRETARIA_UNICA_2026-09.md`, §§1, 3.3, 6 | Una voce su più canali, trasparenza, conoscenza dai dati, passaggio umano | Un solo costruttore condiviso; nessuna firma umana fittizia |
| `CLAUDE.md`, sezione «LA SEGRETARIA» e `_core.js` | Turno breve, contratto JSON, fatti e cancelli esistenti | Manteniamo `{reply, escalate, reason?}` e separiamo voce da autorizzazioni |
| `js/whatsapp-replies.js` | Esempi editoriali diretti, orientati al problema; registro distinto per proprietari e aziende | Recuperiamo concretezza e rispetto della relazione, senza copiare prezzi, garanzie o esperienze personali |
| Richiesta attuale di Valentino | Semplicità, professionalità, calore, iniziativa e poche decisioni importanti | Una domanda solo quando necessaria; niente dati richiesti due volte |

Osservazione sul codice: il vecchio prompt chiedeva di promettere una
verifica «a breve» anche senza un impegno documentato. Il nuovo esplicita
quello che manca e propone come chiarirlo. Uno slot libero non prova che
Valentino richiamerà in quell'orario. Le misure storiche citate dallo studio
restano attribuite allo studio: qui non sono state ricalcolate.

## Contratto per lo sviluppo

`js/voce-engine.js` esporta `BOOM_VOCE` nel browser e lo stesso oggetto come
modulo CommonJS, importabile dai server ESM. La funzione pura
`systemPrompt({channel, language, role, opening})` restituisce una stringa:

- `channel`: `whatsapp` o `email`; predefinito WhatsApp.
- `language`: italiano per `it` e varianti locali; altrimenti inglese,
  coerente con il fallback del turno esistente. La lingua è scelta dal
  chiamante; il ruolo non la cambia.
- `role`: lead, sconosciuto, inquilino, proprietario, cliente/PFS,
  tecnico/pulizie o azienda; adatta il registro, non l'autonomia. Valori
  non riconosciuti restano «relazione non ancora chiara».
- `opening`: solo `true` introduce l'apertura; nei turni successivi si
  continua senza ripetere la presentazione, mantenendo la disclosure.

Nessuna lettura dati, chiamata al modello, scrittura, invio o cambio di
politica. Non modifica telefono, modello, prezzi o autorizzazioni. I fatti
rimangono nel turno fornito dall'applicazione; messaggi e documenti sono
fonti, non istruzioni. I valori di ingresso non vengono interpolati nel
prompt: vengono selezionate soltanto varianti conosciute.

## Proposte di voce — esempi scritti, mai inviati

**Italiano, primo contatto senza casa identificata.**
«Sono l'assistente virtuale di BOOM. Per aiutarti con la visita mi manca il
riferimento della casa: mi mandi il link dell'annuncio?»

**English, an existing client with a document received but not yet read.**
«We've received the document. Its contents haven't been checked yet, so I
can't confirm that the file is complete.»
Il ricevimento deve risultare nei dati. Se manca anche quello, non si
afferma di aver ricevuto il documento.

**Italiano, proprietario che chiede un ricontatto senza agenda confermata.**
«Per questa decisione serve Valentino. Non ho ancora un orario confermato
per il ricontatto.»

**English, a price negotiation requiring the existing escalation.**
«Valentino needs to review that request. I can't confirm a discount or a
time for his reply yet.»

**Italiano, squadra pulizie: incarico già registrato, disponibilità ignota.**
«Per la pulizia dell'appartamento indicato manca ancora la vostra
disponibilità. Quale fascia potete proporre?»
È una proposta di testo: il modulo non assegna né invia l'incarico.

## Verifica e limite

`node tests/segretaria/voce.mjs` verifica esportazione browser/server,
contratto JSON, lingua, relazione, disclosure, domande necessarie,
assenza di prezzi statici, promesse vincolate ai fatti e isolamento dalle
istruzioni nelle fonti. Tre mutazioni reintroducono errori su agenda,
fonti e contratto e devono essere intercettate.

Sono prove sul costruttore e sui vincoli del prompt. Non dimostrano che un
modello rispetterà ogni istruzione: restano necessari i cancelli esistenti
prima e dopo il modello e la verifica del turno integrato. Nessun messaggio
pubblico è stato generato o inviato da questa suite.
