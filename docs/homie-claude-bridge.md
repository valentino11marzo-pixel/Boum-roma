# Il ponte Homie ⇄ Claude — contesto operativo reale nelle sessioni di pianificazione

**Il problema:** le sessioni Claude Code vedono il codice, non la giornata.
Homie (l'agente OpenClaw sul Mac, agganciato a WhatsApp e Telegram) vede la
giornata, ma finora non la racconta a nessuno. Questo documento descrive il
ponte che collega i due — e come accendere le parti di Homie che oggi sono
costruite ma spente.

---

## 1 · La diagnosi (log di produzione Vercel, ultimi 7 giorni)

| Endpoint | Chiamate 7g | Lettura |
|---|---|---|
| `/api/agent/heartbeat` | 2.716 | ✅ Homie è vivo e connesso (ping ~ogni 4 min) |
| `/api/agent/risk.scan` | 720 | 👀 osserva i rischi (polling ~ogni 14 min) |
| `/api/agent/state.snapshot` | 718 | 👀 osserva lo stato (polling ~ogni 14 min) |
| `/api/agent/digest` | 1 | usato una volta |
| `/api/homie/message` (inbox WhatsApp) | **0** | ❌ non alimenta l'Inbox del portale |
| `/api/homie/inbox-sync` | **0** | ❌ non riconcilia le conversazioni |
| `/api/agent/leads.create` | **0** | ❌ non spinge lead |
| `/api/homie/action` (proposte tier 2) | **0** | ❌ non propone azioni |

**In sintesi: Homie oggi è una sentinella, non un collega.** Guarda, ma non
scrive, non propone, non racconta. Tutta l'infrastruttura per farlo agire
esiste già (17 tool, coda approvazioni, activity log) — va solo istruito.

---

## 2 · Il ponte: due tool nuovi

### `POST /api/agent/context.push` (Tier 1)
Homie spinge **una fotografia al giorno** della giornata reale dell'operatore
in `operatorContext/<YYYY-MM-DD>` (+ mirror su `/latest`). Idempotente per
giorno: push del mattino e della sera si compongono campo per campo.

```json
{
  "observations": "Giornata densa: 6 richieste nuove da Idealista, 2 viewing fatti, 1 no-show...",
  "habits":      { "activeHours": "9-13, 16-21", "peakChannel": "whatsapp" },
  "whatsapp":    { "conversations": 41, "needingReply": 6, "avgResponseMin": 22,
                   "topics": ["deposito", "disponibilità settembre", "foto extra"] },
  "painPoints":  ["risposte duplicate scritte a mano", "foto richieste 3 volte dallo stesso lead"],
  "wins":        ["pre-agreement Trastevere accettato in 2 ore"],
  "notes":       "Valentino operativo soprattutto sera; mattina = viewing"
}
```

### `POST /api/agent/context.pack` (Tier 1, sola lettura)
Compila in una chiamata **il pacchetto di contesto** per qualsiasi sessione
di pianificazione: osservazioni di Homie (ultimi 7g) + ritmo reale minato
dall'`activityLog` (chi agisce, su cosa, in quali ore) + numeri del portale
(lead/contratti/pagamenti/coda) + stato di Homie e tool realmente usati.
Risponde anche con `text`: un blocco in italiano pronto da incollare.

Autenticazione: le stesse di tutto il layer — `X-Homie-Secret` (Mac) o
`X-Firebase-Token` (browser admin). Nessun segreto nuovo.

---

## 3 · Setup su OpenClaw / Homie (10 minuti, una volta sola)

### a) Il cron serale "osserva e racconta" (21:30, ogni giorno)

Aggiungi a Homie un job schedulato con questo compito:

> Ogni sera alle 21:30: ripercorri la giornata su WhatsApp e Telegram.
> Conta le conversazioni attive, quante aspettano risposta, stima il tempo
> medio di risposta di Valentino, annota i 3–5 temi ricorrenti, le frizioni
> che hai notato (cose fatte a mano, ripetute, dimenticate) e le vittorie.
> Poi chiama `POST https://boomrome.com/api/agent/context.push` con header
> `X-Homie-Secret` (il segreto che già usi) e il JSON dei campi
> observations / whatsapp / painPoints / wins / notes. Non incollare chat
> grezze: sintetizza. Massimo 40KB.

### b) Il comando Telegram "context pack"

Insegna a Homie che quando Valentino scrive **"context pack"** (o "brief per
Claude") deve:

> Chiamare `POST https://boomrome.com/api/agent/context.pack` con
> `X-Homie-Secret` e body `{}`, prendere il campo `text` della risposta e
> incollarlo in chat come blocco di testo, senza commenti.

### c) Come si usa nelle sessioni di pianificazione

All'inizio di una sessione Claude (web, code, chat): scrivi "context pack" a
Homie su Telegram → copi il blocco → lo incolli come primo messaggio della
sessione. Da quel momento la pianificazione è ancorata alla tua realtà
operativa, non alle ipotesi.

---

## 4 · Accendere il resto di Homie (i flussi costruiti ma a zero chiamate)

In ordine di valore, i compiti da aggiungere a OpenClaw:

1. **Inbox WhatsApp nel portale** — dopo ogni scansione di WhatsApp, per ogni
   messaggio nuovo rilevante: `POST /api/homie/message` (idempotente su
   `messageId`) con `analysis{summary,intent,needsReply,urgency,suggestedReply}`.
   Risultato: l'Inbox del portale diventa la verità unica, col banner 🤖 e il
   flag "da rispondere".
2. **Riconciliazione** — a fine scansione completa: `POST /api/homie/inbox-sync`
   con il batch di aggiornamenti stato/urgenza/tag. Chiude il dimenticato.
3. **Lead automatici** — quando su WhatsApp/portali arriva una richiesta nuova
   qualificabile: `POST /api/agent/leads.create` (con `sourceRef` per il
   dedup). Oggi i lead nascono solo dal web: la strada WhatsApp è spenta.
4. **Proposte tier 2** — bozze di risposta pronte da approvare:
   `POST /api/homie/action` (kind `reply`) → approvazione con un tap da
   Telegram (il cron `notify-pending` gira già ogni minuto).
5. **Digest mattutino** — alle 07:30: `POST /api/agent/digest` e posta il
   `text` su Telegram (il PFS brief delle 06:00 copre il radar; questo copre
   lead+rischi del portale).

Ognuno di questi usa endpoint **già in produzione e già documentati** in
`api/agent/README.md` + `GET /api/agent/spec` — Homie li può scoprire da solo.

---

## 5 · Sicurezza

- Nessun segreto nuovo: tutto gira sul `HOMIE_SECRET` che il Mac già possiede.
- `context.push` accetta max 40KB e taglia i campi (niente dump di chat).
- Tutto finisce nell'`activityLog` — ogni push è verificabile dal portale.
- `operatorContext` è leggibile solo via admin (Firestore rules: nessun
  accesso client anonimo; l'endpoint `context.pack` richiede secret o token
  admin).

---

*Creato il 14 luglio 2026. Collegato al piano di agosto
(`PIANO-AGOSTO-2026.md`, Fase 2): il Manuale Operativo si scrive DOPO due
settimane di `context.push` — i processi si definiscono su come lavori
davvero, non su come immaginiamo che lavori.*
