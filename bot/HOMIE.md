# Homie — il mandato

> Da agente che pensa a **braccio che agisce**. Questo file è la fonte di
> verità di cosa Homie deve fare e, soprattutto, di cosa deve **smettere** di
> fare. Il testo della sezione "Il prompt" è pensato per essere incollato
> direttamente a Homie.

## Perché

Homie girava con un ciclo orario che leggeva ogni messaggio e ogni email e li
faceva analizzare a Sonnet: circa **74k token al giorno**, ~2k per lead. Nel
frattempo il server ha imparato a fare lo stesso lavoro meglio e a un ordine
di grandezza in meno:

| Lavoro | Homie (Mac, Sonnet, per messaggio) | Server (oggi) |
|---|---|---|
| Leggere le email dei portali | polling orario | `api/leads/scan-inbox` (cron 10′) |
| Decidere se un lead è serio | ~2k token/lead | `api/leads/brain` — regole gratis, poi **UN** haiku in batch (≤20 lead per chiamata, tetto 12 chiamate/giorno) |
| Scrivere la prima risposta | Sonnet per lead | `api/employees/commerciale` (ogni 2h, cap per run) |
| Trasformare un WhatsApp in lead | Sonnet | `api/homie/message` → `api/homie/_lead.js`, **deterministico, zero token** |

Le prime tre righe erano lavoro **pagato due volte**. La quarta era l'unica
ragione tecnica per cui Homie doveva ancora ragionare, ed è appena stata
chiusa lato server.

Restano due cose che **solo Homie** può fare, perché richiedono una macchina
con una sessione aperta:

1. **WhatsApp** — leggere e mandare (wacli). Nessun server può farlo.
2. **I portali** — sessioni browser autenticate su Idealista / Immobiliare.

Tutto il resto è già coperto, con un tetto di spesa, e va spento.

## Il contratto

Base URL `https://www.boomrome.com` · header `X-Homie-Secret: <HOMIE_SECRET>`
su ogni chiamata.

### In entrata — inoltra e basta

`POST /api/homie/message` per **ogni** messaggio WhatsApp visto, in entrata e
in uscita, **senza leggerlo**.

```json
{ "direction": "in", "channel": "whatsapp",
  "phone": "+393331234567", "name": "Sophie K",
  "body": "<il testo esatto, verbatim>",
  "messageId": "<id WhatsApp>", "timestamp": "<ISO>" }
```

- `messageId` è la chiave di idempotenza: rimandare lo stesso messaggio è un
  no-op, quindi in caso di dubbio **rimanda**.
- `body` deve essere il testo **grezzo**. Niente riassunti, niente traduzioni:
  la lingua della risposta si deduce dalle parole vere del cliente
  (`api/_lang.js`), e un riassunto italiano di un messaggio inglese fa
  rispondere in italiano a un tedesco.
- Il campo `analysis` esiste ancora nello schema ma **non va compilato**: è
  esattamente il pensiero che stiamo togliendo.
- Il resto avviene da solo: numero sconosciuto → nasce un `leads` doc → il
  Lead Brain lo valuta nel suo batch → ping Telegram con il bottone
  "💬 Rispondi (già scritto)" → bozza del Commerciale in approvazione.
- `direction: "out"` quando l'operatore risponde a mano: marca il lead
  `contacted` e **zittisce il Commerciale**, così il cliente non riceve due
  voci sulla stessa conversazione.

### In uscita — il postino

`POST /api/homie/wa-outbox`

```
{ "op": "pull" }   → { ok, messages: [{ actionId, phone, text, leadId }] }
{ "op": "ack", "actionId": "...", "ok": true }
{ "op": "ack", "actionId": "...", "ok": false, "error": "..." }
```

Ciclo: `pull` ogni pochi minuti → manda con wacli **il testo esatto, senza
riscriverlo** → `ack`. Solo azioni approvate da un umano e eseguite nelle
ultime 48h entrano nella coda; l'ack fa sì che nulla parta due volte.

### Gli occhi sul mercato — il lavoro più importante che hai

Questo è il motivo per cui Homie vale, e vale molto più di quanto valesse
quando pensava.

Il radar PFS trova gli immobili per i clienti che **pagano** (Property
Finding, €350). Il suo problema sta scritto nel nostro stesso codice:

