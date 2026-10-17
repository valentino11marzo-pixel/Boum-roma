# BOOM SmartLink Foto · ponte Chrome

Alcuni portali, incluso Immobiliare.it, rifiutano le richieste dei server Vercel. Il Portal prova prima la pagina pubblica e il Radar BOOM; se non riceve foto, questo ponte apre l'annuncio nella sessione Chrome dell'operatore e legge gli URL della galleria. Le immagini vengono poi scaricate dal server BOOM, ottimizzate nel Portal e caricate in Storage BOOM. Il cliente vede solo la scheda BOOM.

## Installazione una tantum

1. In Chrome apri `chrome://extensions` e attiva **Modalità sviluppatore**.
2. Premi **Carica estensione non pacchettizzata** e seleziona questa cartella `tools/smartlink-extension`.
3. Apri `https://www.boomrome.com/portal#boom-tools` nello stesso profilo Chrome. In SmartLink Studio incolla l'URL, premi **Importa annuncio e foto**, controlla e riordina le immagini, quindi crea la scheda.

Il ponte non ha credenziali BOOM, non legge cookie e non pubblica nulla. Apre un tab inattivo solo quando premi il pulsante e lo chiude al termine. Se il portale mostra un captcha o richiede login, l'operatore deve completarlo nella propria sessione Chrome; il ponte non aggira quelle protezioni.

## Verifica

`npm test -- smartlink` controlla estrazione, filtri CDN, handler foto e parser del ponte. Il collaudo completo richiede l'estensione attiva nello stesso Chrome del Portal e un annuncio accessibile in quella sessione. Un test della sola preview locale non prova il flusso autenticato di produzione.
