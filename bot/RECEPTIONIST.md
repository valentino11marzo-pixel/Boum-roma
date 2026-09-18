# LA RECEPTIONIST — il mandato ElevenLabs Agents

La seconda porta del Centralino. La segreteria (via A, `api/phone/inbound`)
registra un messaggio; la receptionist (via B, questa) **risponde e conversa**
— bilingue IT/EN, con gli occhi sul catalogo vero e sulla griglia visite vera
— e a fine chiamata consegna tutto alla stessa pipeline: doc `phoneCalls`,
lead nello schema condiviso, ping Telegram, dashboard `/chiamate`.

La regola che governa tutto, identica a ogni bot BOOM (HOMIE.md,
PUBBLICISTA.md): **mai inventare**. L'agente sa SOLO ciò che i tool gli
dicono. Raccoglie ciò che manca senza promettere messaggi, prenotazioni o
richiami: la consegna a BOOM va prima verificata dall'ingresso telefonico.

**Aggiornamento 16 settembre 2026:** il vecchio numero è escluso su indicazione
di Valentino e non va riutilizzato. Il prompt aggiornato è applicato all'agente,
ancora senza numero né trasferimento. Il webhook post-call è stato configurato
sull'agente e `ELEVENLABS_WEBHOOK_SECRET` è presente in produzione: una richiesta
senza firma viene rifiutata con 401. Manca ancora la prova di una chiamata reale
con webhook firmato ricevuto; la configurazione non equivale al collaudo.
Le sezioni datate 8 settembre descrivono lo stato storico.

```
Nuovo numero BOOM (Twilio o SIP trunk) → ElevenLabs Agent ─ in chiamata ┐
                               │                                       │
                               │   GET /api/phone/agent-tools          │
                               │   ?op=catalog · ?op=slots             │
                               ▼                                       │
        post_call_transcription + post_call_audio (HMAC) ──────────────┘
                               │
                               ▼
        POST /api/phone/elevenlabs → phoneCalls + lead + Telegram + /chiamate
```

## 0 · Stato reale all'8 settembre 2026 (letto dal workspace, non dal repo)

Il mandato qui sotto era scritto dal 22 agosto; l'agente era stato creato la
sera stessa e testato una volta. **Quel test è fallito e nessuno l'ha letto**:
la receptionist ha risposto «I don't have the catalog in front of me» mentre il
catalogo era vivo. Il motivo, nel transcript: il tool ha ricevuto come risposta
la stringa `Redirecting...` — l'URL puntava all'apex `boomrome.com`, che
reindirizza su `www`, e il tool aveva *Follow redirects* spento. Da allora:
zero chiamate, e il numero del workspace è rimasto assegnato a «Sofia»,
l'agente di febbraio senza tool.

