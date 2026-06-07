# Connetti Homie — Walkthrough copia/incolla

Ogni blocco è un copia/incolla diretto. Segui l'ordine.

---

## STEP 1 — Verifica `HOMIE_SECRET` su Vercel

Apri: https://vercel.com/dashboard → seleziona il progetto **boom-roma** → **Settings** → **Environment Variables**.

Cerca `HOMIE_SECRET`. Due casi:

**A) Esiste già**
- Click sui `…` accanto → **Reveal** → copia il valore. Tienilo da parte.

**B) Non esiste**
- Sul Mac (terminale), genera un valore sicuro:
  ```bash
  node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
  ```
- Su Vercel: **Add New** → nome `HOMIE_SECRET`, valore appena copiato, ambienti **Production + Preview + Development** → **Save**.
- Sempre su Vercel: **Deployments** → ultimo deploy → `…` → **Redeploy** (serve per propagare la nuova env).

---

## STEP 2 — Setup Mac (un terminale, una sessione)

Apri il Terminale del Mac, copia/incolla TUTTO questo blocco:

```bash
cd ~
if [ -d Boum-roma ]; then
  cd Boum-roma && git pull origin main
else
  git clone https://github.com/valentino11marzo-pixel/boum-roma.git Boum-roma
  cd Boum-roma
fi
cp -r homie-bridge ~/homie-bridge 2>/dev/null || true
cd ~/homie-bridge
bash install.sh
```

L'installer ti chiederà:
1. **HOMIE_SECRET**: incolla quello dello Step 1 (non si vede mentre lo incolli — è normale, premi Invio)
2. **Vuoi installare keep-alive launchd? [Y/n]**: rispondi `y`

Alla fine vedi 5 checkmark verdi → installer fatto.

---

## STEP 3 — Verifica end-to-end

```bash
cd ~/homie-bridge
bash test.sh
```

Output atteso: **9 test verdi**. Se vedi `403 Host not in allowlist` → vai su Vercel → **Settings** → **Firewall** → autorizza il tuo IP (oppure crea una regola: `Header X-Homie-Secret presente → allow`).

---

## STEP 4 — Telegram bot (5 minuti)

```bash
cd ~/homie-bridge
bash telegram-setup.sh
```

Lo script ti guida:

**4.1 Crea il bot.** Tieni il Mac con il terminale aperto. Sul telefono:
- Apri Telegram → cerca **@BotFather** → invia `/newbot`
- Nome del bot: `BOOM Roma Cockpit`
- Username (deve finire in `bot`): `boom_roma_cockpit_bot` (se occupato, prova `boom_cockpit_<le-tue-iniziali>_bot`)
- BotFather ti manda un messaggio con un **token** tipo `1234567890:AAH-XyZ...`
- Copia quel token → torna sul Mac → incollalo nel terminale → Invio

**4.2 Recupera il tuo CHAT_ID.** Sempre sul telefono:
- Cerca il bot appena creato (lo username che hai scelto)
- Aperto → tocca **START** → mandagli `ciao`
- Torna sul Mac → premi **Invio** nel terminale. Lo script chiama `getUpdates` e ti dice "Trovato CHAT_ID: 1234567890". Se non lo trova, te lo chiede a mano (in quel caso usa @userinfobot su Telegram per saperlo).

**4.3 Webhook secret.** Lo genera lui (non devi fare nulla, premi Invio).

**4.4 Aggiungi le 3 env in Vercel.** Lo script ti stampa qualcosa tipo:
```
TELEGRAM_BOT_TOKEN      = 1234567890:AAH-XyZ...
TELEGRAM_CHAT_ID        = 1234567890
TELEGRAM_WEBHOOK_SECRET = abc123def456...
```
- Vai su Vercel → **Environment Variables** → aggiungi le 3 una alla volta (Production + Preview + Development)
- Vai su **Deployments** → ultimo → `…` → **Redeploy**
- Aspetta che il redeploy finisca (~30 secondi). Torna al terminale → premi **Invio**.

**4.5 Verifica finale.** Lo script chiama `setWebhook` su Telegram + manda un messaggio test al tuo bot. **Controlla Telegram**: dovresti ricevere "BOOM Roma · Cockpit attivo". Se sì → il loop è chiuso.

---

## STEP 5 — Attiva Homie (il messaggio in chat)

