# Crea SmartLink BOOM

Comando rapido per la condivisione volontaria di un annuncio già aperto in Safari.
Riceve soltanto **Pagine web di Safari** dal menu Condividi. Legge il documento con
i motori BOOM incorporati, copia il JSON negli appunti del dispositivo e apre
`https://www.boomrome.com/portal?smartlink-share=1#boom-tools`.
Nel Portal l'operatore preme **Importa da Safari** e controlla la scheda prima di pubblicarla.

## Build e controlli

```sh
node tools/smartlink-shortcut/build.mjs
node tools/smartlink-shortcut/build.mjs --check
node tools/smartlink-shortcut/test.mjs
plutil -lint assets/tools/boom-smartlink-safari-1.0.0.unsigned.shortcut
```

L'artefatto XML plist è riproducibile: stessi motori, stessi byte. Il generatore legge
`js/smartlink-engine.js` e `js/smartlink-share-engine.js`; i digest nei commenti
identificano le copie incorporate. Non scarica codice e non aggiunge dipendenze.
Il controllo `--check` fallisce se uno dei due motori è cambiato dopo la build.
Rigenerare il file e ricreare la copia firmata dopo ogni aggiornamento dei motori.

Quattro azioni native, con passaggio dell'output all'azione successiva:

1. `is.workflow.actions.runjavascriptonwebpage` con parametro `WFJavaScript`.
2. `is.workflow.actions.setclipboard` con `WFLocalOnly: true` (niente Handoff).
3. `is.workflow.actions.url` con parametro `WFURLActionURL` costante, senza dati dell'annuncio.
4. `is.workflow.actions.openurl`, che riceve soltanto la URL del punto precedente.

Il JS legge la pagina ricevuta, senza richieste, cookie, storage o credenziali.
I due UMD usano un oggetto locale, senza affidarsi a globals della pagina.
Negli appunti finiscono il payload validato oppure un codice errore chiuso;
mai HTML integrale, stack o messaggi di eccezione. Limiti del motore: 128 KiB,
60 foto, indirizzi e fonti consentiti. La copia sostituisce gli appunti correnti.

## Firma e installazione: controllo separato

Il file `.unsigned.shortcut` è un **artefatto di sviluppo non firmato**. Non basta
pubblicarlo per dichiararlo installabile su iPhone. La firma e la distribuzione
sono un passaggio di release distinto, da eseguire dopo la revisione:

```sh
smartlink_sign_dir="$(mktemp -d /tmp/boom-smartlink-sign.XXXXXX)"
plutil -convert binary1 -o "$smartlink_sign_dir/unsigned.shortcut" assets/tools/boom-smartlink-safari-1.0.0.unsigned.shortcut
shortcuts sign --mode anyone --input "$smartlink_sign_dir/unsigned.shortcut" --output assets/tools/boom-smartlink-safari.shortcut
node tools/smartlink-shortcut/build.mjs --manifest
node tools/smartlink-shortcut/test.mjs
```

Il comando è documentato anche da `shortcuts sign --help`; non viene eseguito dal
generatore o dai test. La firma può dipendere dai servizi Apple e non prova il
funzionamento su un dispositivo. Il 31 ottobre 2026 la firma locale del plist binario
è riuscita fuori dal sandbox; nel sandbox lo stesso file restituiva il generico
errore “isn't in the correct format”. Verificare quindi il contesto di esecuzione
prima di modificare un plist già valido. Non è necessario modificare le azioni.

`--manifest` registra in `release.json` i digest SHA-256 del sorgente unsigned,
della copia firmata e dei due motori. Non firma e non installa il file: va eseguito
subito dopo una firma riuscita della build corrente. I test confrontano tutti i
digest quando la copia firmata è presente, e falliscono su file cambiati o motori
non aggiornati. Il manifest rileva modifiche accidentali; non convalida da sé la
firma Apple o il contenuto interno dell'archivio firmato.

Prima della consegna verificare sulla copia firmata:
apertura in Comandi Rapidi, aggiunta, comparsa in Condividi di Safari, permesso JS,
copia del JSON, apertura Portal, consenso agli appunti e importazione foto.
Questo pacchetto non dichiara già superati tali controlli nativi.

## Uso previsto su iPhone o iPad

1. Installare la copia **firmata** con “Aggiungi comando rapido”.
2. In Impostazioni di Comandi Rapidi, Avanzate, abilitare “Consenti esecuzione script”.
3. Aprire l'annuncio nel sito con Safari, quindi Condividi → “Crea SmartLink BOOM”.
4. Consentire l'esecuzione sulla pagina se Apple lo chiede. Può ricomparire per altri annunci.
5. Nel Portal aperto dal comando, accedere se necessario e premere “Importa da Safari”.
   Consentire l'accesso agli appunti se Safari lo richiede; il Portal offre anche Incolla.
6. Controllare dati, numero foto e anteprima prima della pubblicazione.

Serve Safari recente con le API JavaScript usate dai motori BOOM. Il comando va
avviato dal menu Condividi della **pagina web**, non da un semplice URL o dal riquadro
dell'app Comandi Rapidi. I consensi Apple non vengono eliminati dal software.
Una pagina di verifica, una galleria caricata solo in parte o una struttura non
riconosciuta può impedire l'importazione o lasciarla incompleta. Il comando non apre
immagini nascoste né altre pagine; il conteggio disponibile va controllato nel Portal.

## Fonti del contratto

- Apple, azione JS e completamento: https://support.apple.com/en-ie/guide/shortcuts/apd218e2187d/ios
- Apple, creazione ed esecuzione dalla condivisione: https://support.apple.com/guide/shortcuts/use-the-run-javascript-on-webpage-action-apdb71a01d93/ios
- Apple, consensi per pagina e comando: https://support.apple.com/en-au/guide/shortcuts/apdfeb05586f/ios
- Apple, condivisione e convalida dei file: https://support.apple.com/guide/shortcuts/share-shortcuts-apdf01f8c054/ios
- Schema pubblico delle azioni nel progetto ScPL: https://docs.scpl.dev/actions/runjavascriptonwebpage,
  https://docs.scpl.dev/actions/copytoclipboard, https://docs.scpl.dev/actions/url,
  https://docs.scpl.dev/actions/openurls.

Apple documenta il comportamento delle azioni; le chiavi plist sono verificate sullo
schema pubblico ScPL e sul parser plist di macOS, non su uno schema ufficiale Apple
pubblicato. La prova nativa di installazione ed esecuzione rimane quindi necessaria.