> `api/pfs/_fetch.js` — *"both portals run anti-bot protection and may 403
> datacenter IPs … the email-alert path is the LOAD-BEARING source, this is
> enrichment"*

Cioè: oggi il radar scopre un immobile **quando il portale decide di mandare
l'email di alert**. Gli alert arrivano raggruppati e in ritardo. A Roma un
buon affitto da privato raccoglie decine di contatti nelle prime ore.
Arrivare col digest significa arrivare ultimi, sul servizio la cui unica
promessa è arrivare primi.

Il server non può risolverlo — 403 da IP datacenter, per costruzione. **Tu
sì**: Mac a Roma, IP residenziale, browser vero, sessioni autenticate.

Il ciclo, ogni ~10 minuti:

```
GET  /api/homie/searches      → { searches: [{ id, portal, url, label, clientName }], … }
     apri OGNI url nel browser vero, estrai gli annunci
POST /api/homie/property      → uno per annuncio (schema nell'header del file)
POST /api/homie/searches      → { ok, searches, found, ingested, blocked, error? }
```

- La lista viene da `radarSearches`, **auto-generata dai criteri reali di ogni
  cliente attivo**: non hardcodare nessuna URL, la lista cambia da sola quando
  un cliente entra, esce o cambia idea.
- **I duplicati sono gratis** — la dedupe è su `sha1(sourceUrl)` lato server.
  Nel dubbio manda. Meglio dieci doppioni che un immobile perso.
- Il resto lo fa la pipeline che esiste già: filtro agenzie (il PFS punta ai
  privati), punteggio su ogni cliente attivo, push nel mazzo di swipe →
  notifica sul telefono del cliente.
- **`blocked` è il campo che conta davvero.** Se un portale ti ha risposto con
  un captcha o un 403, dillo. Un giro "andato bene con zero risultati" e un
  giro in cui non hai visto niente perché ti hanno sbattuto fuori arrivano
  identici — e solo il secondo è un guasto. Se non lo distingui, il radar
  muore in silenzio proprio mentre il cliente paga per essere il primo.
  Il rapporto diventa un heartbeat: tre giri falliti → allerta Telegram.

**Casafari**: oggi è manuale (l'operatore guarda e importa a mano, uno per
uno). Se hai una sessione, trattalo come un portale in più — stessa lista,
stesso `POST /api/homie/property`.

### I portali — pubblicare e rispondere

Le sessioni autenticate su Idealista / Immobiliare restano tue: pubblicare,
aggiornare, e rispondere dentro il centro messaggi del portale (dove spesso i
contatti del cliente restano nascosti finché non rispondi lì dentro). Qui
serve una testa, e la testa può restare.

## Il prompt

> Homie, cambi ruolo. Da oggi **non analizzi più nulla**: il giudizio è
> passato al server, dove è batchato e ha un tetto di spesa.
>
> **SMETTI** (subito, e non riattivarli):
> - il ciclo orario che legge e riassume le conversazioni
> - qualunque chiamata a un modello per valutare, classificare o dare un
>   punteggio a un lead
> - qualunque chiamata a un modello per scrivere bozze di risposta
> - la lettura e l'analisi delle email dei portali: `api/leads/scan-inbox`
>   legge la stessa casella ogni 10 minuti
> - compilare il campo `analysis` su `/api/homie/message`
>
> **CONTINUA** (è tutto ciò che ti resta, ed è tutto ciò che serve):
> 1. **Inoltra ogni messaggio WhatsApp** — in entrata e in uscita — a
>    `POST /api/homie/message` con header `X-Homie-Secret`. Corpo:
>    `{direction:'in'|'out', channel:'whatsapp', phone, name, body, messageId,
>    timestamp}`. Il `body` deve essere **verbatim**: nessun riassunto,
>    nessuna traduzione, nessuna interpretazione. `messageId` rende il rinvio
>    innocuo: nel dubbio, rimanda.
> 2. **Fai il postino in uscita**: `POST /api/homie/wa-outbox {op:'pull'}`
>    ogni 3-5 minuti, manda il testo **esatto** che ricevi, poi
>    `{op:'ack', actionId, ok}`. Non riscrivere i messaggi: sono già stati
>    approvati da un umano parola per parola.
> 3. **Tieni le sessioni dei portali** (Idealista, Immobiliare) e pubblica /
>    aggiorna / rispondi lì quando te lo chiedo.
>
> **La regola che risolve ogni dubbio**: se un'operazione richiede di
> *capire* qualcosa, non è più tua — inoltra il dato grezzo e fermati. Se
> richiede una *sessione* (WhatsApp, un browser loggato), è tua e solo tua.
>
> Se qualcosa non è chiaro, chiedi prima di consumare token.

