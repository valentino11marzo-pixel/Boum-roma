# Homie ↔ BOOM Roma · Bridge

Il ponte tra **Homie** (l'agente WhatsApp che gira sul Mac di Valentino) e il **portal BOOM Roma**.
Homie sa già leggere WhatsApp e ha una CLI; questi file gli danno (1) una **policy operativa** chiara e (2) un comando `boom` per tenere il portal sempre allineato — conservativo per design.

## File

- **`HOMIE.md`** — il manuale operativo di Homie. Caricalo come *system prompt* dell'agente. Lì vivono "qualità non quantità", Tier-1 (auto) vs Tier-2 (proponi) e le **regole di proattività**.
- **`boom`** — la CLI Node che Homie chiama (`boom heartbeat`, `boom message`, `boom action` …). Wrapper sopra `https://boomrome.com/api/agent/*` + `/api/homie/*`.
- **`install.sh`** — setup turnkey (30s) per il Mac: verifica Node, configura `HOMIE_SECRET`, abilita launchd keep-alive, smoke-test.
- **`test.sh`** — diagnostica end-to-end. Esegue ogni endpoint una volta e dice cosa è OK/KO.

## Setup sul Mac (una sola volta)

```bash
# 1) Copia ~/homie-bridge/  (questi 4 file)
# 2) Avvia l'installer:
cd ~/homie-bridge
bash install.sh
```

Ti chiederà solo **`HOMIE_SECRET`** (lo stesso valore che hai messo in Vercel → Environment Variables). Salva tutto in `~/.boom/env` con permessi 600, aggiunge l'autoload al tuo `~/.zshrc`, fa `chmod +x boom`, esegue uno smoke-test, e — se vuoi — installa il keep-alive `launchd` che chiama `boom heartbeat` ogni 30s.

Pronto. Dal momento dopo il `bash install.sh`, sul cockpit (`portal.html` → Command Center) **il pallino HOMIE diventa verde live**.

### Verifica veloce

```bash
bash test.sh
```

Esegue 9 controlli (heartbeat, snapshot, spec, risk, message round-trip, idempotency, action propose, inbox-sync). Output finale verde = puoi attaccare Homie alle vere conversazioni.

## Le 2 corsie (la policy operativa in una riga)

- **Tier 1 — Homie fa da solo** → `heartbeat`, `snapshot`, `lead-create`, `lead-update`, `note`, `message`, `inbox-sync`, `radar`, `digest`, `risk`.
- **Tier 2 — Homie propone, l'umano approva** → `action --kind reply|schedule_viewing|qualify|archive|note`. La proposta finisce in `action_queue` (`status:pending`) e compare nel cockpit + Telegram.

## Comandi (quick-ref)

```bash
boom heartbeat --status live --tool watching-whatsapp     # cockpit dot verde

boom snapshot                                              # "che succede nel portal?"
boom risk                                                  # cosa è a rischio adesso
boom digest                                                # briefing del giorno

# Tier 1 — autonomo
boom lead-create --name "Anna B." --phone "+39..." --source whatsapp \
  --zone "Trastevere" --budget 1200 --message "Cerco bilocale" \
  --grade B --confidence 0.8 --dedup
boom lead-update --id <leadId> --status responded --notes "Confermato interesse"
boom note --lead <leadId> --text "Preferisce piano alto"

# Mirror Inbox — UNO per ogni messaggio WhatsApp/email che vedi
boom message --direction in --channel whatsapp \
  --phone "+39333..." --name "Anna B." \
  --message-id "wamid.XXXX" \
  --body "Ciao, è ancora libero il bilocale?" \
  --summary "Chiede disponibilità bilocale Trastevere" \
  --needs-reply true --urgency medium \
  --suggested-reply "Ciao Anna! Sì, libero da luglio. Vuoi vederlo?"

# Riconcilia stati dopo aver scansionato TUTTO WhatsApp
echo '{"updates":[
  {"phone":"+39333...","status":"closed"},
  {"phone":"+39347...","needsReply":true,"urgency":"high","aiSummary":"Aspetta risposta da 3 giorni"}
]}' | boom inbox-sync -

# Tier 2 — PROPONI (va in approvazione, NON parte da solo)
boom action --kind reply --lead <leadId> --summary "Rispondere ad Anna sul bilocale" \
  --draft "Ciao Anna! Sì, il bilocale a Trastevere è disponibile da luglio..."
boom action --kind schedule_viewing --lead <leadId> --summary "Visita martedì 15-17"
boom ai-reply --lead <leadId>          # bozza da Claude, poi la proponi tu
```

Tutti i comandi accettano anche JSON via stdin: `echo '{...}' | boom message -`.

## Wire-up con l'agente WhatsApp

1. Dai a Homie **`HOMIE.md`** come system prompt operativo.
2. Dagli accesso a **`./boom <command>`** (oppure il tuo runtime LLM con tool-use lo richiama come command-execution tool).
3. Stop. Homie legge WhatsApp → decide secondo policy → chiama `boom` → portal aggiornato → Valentino vede tutto nel cockpit / Telegram.

## Telegram approve — chiude il loop (consigliato)

Per approvare le Tier-2 dal telefono mentre sei in giro. **Già implementato e
attivo:** un cron Vercel scansiona `action_queue` ogni minuto, ti notifica le
pending sul tuo Telegram con bottoni inline; tap su ✅ → `/api/agent/execute`
parte e l'azione viene eseguita davvero (WhatsApp/email inviato, viewing
schedulato, ecc.). Setup interattivo:

