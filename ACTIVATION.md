# BOOM — Activation Runbook (the 3 dormant engines)

Tutto il codice è **già in produzione**. L'attivazione è quasi solo configurazione
(secret su Vercel + il tuo certificato Apple + il Mac). Questo è l'ordine esatto.

> Dopo aver aggiunto/cambiato env su Vercel → **Redeploy** (Deployments → ⋯ → Redeploy),
> altrimenti le funzioni non le vedono.

---

## 1) Apple Wallet LIVE (push)

**Cosa serve (Vercel → Settings → Environment Variables):**
- `PASS_CERT_BASE64`, `PASS_KEY_BASE64`, `PASS_KEY_PASSPHRASE` — firma del pass (già usate per generarli).
- `PASS_AUTH_SECRET` — un secret a tua scelta (stabilizza i token del web service). Consigliata.
- `AGENT_ADMIN_EMAILS` — la tua email admin (per Issue/Push dalla Pass Studio).

**Il cancello vero (lato Apple, solo tu):** il **Pass Type ID** `pass.com.boomrome.proppass`
deve essere **abilitato al push**. I certificati Pass Type lo sono di norma; se il tuo non lo è,
i pass si installano ma **non si aggiornano**.

**Verifica (dottore integrato):** Pass Studio → **Diagnostica** (oppure `POST /api/pass-diag`
con auth admin). Ora riporta:
- `apns.pushEnabled: true/false` ← apre una connessione reale ad APNs col tuo cert.
- `signing.certConfigured`, `env_ok{…}`, `deviceRegistrations`, e un singolo `nextStep`.

**Sequenza di prova:**
1. Diagnostica → tutti i cancelli verdi (`ready: true`).
2. Da iPhone (Safari, su boomrome.com) aggiungi un pass **reale** (collegato a un record).
3. Pass Studio → **Push** su quel pass → deve aggiornarsi sulla lock screen.

> Se `pushEnabled:false` → abilita il push sul Pass Type nel portale Apple (o passiamo a
> APNs token-based con una `.p8`, che aggiungo in 1 file quando serve).

---

## 2) Homie — bridge sul Mac (ora OFFLINE)

`/api/agent/heartbeat` non riceve ping → pallino "Homie connesso" grigio.

1. **Vercel:** `HOMIE_SECRET` = un secret a tua scelta → Redeploy.
2. **Test** (da qualsiasi PC):
   ```bash
   curl -i -X POST https://boomrome.com/api/agent/heartbeat \
     -H 'Content-Type: application/json' -H 'X-Homie-Secret: IL_TUO_SECRET' -d '{"status":"live"}'
   ```
   `200` = ok · `401` = secret diverso · `500` = manca su Vercel.
3. **Mac:** `scripts/homie-bridge/` → copia `homie-bridge.env.example` in `homie-bridge.env`,
   incolla lo **stesso** `HOMIE_SECRET`, poi:
   ```bash
   chmod +x boom-homie-bridge.sh
   ./boom-homie-bridge.sh run      # oppure launchd (vedi README) per riavvio automatico
   ```
   Entro ~2 min il pallino nel **Command Center** diventa **verde**.

---

## 3) Telegram — approva le azioni dal telefono (cron già attivo)

`/api/telegram/notify-pending` gira ogni minuto. Manca solo il webhook per i bottoni.

1. **Vercel:** `TELEGRAM_BOT_TOKEN` (da @BotFather), `TELEGRAM_CHAT_ID` (il tuo user id —
   chiedi a `@userinfobot`), `TELEGRAM_WEBHOOK_SECRET` (un secret a tua scelta) → Redeploy.
2. Apri una chat col tuo bot e premi **Start**.
3. **One-click setup** (registra il webhook + ti manda un messaggio di conferma):
   ```bash
   curl -i -X POST https://boomrome.com/api/telegram/setup -H 'X-Homie-Secret: IL_TUO_SECRET'
   ```
   Atteso: `200` + arriva su Telegram "✅ BOOM × Telegram connesso".
4. Approva una pending dal Command Center → ti arriva su Telegram con ✅ / ❌.

---

## Stato (dai log di produzione, 2026-06-07)
| Motore | Stato | Manca |
|---|---|---|
| Wallet | codice ok, firma ok | abilitare push sul cert Apple + test su iPhone |
| Homie | endpoint vivo | `HOMIE_SECRET` + bridge sul Mac |
| Telegram | cron attivo (200/min) | token + `setup` (webhook) |