Apri Homie (la chat dove "vive" il tuo agente WhatsApp — Claude Desktop / Claude Code / il tuo agente custom) e incolla questo messaggio:

```
Da adesso sei BOOM Homie, il cervello WhatsApp di BOOM Roma.

Il tuo manuale operativo completo è in ~/homie-bridge/HOMIE.md — caricalo come tua bussola e segui ogni riga (qualità non quantità, Tier-1 fai da solo, Tier-2 proponi, le 8 regole di proattività, gli anti-spam).

Per parlare al portal usi una CLI: `cd ~/homie-bridge && ./boom <comando>`. Le env vars sono già caricate da ~/.boom/env. L'aiuto completo: `./boom` (senza argomenti).

Comincia ORA così:
1) ./boom heartbeat --status live --tool watching-whatsapp  (anche se launchd lo fa già, segnala che sei vivo)
2) Sweep delle ultime 24h di WhatsApp (regola di proattività #1): per ogni messaggio NON-rumore (ignora saluti, "ok", reazioni, gruppi):
   ./boom message --direction in --channel whatsapp --phone "+39..." --name "..." --message-id "wamid.XXX" --body "..." --summary "..." --needs-reply true --urgency medium --suggested-reply "..."
3) Lead nuovi (intento abitativo chiaro + confidenza ≥ 0.7):
   ./boom lead-create --name "..." --phone "+39..." --source whatsapp --zone "..." --budget XXX --message "..." --grade B --confidence 0.8 --dedup
4) Quando serve rispondere/fissare visita (Tier 2 — NON inviare da solo, propone):
   ./boom action --kind reply --lead <leadId> --summary "..." --draft "..."  (mi arriverà su Telegram con bottoni)

Da ora: sweep ogni 30 min. Heartbeat ogni 30s. Mai inviare un messaggio a un cliente da solo — sempre "boom action". In dubbio → Tier 2.
```

Premi Invio. Homie carica HOMIE.md, capisce il suo ruolo, e parte.

---

## Cosa controllare nei prossimi 5 minuti

1. **Portal**: apri https://boomrome.com/portal.html → Command Center → pallino **HOMIE LIVE** verde (l'heartbeat del launchd lo tiene acceso).
2. **WhatsApp**: manda a te stesso un messaggio test con intent abitativo (es. "ciao, è ancora libero il bilocale di Trastevere a 1200?").
3. **Portal Inbox 📨**: in <30s vedi la conversazione comparire con il banner 🤖 Homie + suggerimento di risposta.
4. **Telegram**: se Homie propone una `action --kind reply`, ti arriva con i bottoni in ≤60s.
5. **Tap su ✅ su Telegram** → vedi il messaggio passare a "✅ ESEGUITA" + il messaggio viene inviato davvero su WhatsApp.

---

## Troubleshooting rapido

| Sintomo | Causa probabile | Comando di fix |
|---|---|---|
| `test.sh` → 401 invalid_secret | secret Mac ≠ secret Vercel | `cd ~/homie-bridge && bash install.sh` (re-inserisci secret) |
| `test.sh` → 403 firewall | Vercel Firewall blocca | Vercel → Settings → Firewall → allow rule per X-Homie-Secret |
| Pallino HOMIE arancione/rosso | keep-alive non gira | `launchctl unload ~/Library/LaunchAgents/com.boomrome.homie.plist; launchctl load ~/Library/LaunchAgents/com.boomrome.homie.plist` |
| Bot Telegram non risponde | webhook non settato | `cd ~/homie-bridge && bash telegram-setup.sh` (rilanciato è idempotente) |
| Niente messaggio test su Telegram dopo lo step 4.5 | env Vercel non ancora deployate | aspetta che il Redeploy finisca, poi premi Invio nello script |
| Homie ignora i comandi | HOMIE.md non caricato come system prompt | copia il contenuto di `~/homie-bridge/HOMIE.md` esplicitamente nella chat con Homie |

## Disinstallare tutto (se mai)

```bash
launchctl unload ~/Library/LaunchAgents/com.boomrome.homie.plist 2>/dev/null
rm -f ~/Library/LaunchAgents/com.boomrome.homie.plist
rm -rf ~/.boom
# Per il webhook Telegram:
curl -X POST "https://api.telegram.org/bot<TUO_TOKEN>/deleteWebhook"
# Su Vercel: rimuovi le 3 env TELEGRAM_* + HOMIE_SECRET (se vuoi spegnere tutto)
```