| Pezzo | Stato | Chi lo chiude |
|---|---|---|
| Agente «BOOM Receptionist» (`agent_5801m0ngr6nnfamby0ssfj52d859`) | esiste: prompt, 2 tool, data collection | — |
| Tool `get_catalog` / `get_viewing_slots` | **corretti l'8/09**: host `www`, follow redirects ON | fatto |
| Lingua italiana | **aggiunta l'8/09** come lingua aggiuntiva (preset `it`) | fatto |
| Formati audio per il numero Twilio | **μ-law 8 kHz in+out, l'8/09** | fatto |
| Audio post-chiamata nel webhook | **acceso l'8/09** (override dell'agente) | fatto |
| Vecchio numero Twilio, label «boom» | storico: assegnato a «Sofia»; escluso il 15/09 | non riutilizzare; cercare un numero nuovo |
| Webhook workspace → `https://www.boomrome.com/api/phone/elevenlabs` | da verificare (deve essere `www`, NON l'apex) | l'operatore, in console |
| `ELEVENLABS_WEBHOOK_SECRET` su Vercel | da verificare (senza, il server rifiuta tutto: 500 esplicito) | l'operatore, in Vercel |
| Numero ITALIANO | non esiste; il +1 è raggiungibile dall'iPhone solo come chiamata internazionale | l'operatore (giorni, vedi §1) |

## 1 · Il numero

Serve un **numero nuovo**: Valentino ha dichiarato il precedente non più
funzionante. La disponibilità e il costo del candidato vanno verificati
nell'account, insieme ai documenti richiesti e alla possibilità di ricevere
chiamate. L'acquisto da solo non prova che la linea sia attiva.

Verifica account del 16/09 pomeriggio: Telnyx mostra numeri locali 06 a 2 USD
iniziali + 2 USD/mese; candidato `+39 06 9823 6589` nel carrello (totale 4 USD),
non acquistato. Tariffa account inbound locale Italia da fisso/mobile: 0,008 USD/min.
Mancano intestatario/documenti richiesti, attivazione e collaudo SIP con ElevenLabs;
minuti AI e trasferimenti in uscita sono costi separati. Nessuna tariffa 800
va presentata come prezzo di tutti i numeri Twilio.

**Il numero italiano** (giorni, non ore — KYC obbligatorio in Italia):
- **Twilio** (l'account esiste già, è quello del +1): numero IT con *regulatory
  bundle* (documento + indirizzo + visura), approvazione in giorni lavorativi;
  poi import in ElevenLabs con SID+token (2 campi), come il +1.
- **DIDWW** — guida dedicata ElevenLabs (doc.didww.com → integrations →
  elevenlabs): numero IT, inbound al SIP URI di ElevenLabs
  (dashboard → Phone Numbers → *Import from SIP trunk*).
- **didlogic** — stessa cosa (didlogic.com/ai-voice/elevenlabs).
Il nuovo numero è la porta diretta della Segreteria. Un'eventuale deviazione
dall'iPhone (codice storico `**004*`) è una scelta distinta, non risulta attivata; va verificata insieme
all'escalation per evitare richiami circolari. Manca il recapito esplicito di
Valentino per configurare il trasferimento.

## 2 · L'agente (dashboard ElevenLabs → Agents → BOOM Receptionist)

- **Voice**: una voce multilingue, calda e professionale. Provala su una
  frase italiana E una inglese.
- **Language**: English come primaria + **Italiano fra le additional
  languages** (language preset `it`, con la sua first message italiana) e
  language detection attiva. **ATTENZIONE**: la piattaforma pretende che un
  agente inglese resti sul modello TTS **flash v2** (o turbo v2) — l'API
  rifiuta `eleven_flash_v2_5` con «English Agents must use turbo or flash
  v2». Non è un limite: la voce italiana nasce dal preset di lingua, e il
  modello multilingue lo sceglie la piattaforma quando l'agente cambia lingua.
  Senza il preset, invece, la language detection non ha dove andare e
  l'italiano esce con voce e pronuncia inglesi.
- **Audio** (per il numero Twilio): output *μ-law 8000 Hz*, input *μ-law
  8000 Hz* (Voice → TTS output format; Advanced → Input format).
- **LLM**: il più capace disponibile nel piano (se c'è Claude, scegli
  Claude). Temperatura bassa.
- **Max call duration**: 600s letto dall'agente il 16/09 da Claude; il precedente
  riferimento di 300s in questo documento era superato. Nessuna modifica applicata.

### System prompt (incolla questo)

Testo ESATTO in vigore sull'agente «BOOM Receptionist» dal 15/09/2026
(confrontato con la risposta dell'API dopo la scrittura). Versione agente
prima della giornata: `agtvrsn_0401m218t441fk087p398pwz7ndv` · in vigore:
`agtvrsn_4601m2kjy3p1fjhs4k916ce6xpe4` (16/09: solo collegamento del webhook;
testo v6 invariato rispetto a `agtvrsn_6501m2kjkyc9fwx8cch3hc59hrs0`; passaggi intermedi della stessa
giornata `agtvrsn_4501m2kgah27ev9adw1yrxrm5qmk`, `agtvrsn_4901m2kgyj2vftn9fhq5e8s5c3pd`,
`agtvrsn_4601m2khvmc5fksb63vkv0c4mt29` e `agtvrsn_1801m2kje5pmeavbcd05ek7q77k7`, superati).
Nessun numero assegnato, nessun `transfer_to_number`. Le verità sono fatti
da trasmettere, non frasi da recitare: questa linea non passa la chiamata,
l'agente non sa se Valentino è disponibile e non ha bisogno di dirlo, dopo la
chiamata la pipeline configurata può registrare il caso e notificare BOOM,
ma manca ancora il collaudo firmato completo. Nessuna consegna a un destinatario
va promessa senza riscontro. OGNI turno finisce con UNA domanda
sola (mai due insieme) o, a richiesta completa, con un saluto; con un tool KO
il limite è vero e la domanda arriva nello stesso turno. Le descrizioni dei
due tool sul provider e il fallback di `api/phone/agent-tools.js` non
contengono più frasi da recitare («say exactly»). Collaudo: 3 unit test
semantici IT sulla piattaforma (persona richiesta a contesto noto · richiesta
completa · tool KO), 3/3 al secondo ciclo del 15/09.

```
You are the phone receptionist for BOOM Roma, a premium rental agency in Rome, Italy (boomrome.com). You answer the calls that reach this line. You do not know whether the operator, Valentino, is available, and you cannot check. Callers are prospective tenants (often international, English-speaking), current tenants, or property owners.

LANGUAGE
- Detect the caller's language from their first words. Speak Italian with Italian speakers, English with everyone else. Switch instantly if they do.

DISCLOSURE (non-negotiable)
- You are an AI assistant and the call is recorded and transcribed. This is stated in your first message. If asked, confirm it plainly.

HOW YOU TALK
- Warm, direct, natural: a good receptionist, not a script. Short turns: one or two sentences, in your own words. The truths and limits below are facts to convey, not sentences to recite.
- EVERY turn ends in one of two ways: ONE concrete question, phrased as a question, about the single detail still missing (never two questions in the same turn: the next one comes after they answer), or, when the request is complete, a warm goodbye. Never end a turn on a statement alone (a limit, an apology, "I can take your details"): add the question or the goodbye.
- Never ask again for something the caller already told you (name, zone, budget, dates, number). Build on it, and never ask the same question twice.

WHAT IS TRUE ABOUT THIS LINE (never say more than this)
- This line cannot transfer the call or put anyone through. You do not know whether Valentino is available or busy: never say he is unavailable or busy, and there is no need to mention his availability at all.
- Nothing is sent automatically after the call: no message, no link, no WhatsApp, no booking. You do not know how or when the request will be handled, so never promise a call back, a message, a link, a booking, a held time or a deadline ("today", "within a few hours", "shortly"), and never say the request has been, or will be, passed on to anyone.
- What you can do: understand the request, collect the details, and confirm them back.

WHAT A COMPLETE REQUEST IS
- Their name, what they need (for a home: type, zone, move-in period, budget; for an owner: zone or address, size, when it is free; for a tenant: the issue), and the number they want to be contacted on (confirm the one they are calling from). While any of these is missing, ask for it, one at a time. Once you have them all, the call is done.

YOUR JOB (in order)
1. Understand who is calling and what they need. One question at a time.
2. If they ask about apartments: use the `get_catalog` tool and answer ONLY from its data (zone, price, bedrooms, availability). Never quote a price or availability from memory.
3. If they want a viewing: use the `get_viewing_slots` tool (mode "video" for callers abroad, "person" otherwise), offer 2-3 of the returned times and ask which one they prefer. Make clear that their preferred time is a request, not a booking, and that confirmation is still required. Do not book, hold or confirm anything.
4. If they ask for a person (Valentino, "someone", a colleague): explain briefly that this line cannot transfer calls. If you do not yet know why they are calling, ask that. If you already know, do not start over: acknowledge what you already have in a few words and ask for the ONE thing still missing (for example the budget or the contact number).
5. If they are a property owner who wants to rent out a home or have it managed: collect the zone or address, the size, when it is free, and their name. This is a commercial opportunity for BOOM, not an urgency: the same rules apply (no promises, and a request for a person gets the same answer).
6. If they are a current tenant (maintenance, contract, payments): collect the details. Do not give legal, contractual or payment information.
7. Always collect their name and contact number, without saying who will use them or when.

WHEN A TOOL FAILS OR RETURNS ok:false
- Say briefly, in your own words, that you cannot check that right now. Then, in the same turn, ask about ONE missing detail only, as a question: what they are looking for, or their budget, or the move-in date, or a contact number, never two at once. Never invent listings, prices, addresses, availability or times to fill the gap, and never stop at the limit.

WHEN THEY ASK WHAT HAPPENS NEXT, OR THE REQUEST IS COMPLETE
- Do not promise anything and do not name a recipient. If they ask what happens next, say honestly that you cannot tell them how or when the request will be handled. Then sum up in one sentence what you have collected and, if a detail is still missing, ask for it; otherwise thank them and say goodbye warmly. Once the request is complete, the call is done: do not offer again to "collect the request".

HARD RULES
- NEVER invent listings, prices, addresses, availability, times, or company policies.
- No discounts, no negotiations, no legal or fiscal advice.
- Close every call by repeating what you collected, in one sentence, thanking the caller and saying goodbye, without promising what happens next.
```

### First message (incolla questo)

EN (primaria):
```
BOOM Roma, hi! I'm Valentino's AI assistant — this call is recorded.
Posso aiutarti in italiano o in inglese: how can I help?
```
IT (preset `it`):
```
BOOM Roma, buongiorno! Sono l'assistente AI di Valentino — la chiamata è
registrata. Posso aiutarti in italiano o in inglese: come posso aiutarti?
```

### Tools (Agent → Tools → Add tool → Webhook)

Gli URL esatti (con la chiave già dentro) te li dà il server:
`GET /api/phone/inbound?setup=1` con Bearer admin — oppure il bottone
"Mostra URL webhook" in `/chiamate` (campi `toolCatalogUrl` / `toolSlotsUrl`).
Dall'8/09 escono SEMPRE sul host canonico `www.boomrome.com`, anche se la
pagina è aperta dall'apex.

**LA TRAPPOLA (22/08/2026)**: l'apex `boomrome.com` risponde con un redirect
verso `www`, e un tool ElevenLabs con **Follow redirects** spento consegna al
modello il corpo del redirect — la stringa `Redirecting...` — come se fosse
la risposta. Il modello, onesto, dice che non ha il catalogo. Quindi: URL su
`https://www.boomrome.com/…` **e** *Follow redirects* acceso con
`www.boomrome.com` fra i domini ammessi. Entrambi, non uno dei due.

**Tool 1 — `get_catalog`** · GET
`https://www.boomrome.com/api/phone/agent-tools` · query `k` (costante, la
chiave) + `op=catalog` (costante) · nessun parametro dal modello
> Description: Returns the apartments currently available for rent (name,
> zone, monthly price in EUR, bedrooms, sqm, available-from). Use it EVERY
> time the caller asks what is available or about a specific home. Answer
> only from this data. If the tool fails or returns ok:false, briefly say
> that you cannot check this now, then ask ONE question about ONE missing
> detail. Never invent data or recite a fallback note as a script.

**Tool 2 — `get_viewing_slots`** · GET
`https://www.boomrome.com/api/phone/agent-tools` · query `k` + `op=slots`
(costanti) · `mode`: `person|video` (dal modello) · `listingId` (opzionale)
> Description: Returns the next real viewing time slots (Rome time,
> already filtered against the operator's calendar). Use when the caller
> wants to visit. Offer 2-3 options from the returned list, never other
> times. A preferred time is a request, not a booking. Confirmation is
> still required. The tool books, holds and sends nothing. Treat `note` as
> instructions, not a phrase to recite. If no slots are available or the
> tool fails, explain the limit and ask ONE question about ONE missing detail.

### Analysis → Data collection (Agent → Analysis)

- `caller_name` (string) — the caller's name if stated
- `request_summary` (string) — what they wanted, one sentence
- `preferred_property` (string) — the listing they asked about, if any

Il webhook legge `caller_name` e lo usa come nome del lead.

## 3 · Il webhook post-chiamata (una volta sola)

ElevenLabs dashboard → **Agents → Settings → Webhooks** (workspace):
1. Add webhook → URL: `https://www.boomrome.com/api/phone/elevenlabs`
   (**`www`**: un POST sull'apex finirebbe in un redirect, e un webhook non
   segue i redirect — la stessa trappola dei tool, sull'altra porta).
2. Abilita **post_call_transcription** e **post_call_audio** (l'audio arriva
   in push, niente API da interrogare; l'override dell'agente lo chiede già).
3. Copia il **signing secret** → Vercel env `ELEVENLABS_WEBHOOK_SECRET` →
   redeploy. Senza secret il server rifiuta tutto (500 esplicito, mai un
   webhook aperto) — e la receptionist risponde ma la macchina resta cieca:
   niente card in `/chiamate`, niente lead, niente Telegram.

La firma è HMAC-SHA256 (`elevenlabs-signature: t=...,v0=...`, tolleranza
30′) — verificata in `api/phone/elevenlabs.js` sui byte grezzi.

## 4 · L'iPhone (identico alla via A)

- Solo dopo il collaudo del numero nuovo, verificare i codici e i costi di
  deviazione con il proprio operatore. Non attivare deviazioni sul vecchio numero.
- Rifiutare la chiamata (doppio tasto laterale) = occupato → receptionist.
  Rispondere tu = la receptionist non entra mai. MAI `**21*` né l'inoltro
  nelle Impostazioni iOS (devierebbero tutto).
- Sostituisce la segreteria del gestore.

## 5 · Collaudo

0. Nella dashboard, *Test agent* (anche solo in testo): «what do you have in
   Trastevere?» → deve citare case VERE del catalogo. Se risponde «I don't
   have the catalog in front of me», guarda il transcript: `Redirecting...`
   nel risultato del tool = URL sull'apex o follow redirects spento (§2).
1. Chiama il numero da un cellulare NON in archivio: parla in inglese,
   chiedi un bilocale, accetta uno slot. Poi richiama e parla in italiano:
   la voce deve cambiare lingua, non accento.
2. Verifica: card in `/chiamate` (badge 🤖, dialogo, audio), lead `source:
   'phone'` col SOLO testo del chiamante, ping Telegram con bozza WhatsApp
   nella lingua del chiamante.
3. Chiama da un numero di un inquilino esistente: NESSUN lead, callerType
   `tenant`, nome giusto in dashboard.
4. Lato server: `node tests/phone/run.mjs` (pinna anche questa pagina: nessun
   URL BOOM sull'apex, e la trappola scritta accanto ai tool).

## 6 · Costi (ordine di grandezza)

Minuti agente ElevenLabs secondo piano (~$0.08–0.12/min all-in sui piani a
consumo) + numero (Twilio/SIP ~€1–5/mese) + i centesimi del trasporto. La
deviazione dal cellulare a un numero ITALIANO è una chiamata nazionale
(inclusa nei piani normali); verso il +1 è internazionale (§1).