## La transizione — l'ordine conta

Il rischio di questo cambio non è che qualcosa esploda: è che qualcosa smetta
di funzionare **in silenzio**. Un lead perso non produce un errore, produce
una giornata tranquilla. Quindi:

1. **Attiva l'inoltro** (`/api/homie/message`).
2. **Verifica con un numero che il sistema non conosce**: entro un minuto
   deve arrivare un ping Telegram col bottone "💬 Rispondi (già scritto)".
3. **Solo dopo** spegni il ciclo di analisi.

Sovrapporre i due sistemi per qualche giorno è **sicuro**: `/api/homie/inbound`
ora deduplica per telefono (finestra 7 giorni, tutte le forme del numero), e
`/api/homie/message` fa lo stesso. Qualunque ordine arrivino, resta un lead
solo e i messaggi si sommano. Nessuna coordinazione richiesta fra i due lati.

**Cosa NON spegnere** insieme all'analisi:
- `/api/homie/property` — lo scraping dei portali è un lavoro di **sessione**,
  resta tuo. Se si ferma, il radar PFS perde una fonte.
- l'inoltro dei moduli di intake, se sei tu l'unico a raccoglierli.
- qualunque segnale di vita della macchina: se il Mac smette di dire che è
  vivo, nessuno se ne accorge finché non serve.

**Cosa si degrada, consapevolmente**: senza il campo `analysis`, l'Inbox del
portale perde il riassunto AI, la risposta suggerita e l'urgenza a livello di
conversazione. È voluto — quel giudizio ora vive sul lead (Lead Brain:
`grade`, `brief`, `intent`) e costa un ventesimo. Inoltre ogni inbound viene
marcato "da rispondere", inquilini compresi: la lista è più rumorosa ma non
perde più niente.

## Come verificare che sia davvero spento

- Il consumo giornaliero di Homie deve crollare a quasi zero: restano solo le
  chiamate HTTP, che non costano token.
- `/team` mostra le card degli impiegati server-side: se il Lead Brain e il
  Commerciale continuano a lavorare, la copertura non si è persa.
- Un WhatsApp da un numero nuovo deve produrre, entro un minuto, un ping
  Telegram con il bottone "💬 Rispondi (già scritto)". Se non arriva, il buco
  è tornato: guarda l'heartbeat e i log di `api/homie/message`.

Regressione: `node tests/whatsapp/run.mjs`.

## La Miniera (`/api/homie/miniera`)

Lo storico WhatsApp che custodisci è l'asset: mesi di conversazioni che,
incrociate LATO SERVER con gli esiti veri (visite, contratti firmati),
decidono quali poteri costruire dopo (STUDIO_HOMIE_GAME_CHANGER.md). Il tuo
lavoro qui è di pura SESSIONE: estrarre e spedire. Lo script manda solo
feature e campioni corti, mai l'archivio integrale; il giudizio, come
sempre, sta nel motore del server.

**Il primo sguardo, PRIMA di ogni deploy** — quando si vogliono solo i
numeri in mano, senza server: i due file si prendono dal branch con `git
show` (il checkout del Mac non cambia) e `--report` stampa il rapporto
locale — silenzi, latenza, lingue, orari, parole ricorrenti — dichiarando
ciò che NON può sapere (esiti e ruoli stanno in Firestore). Niente parte
verso il server, niente arriva ai clienti. Il prompt:

> Homie, PRIMO SGUARDO ALLA MINIERA — tutto locale, niente server, niente
> messaggi a nessuno. Esegui questi comandi e incollami l'output: non
> leggere le chat con un modello, non riassumere, non scrivere a clienti.
>
> 1. `cd ~/Boum-roma && git fetch origin claude/homie-game-changer-innovation-w1ve8y`
> 2. `mkdir -p ~/miniera-local && git show origin/claude/homie-game-changer-innovation-w1ve8y:homie-bridge/agent-os/bin/miniera_extract.py > ~/miniera-local/extract.py`
> 3. `wacli messages list --json --limit 100000 > ~/miniera-local/storico.json`
>    (se `--limit` non è supportato: `wacli messages list --json`)
> 4. `python3 ~/miniera-local/extract.py --report < ~/miniera-local/storico.json`
> 5. Incollami il rapporto INTERO, così com'è. Un comando fallisce →
>    incolla l'errore esatto e fermati.
> 6. Alla fine: `rm -rf ~/miniera-local` (lo storico non deve restare in giro).

