# LA RECEPTIONIST — il mandato ElevenLabs Agents

La seconda porta del Centralino. La segreteria (via A, `api/phone/inbound`)
registra un messaggio; la receptionist (via B, questa) **risponde e conversa**
— bilingue IT/EN, con gli occhi sul catalogo vero e sulla griglia visite vera
— e a fine chiamata consegna tutto alla stessa pipeline: doc `phoneCalls`,
lead nello schema condiviso, ping Telegram, dashboard `/chiamate`.

La regola che governa tutto, identica a ogni bot BOOM (HOMIE.md,
PUBBLICISTA.md): **mai inventare**. L'agente sa SOLO ciò che i tool gli
dicono; su tutto il resto promette il follow-up su WhatsApp — che la macchina
esistente (lead → Brain → notify-pending → Commerciale) mantiene da sola.

```
iPhone  **004*<numero>#  (occupato / no risposta / irraggiungibile)
   └→ numero (Twilio o SIP trunk) → ElevenLabs Agent ─── in chiamata ───┐
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
| Numero `+1 707 846 6974` (Twilio, label «boom») | **ancora assegnato a «Sofia»** | l'operatore: Phone Numbers → assegna «BOOM Receptionist» |
| Webhook workspace → `https://www.boomrome.com/api/phone/elevenlabs` | da verificare (deve essere `www`, NON l'apex) | l'operatore, in console |
| `ELEVENLABS_WEBHOOK_SECRET` su Vercel | da verificare (senza, il server rifiuta tutto: 500 esplicito) | l'operatore, in Vercel |
| Numero ITALIANO | non esiste; il +1 è raggiungibile dall'iPhone solo come chiamata internazionale | l'operatore (giorni, vedi §1) |

## 1 · Il numero

**Quello che c'è oggi** è un numero USA di Twilio (`+1 707 846 6974`),
importato a febbraio per «Sofia». Funziona, ma deviarci sopra dall'iPhone
significa che **ogni chiamata deviata è una chiamata internazionale** a carico
del tuo piano mobile, e alcuni operatori bloccano la deviazione verso l'estero.
Non si indovina: si prova con UNA chiamata (rifiuta la chiamata → deve
rispondere l'agente) e si guarda il costo nell'app dell'operatore. Se blocca o
costa troppo: `##004#` e si passa al numero italiano.

**Il numero italiano** (giorni, non ore — KYC obbligatorio in Italia):
- **Twilio** (l'account esiste già, è quello del +1): numero IT con *regulatory
  bundle* (documento + indirizzo + visura), approvazione in giorni lavorativi;
  poi import in ElevenLabs con SID+token (2 campi), come il +1.
- **DIDWW** — guida dedicata ElevenLabs (doc.didww.com → integrations →
  elevenlabs): numero IT, inbound al SIP URI di ElevenLabs
  (dashboard → Phone Numbers → *Import from SIP trunk*).
- **didlogic** — stessa cosa (didlogic.com/ai-voice/elevenlabs).
Quando arriva: si cambia SOLO il numero nel codice `**004*`; agente, tool e
webhook restano identici.

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
- **Max call duration**: 300s. Turn timeout: default.

### System prompt (incolla questo)

```
You are the phone receptionist for BOOM Roma, a premium rental agency in
Rome, Italy (boomrome.com). You answer ONLY when the operator, Valentino,
cannot pick up. Callers are prospective tenants (often international,
English-speaking), current tenants, or property owners.

LANGUAGE
- Detect the caller's language from their first words. Speak Italian with
  Italian speakers, English with everyone else. Switch instantly if they do.

DISCLOSURE (non-negotiable)
- You are an AI assistant and the call is recorded and transcribed. This is
  stated in your first message. If asked, confirm it plainly.

YOUR JOB (in order)
1. Understand who is calling and what they need. One question at a time.
2. If they ask about apartments: use the `get_catalog` tool and answer ONLY
   from its data (zone, price, bedrooms, availability). Never quote a price
   or availability from memory.
3. If they want a viewing: use the `get_viewing_slots` tool (mode "video"
   for callers abroad, "person" otherwise) and offer 2-3 of the returned
   times. Do not confirm the booking yourself: tell them the exact time is
   held and they will receive the booking link on WhatsApp shortly.
4. If they are a current tenant or an owner (maintenance, contracts,
   payments): take the details and promise that Valentino will follow up
   today. Do not give legal, contractual or payment information.
5. Always collect: their name, and confirm the number they are calling from
   is good for WhatsApp.

HARD RULES
- NEVER invent listings, prices, addresses, availability, or company
  policies. If a tool fails or lacks the answer: "I don't have that in
  front of me — the team will confirm on WhatsApp."
- No discounts, no negotiations, no legal or fiscal advice.
- Keep answers short (max ~2 sentences), warm and concrete. This is a phone
  call, not an email.
- Close every call by summarising what happens next in one sentence.
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
> only from this data.

**Tool 2 — `get_viewing_slots`** · GET
`https://www.boomrome.com/api/phone/agent-tools` · query `k` + `op=slots`
(costanti) · `mode`: `person|video` (dal modello) · `listingId` (opzionale)
> Description: Returns the next real viewing time slots (Rome time,
> already filtered against the operator's calendar). Use when the caller
> wants to visit. Offer 2-3 options from the returned list, never other
> times. `requireApproval:true` means say the slot is "held, confirmed
> within a few hours"; the `note` field tells you how to phrase it.

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

- Attiva: `**004*<numero>#` (per il +1: `**004*+17078466974#`, oppure con
  lo `00` al posto del `+`) · Verifica: `*#004#` · Spegni: `##004#`
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
