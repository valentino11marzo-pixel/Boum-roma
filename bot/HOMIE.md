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

### I portali — l'unica cosa che resta tua

Pubblicare, aggiornare e rispondere su Idealista / Immobiliare dalle sessioni
autenticate. Qui serve una testa, e la testa può restare.

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