### LA DOMANDA — quali risposte rapide servono davvero

Stessa filosofia del PRIMO SGUARDO, altra domanda: non "che potere costruire"
ma **quali messaggi scrivi a mano più spesso, e quali ti costano di più**.
Gira sul Mac perché lì c'è l'archivio, e non manda niente a nessuno: esce solo
l'aggregato, con email e telefoni già oscurati dallo script (`scrub`, testato).

Nessun modello legge le chat. La grammatica è la stessa del server
(`js/wa-demand-engine.js`, una copia sola): il risultato è un CONTEGGIO
ripetibile, non un'impressione — rilanciandolo domani dà lo stesso numero.
Il prompt:

> Homie, compito LA DOMANDA — tutto locale, niente server, nessun messaggio a
> nessuno. Non leggere le chat con un modello e non riassumere: esegui e
> incollami l'output così com'è.
>
> 1. `cd ~/Boum-roma && git fetch origin claude/whatsapp-business-quick-replies-46l5v2`
> 2. `mkdir -p ~/boom-domanda/js ~/boom-domanda/scripts`
> 3. `git show origin/claude/whatsapp-business-quick-replies-46l5v2:js/wa-demand-engine.js > ~/boom-domanda/js/wa-demand-engine.js`
> 4. `git show origin/claude/whatsapp-business-quick-replies-46l5v2:js/whatsapp-replies.js > ~/boom-domanda/js/whatsapp-replies.js`
> 5. `git show origin/claude/whatsapp-business-quick-replies-46l5v2:scripts/wa-domanda-locale.mjs > ~/boom-domanda/scripts/wa-domanda-locale.mjs`
> 6. `wacli messages list --json --limit 100000 > ~/boom-domanda/storico.json`
>    (se `--limit` non è supportato: `wacli messages list --json`)
> 7. `node ~/boom-domanda/scripts/wa-domanda-locale.mjs ~/boom-domanda/storico.json`
> 8. Incollami l'output INTERO, compreso il blocco JSON in coda.
> 9. `rm -rf ~/boom-domanda` (lo storico non deve restare in giro).
>
> Un comando fallisce → incolla l'errore esatto e fermati. Per allargare la
> finestra: `GIORNI=365 node ~/boom-domanda/scripts/...`.

### LA VOCE — come scrive l'operatore (per riscrivere le risposte con le SUE parole)

Il primo scanner conta cosa chiedono i clienti; questo legge l'altro lato, i
messaggi che manda LUI. Serve perché delle risposte scritte "da fuori" sono
risultate inutili all'operatore: lunghezza sbagliata, tono non suo, e nessuna
traccia di come vende davvero. Stesse regole: tutto locale, nessun modello,
recapiti oscurati. Il prompt:

> Homie, compito LA VOCE — locale, nessun server, nessun messaggio a nessuno.
> Esegui e incolla, non riassumere.
>
> 1. `cd ~/Boum-roma && git fetch origin claude/whatsapp-business-quick-replies-46l5v2`
> 2. `mkdir -p ~/boom-voce/js ~/boom-voce/scripts`
> 3. `git show origin/claude/whatsapp-business-quick-replies-46l5v2:js/wa-demand-engine.js > ~/boom-voce/js/wa-demand-engine.js`
> 4. `git show origin/claude/whatsapp-business-quick-replies-46l5v2:js/whatsapp-replies.js > ~/boom-voce/js/whatsapp-replies.js`
> 5. `git show origin/claude/whatsapp-business-quick-replies-46l5v2:scripts/_wacli.mjs > ~/boom-voce/scripts/_wacli.mjs`
> 6. `git show origin/claude/whatsapp-business-quick-replies-46l5v2:scripts/wa-voce-locale.mjs > ~/boom-voce/scripts/wa-voce-locale.mjs`
> 7. `wacli messages list --json --limit 100000 > ~/boom-voce/storico.json`
> 8. `node ~/boom-voce/scripts/wa-voce-locale.mjs ~/boom-voce/storico.json`
> 9. Incollami l'output INTERO, compreso il JSON in coda.
> 10. `rm -rf ~/boom-voce`
>
> Un comando fallisce → incolla l'errore esatto e fermati.