```bash
cd ~/homie-bridge
bash telegram-setup.sh
```

L'installer ti guida in 4 step (5 minuti): creazione bot via @BotFather → tuo
`TELEGRAM_CHAT_ID` → `TELEGRAM_WEBHOOK_SECRET` random → istruzioni precise di
cosa incollare in Vercel → chiama `setWebhook` per te → manda un messaggio
test al tuo Telegram per conferma.

Dopo: ogni `boom action` nuova arriva sul tuo telefono con
[✅ Approva] [❌ Rifiuta] [✏️ Modifica bozza]. Comandi testo nel bot:

- `/start /help` — guida
- `/queue` — pending in coda
- `/snapshot` — stato portal
- `/edit <id> <nuovo testo>` — riscrivi una bozza in attesa
- `/cancel` — annulla un edit in corso

**Env vars da impostare in Vercel** (l'installer te le ricorda):
`TELEGRAM_BOT_TOKEN` · `TELEGRAM_CHAT_ID` · `TELEGRAM_WEBHOOK_SECRET`.

## Troubleshooting

| Errore | Cosa significa | Fix |
|---|---|---|
| `HOMIE_SECRET not set` | manca la env var sul Mac | rilancia `bash install.sh` |
| `→ 401 invalid_secret` | il secret sul Mac ≠ quello di Vercel | rilancia `bash install.sh` e re-inserisci il secret corretto |
| `→ 403 Host not in allowlist` | Vercel Firewall blocca | Vercel → Firewall → aggiungi il Mac all'allowlist |
| `→ 500 server_misconfigured: HOMIE_SECRET unset` | Vercel non ha la env var | Vercel → Settings → Environment Variables → aggiungi `HOMIE_SECRET` |
| `ai-reply → no model` | il modello Claude non è disponibile sulla key | Vercel → `ANTHROPIC_MODEL=claude-haiku-4-5` |
| keep-alive non parte | launchd plist non caricato | `launchctl unload ~/Library/LaunchAgents/com.boomrome.homie.plist; launchctl load ~/Library/LaunchAgents/com.boomrome.homie.plist` |

## Disinstallare

```bash
launchctl unload ~/Library/LaunchAgents/com.boomrome.homie.plist 2>/dev/null
rm -f  ~/Library/LaunchAgents/com.boomrome.homie.plist
rm -rf ~/.boom
# (manualmente: rimuovi la riga "source ~/.boom/env" dal tuo ~/.zshrc se non la vuoi più)
```
