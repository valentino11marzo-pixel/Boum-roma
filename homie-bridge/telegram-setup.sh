#!/usr/bin/env bash
# Homie ↔ Telegram setup — chiude il loop "tu sei in giro, Homie ti chiede,
# tu fai tap, è fatto".
#
# Cosa fa, in 4 step:
#   1) ti guida a creare il bot via @BotFather → ottieni TELEGRAM_BOT_TOKEN
#   2) ti aiuta a recuperare il tuo CHAT_ID parlando una volta col bot
#   3) genera un TELEGRAM_WEBHOOK_SECRET sicuro
#   4) ti dice esattamente cosa incollare in Vercel + chiama setWebhook
#
# Uso:
#   cd ~/homie-bridge
#   bash telegram-setup.sh
#
# Quando hai finito, ogni nuova "boom action" arriva sul tuo telefono con
# bottoni Approva/Rifiuta/Modifica. Tap → eseguita.

set -uo pipefail

BASE_URL="${BOOM_BASE_URL:-https://boomrome.com}"
bold() { printf "\033[1m%s\033[0m\n" "$*"; }
ok()   { printf "  \033[32m✓\033[0m %s\n" "$*"; }
warn() { printf "  \033[33m!\033[0m %s\n" "$*"; }

bold "BOOM Roma · Telegram approval bot — setup guidato"
echo

# Step 1 — Bot token
bold "1/4  Crea il bot via @BotFather"
cat <<'EOF'
  Su Telegram (sul telefono o desktop):
    a. apri @BotFather
    b. /newbot
    c. scegli un nome (es. "BOOM Roma Cockpit")
    d. scegli uno username che finisce in 'bot' (es. boom_roma_cockpit_bot)
    e. BotFather ti darà un TOKEN tipo "1234567:AAH...xyz"

EOF
printf "  Incolla il TELEGRAM_BOT_TOKEN: "
read -r BOT_TOKEN
if [ -z "${BOT_TOKEN}" ]; then
  warn "Vuoto — esco."; exit 1
fi
# Smoke test
ME=$(curl -s "https://api.telegram.org/bot${BOT_TOKEN}/getMe" || echo '{}')
if echo "${ME}" | grep -q '"ok":true'; then
  USERNAME=$(echo "${ME}" | grep -o '"username":"[^"]*' | sed 's/"username":"//')
  ok "Bot valido: @${USERNAME}"
else
  warn "Bot token sembra invalido — Telegram ha risposto:"
  echo "${ME}"
  printf "  Continuo comunque? [y/N] "
  read -r cnt || cnt=""
  [[ "${cnt}" == "y" || "${cnt}" == "Y" ]] || exit 1
fi

# Step 2 — Chat ID
echo
bold "2/4  Ottieni il tuo TELEGRAM_CHAT_ID"
cat <<EOF
  Su Telegram:
    a. cerca @${USERNAME:-il bot} e premi START
    b. mandagli un qualunque messaggio (es. "ciao")
  Premi INVIO qui quando hai mandato il messaggio…
EOF
read -r _
UPDATES=$(curl -s "https://api.telegram.org/bot${BOT_TOKEN}/getUpdates" || echo '{}')
CHAT_ID=$(echo "${UPDATES}" | grep -o '"chat":{"id":-\?[0-9]*' | head -1 | sed 's/.*"id"://')
if [ -n "${CHAT_ID}" ]; then
  ok "Trovato CHAT_ID: ${CHAT_ID}"
else
  warn "Non ho trovato un messaggio. Lo metti a mano?"
  printf "  Incolla manualmente il tuo CHAT_ID (intero, anche negativo per gruppi): "
  read -r CHAT_ID
fi

# Step 3 — Webhook secret
echo
bold "3/4  Genera TELEGRAM_WEBHOOK_SECRET (per blindare il webhook)"
WEBHOOK_SECRET=$(node -e "console.log(require('crypto').randomBytes(24).toString('hex'))")
ok "Generato: ${WEBHOOK_SECRET}"

# Step 4 — Print what to paste in Vercel, then setWebhook
echo
bold "4/4  Configura Vercel + attiva il webhook"
cat <<EOF

  Vai su https://vercel.com/<tuo-team>/boom-roma/settings/environment-variables
  e aggiungi (per Production + Preview):

    TELEGRAM_BOT_TOKEN       = ${BOT_TOKEN}
    TELEGRAM_CHAT_ID         = ${CHAT_ID}
    TELEGRAM_WEBHOOK_SECRET  = ${WEBHOOK_SECRET}

  Premi INVIO qui DOPO averli aggiunti e dopo aver fatto un "Redeploy" del progetto.
EOF
read -r _

# Tell Telegram to hit our webhook on every update
WEBHOOK_URL="${BASE_URL}/api/telegram/webhook"
RESP=$(curl -s -X POST "https://api.telegram.org/bot${BOT_TOKEN}/setWebhook" \
  -H "Content-Type: application/json" \
  -d "{\"url\":\"${WEBHOOK_URL}\",\"secret_token\":\"${WEBHOOK_SECRET}\",\"allowed_updates\":[\"message\",\"callback_query\"]}" || echo '{}')

if echo "${RESP}" | grep -q '"ok":true'; then
  ok "Webhook attivato → ${WEBHOOK_URL}"
else
  warn "setWebhook ha risposto:"
  echo "${RESP}"
  echo "  Riprovalo a mano:"
  echo "  curl -s -X POST 'https://api.telegram.org/bot${BOT_TOKEN}/setWebhook' -H 'Content-Type: application/json' -d '{\"url\":\"${WEBHOOK_URL}\",\"secret_token\":\"${WEBHOOK_SECRET}\"}'"
fi

# Final smoke test — send a hello via our endpoint (only works if env vars are deployed)
echo
bold "Smoke test finale"
SMOKE=$(curl -s -X POST "https://api.telegram.org/bot${BOT_TOKEN}/sendMessage" \
  -H "Content-Type: application/json" \
  -d "{\"chat_id\":${CHAT_ID},\"text\":\"<b>BOOM Roma · Cockpit attivo</b>\nQuando Homie propone una Tier-2, te la mando qui.\nProva: <code>/queue</code>\",\"parse_mode\":\"HTML\"}" || echo '{}')
if echo "${SMOKE}" | grep -q '"ok":true'; then
  ok "Mandato un messaggio test al tuo Telegram — controlla."
else
  warn "Send test ha risposto:"
  echo "${SMOKE}"
fi

echo
bold "✅  Setup completo."
cat <<EOF

  Cosa succede ora:
    • ogni minuto un cron Vercel scansiona action_queue per pending nuove
    • le manda al tuo Telegram con bottoni [✅ Approva] [❌ Rifiuta] [✏️ Modifica]
    • tap su ✅ → /api/agent/execute parte (messaggi inviati, viewing schedulato, ecc.)
    • tap su ❌ → status:rejected, niente parte
    • tap su ✏️ → ti chiede il nuovo testo della bozza, lo aggiorna, restano pending

  Comandi testo nel bot:
    /start /help — guida
    /queue       — vedi le pending in coda
    /snapshot    — stato portal
    /edit <id> <nuovo testo> — modifica una bozza pendente
    /cancel      — annulla un edit in corso

  Per disinstallare il webhook:
    curl -X POST 'https://api.telegram.org/bot${BOT_TOKEN}/deleteWebhook'

EOF