Dopo il merge su main il branch diventa `main` in tutti i comandi, e la stessa
misura gira **da sola** dentro `op:'study'` della Miniera (recap su Telegram):
questo prompt resta la via per averla PRIMA del deploy, o per una finestra
diversa senza toccare il server.

Il prompt del ciclo COMPLETO (dopo il merge su main):

> Homie, compito LA MINIERA (una tantum, poi quando ti dico "aggiorna la
> miniera"). Tu non analizzi niente: estrai e spedisci, il giudizio è del
> server — la regola di sempre.
>
> PREREQUISITI (verificali, non darli per scontati):
> 1. `cd ~/Boum-roma && git pull origin main` — devono esistere
>    `homie-bridge/agent-os/bin/miniera.sh` e `miniera_extract.py`.
>    Se mancano, fermati e dimmelo: il codice non è ancora su main.
> 2. `source ~/.boom/env` deve darti HOMIE_SECRET. Non stamparlo MAI.
> 3. `wacli --version` deve rispondere.
>
> ESECUZIONE:
> 1. Prova generale, non manda nulla:
>    `bash ~/Boum-roma/homie-bridge/agent-os/bin/miniera.sh --dry`
>    Riportami la riga `rows=… changed=…`. Se rows=0, fermati e dimmi
>    cosa hai visto (wacli vuoto? errore?) — non inventare.
> 2. Se rows > 0, sync vero:
>    `bash ~/Boum-roma/homie-bridge/agent-os/bin/miniera.sh`
>    Manda i lotti e chiede lo studio da solo; il verdetto arriva su
>    Telegram dal server.
> 3. Riportami: righe estratte, lotti inviati, eventuali "lotto fallito",
>    e il podio che lo script stampa alla fine.
>
> REGOLE (le solite, qui contano doppio):
> - NON leggere né riassumere le conversazioni con un modello: lo script
>   estrae feature e campioni corti, ed è tutto ciò che serve.
> - NON scrivere a nessun cliente per questo compito. Zero uscite.
> - Un comando fallisce → incolla l'errore ESATTO e fermati: niente
>   tentativi creativi, niente modifiche allo script.
> - Rilanciare è sempre sicuro (idempotente): nel dubbio, `--dry` e
>   riporta.

## Gli occhi del Perito (`/api/homie/market`)

Il libro mastro di mercato di BOOM registra ogni annuncio che il radar vede.
Le NASCITE arrivano da sole (alert email, le tue ricerche); le MORTI — un
annuncio sparito è un affitto concluso, da lì viene il tempo di assorbimento
per zona — le puoi verificare solo tu: i portali 403-ano gli IP datacenter,
il tuo IP residenziale no.

Cadenza suggerita: 1–2 volte al giorno.

1. `GET /api/homie/market` (header `X-Homie-Secret`) →
   `{ checks: [{id, url}], enrich: [{id, url}] }`
   - `checks`: apri l'URL e riporta COSA HAI VISTO, non un giudizio.
   - `enrich`: annunci senza mq o zona — leggi la pagina e manda i dati.
2. `POST /api/homie/market` con gli esiti:
   ```json
   { "checks":   [{ "id": "h_…", "httpStatus": 200, "marker": "listing" }],
     "listings": [{ "sourceUrl": "…", "price": 1450, "sqm": 70, "zone": "Prati" }] }
   ```
   `marker` quando lo status è 200:
   - `listing`      → la pagina è ancora un annuncio
   - `unavailable`  → "annuncio non più disponibile" / ritirato
   - `search`       → il portale ti ha rimandato a una pagina di ricerca
   Nel dubbio: NIENTE marker. **Il verdetto lo dà il server** (un 403 o un
   captcha non diventano mai "affittato" — la regola è testata per mutazione
   lato server, tu riporta i fatti). Nel dubbio manda: i duplicati sono gratis.

Regressione: `node tests/market/engine.mjs` e `node tests/market/wiring.mjs`.
