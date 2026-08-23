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
   └→ numero (SIP trunk) → ElevenLabs Agent ──── in chiamata ────┐
                               │                                  │
                               │   GET /api/phone/agent-tools     │
                               │   ?op=catalog · ?op=slots        │
                               ▼                                  │
        post_call_transcription + post_call_audio (HMAC) ─────────┘
                               │
                               ▼
        POST /api/phone/elevenlabs → phoneCalls + lead + Telegram + /chiamate
```

## 1 · Il numero (senza console Twilio)

ElevenLabs accetta numeri via **SIP trunk** da qualunque provider standard
(dashboard → Phone Numbers → *Import a phone number from SIP trunk*).
Per un numero ITALIANO:

- **DIDWW** — ha la guida dedicata ElevenLabs (doc.didww.com → integrations →
  elevenlabs): compri il numero IT, punti l'inbound al SIP URI di ElevenLabs,
  fine. KYC italiano richiesto dalla normativa (documento + indirizzo), ma il
  flusso è self-service.
- **didlogic** — stessa cosa (didlogic.com/ai-voice/elevenlabs), numeri in
  130+ paesi.
- In alternativa: import di un numero Twilio (2 campi, SID+token) se un
  giorno diventasse accettabile.

NOTA sul numero estero: tecnicamente puoi comprare un numero non-IT e
deviarci sopra, ma la deviazione condizionale verso l'estero è una chiamata
internazionale a carico del TUO piano mobile e alcuni operatori la bloccano.
Da verificare col proprio operatore prima di considerarla.

## 2 · L'agente (dashboard ElevenLabs → Agents → New agent)

- **Voice**: una voce multilingue (famiglia *eleven multilingual*), calda e
  professionale. Provala su una frase italiana E una inglese.
- **Language**: English come primaria + **Italiano** fra le additional
  languages con language detection attiva.
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

```
BOOM Roma, hi! I'm Valentino's AI assistant — the call is recorded.
Posso aiutarti in italiano o in inglese: how can I help?
```

### Tools (Agent → Tools → Add tool → Webhook)

Gli URL esatti (con la chiave già dentro) te li dà il server:
`GET /api/phone/inbound?setup=1` con Bearer admin — oppure il bottone
"Mostra URL webhook" in `/chiamate` (campi `toolCatalogUrl` / `toolSlotsUrl`).

**Tool 1 — `get_catalog`** · GET · nessun parametro
> Description: Returns the apartments currently available for rent (name,
> zone, monthly price in EUR, bedrooms, sqm, available-from). Use it EVERY
> time the caller asks what is available or about a specific home. Answer
> only from this data.

**Tool 2 — `get_viewing_slots`** · GET · query param `mode`: `person|video`
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
1. Add webhook → URL: `https://boomrome.com/api/phone/elevenlabs`
2. Abilita **post_call_transcription** e **post_call_audio** (l'audio arriva
   in push, niente API da interrogare).
3. Copia il **signing secret** → Vercel env `ELEVENLABS_WEBHOOK_SECRET` →
   redeploy. Senza secret il server rifiuta tutto (500 esplicito, mai un
   webhook aperto).

La firma è HMAC-SHA256 (`elevenlabs-signature: t=...,v0=...`, tolleranza
30′) — verificata in `api/phone/elevenlabs.js` sui byte grezzi.

## 4 · L'iPhone (identico alla via A)

- Attiva: `**004*<numero>#` · Verifica: `*#004#` · Spegni: `##004#`
- Rifiutare la chiamata (doppio tasto laterale) = occupato → receptionist.
  Rispondere tu = la receptionist non entra mai. MAI `**21*` né l'inoltro
  nelle Impostazioni iOS (devierebbero tutto).
- Sostituisce la segreteria del gestore.

## 5 · Collaudo

1. Chiama il numero da un cellulare NON in archivio: parla in inglese,
   chiedi un bilocale, accetta uno slot.
2. Verifica: card in `/chiamate` (badge 🤖, dialogo, audio), lead `source:
   'phone'` col SOLO testo del chiamante, ping Telegram con bozza WhatsApp
   in inglese.
3. Chiama da un numero di un inquilino esistente: NESSUN lead, callerType
   `tenant`, nome giusto in dashboard.
4. Lato server: `node tests/phone/run.mjs`.

## 6 · Costi (ordine di grandezza)

Minuti agente ElevenLabs secondo piano (~$0.08–0.12/min all-in sui piani a
consumo) + numero SIP (~€1–5/mese) + i centesimi del trasporto SIP. La
deviazione dal cellulare al numero italiano è una chiamata nazionale
(inclusa nei piani normali).
