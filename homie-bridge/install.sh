#!/usr/bin/env bash
# Homie ↔ BOOM Roma — installer turnkey per il Mac di Valentino.
#
# Esegue tutto in <30 secondi:
#   1) verifica Node 18+
#   2) chiede HOMIE_SECRET (lo stesso valore di Vercel) — lo salva in ~/.boom/env
#   3) chmod +x boom
#   4) smoke-test: heartbeat + snapshot
#   5) (opzionale) installa keep-alive via launchd
#
# Uso:
#   cd ~/homie-bridge
#   bash install.sh
#
# Niente sudo, niente file globali — tutto sotto $HOME/.boom/.

set -euo pipefail

# Posizioni
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENV_DIR="${HOME}/.boom"
ENV_FILE="${ENV_DIR}/env"
LAUNCH_PLIST="${HOME}/Library/LaunchAgents/com.boomrome.homie.plist"

bold() { printf "\033[1m%s\033[0m\n" "$*"; }
ok()   { printf "  \033[32m✓\033[0m %s\n" "$*"; }
warn() { printf "  \033[33m!\033[0m %s\n" "$*"; }
fail() { printf "  \033[31m✗\033[0m %s\n" "$*"; exit 1; }

bold "BOOM Roma · Homie installer"
echo

# 1) Node version
bold "1/5  Verifica Node 18+"
if ! command -v node >/dev/null 2>&1; then
  fail "Node non installato. https://nodejs.org → installa la LTS, poi rilancia."
fi
NODE_MAJOR=$(node -p 'process.versions.node.split(".")[0]')
if [ "${NODE_MAJOR}" -lt 18 ]; then
  fail "Node ${NODE_MAJOR}.x trovato — serve Node 18+ (per global fetch). Aggiorna da https://nodejs.org"
fi
ok "Node $(node -v)"

# 2) HOMIE_SECRET
bold "2/5  Imposta HOMIE_SECRET"
mkdir -p "${ENV_DIR}"
chmod 700 "${ENV_DIR}"
EXISTING=""
if [ -f "${ENV_FILE}" ]; then
  # shellcheck disable=SC1090
  source "${ENV_FILE}" 2>/dev/null || true
  EXISTING="${HOMIE_SECRET:-}"
fi
if [ -n "${EXISTING}" ]; then
  printf "  Trovato un HOMIE_SECRET esistente (****%s). Cambiarlo? [y/N] " "${EXISTING: -4}"
  read -r answer || answer=""
  if [[ "${answer}" != "y" && "${answer}" != "Y" ]]; then
    SECRET="${EXISTING}"
  fi
fi
if [ -z "${SECRET:-}" ]; then
  printf "  Incolla il valore HOMIE_SECRET di Vercel: "
  read -rs SECRET
  echo
  if [ -z "${SECRET}" ]; then
    fail "Vuoto. Vai su Vercel → Settings → Environment Variables, copia HOMIE_SECRET, rilancia."
  fi
fi
# Persisti
cat > "${ENV_FILE}" <<EOF
# BOOM Roma · Homie bridge env (do not commit)
export HOMIE_SECRET="${SECRET}"
export BOOM_BASE_URL="\${BOOM_BASE_URL:-https://boomrome.com}"
EOF
chmod 600 "${ENV_FILE}"
ok "Salvato in ${ENV_FILE} (chmod 600)"

# Aggiungi source nello shell rc se non già presente
SHELL_RC=""
case "${SHELL:-}" in
  */zsh)  SHELL_RC="${HOME}/.zshrc" ;;
  */bash) SHELL_RC="${HOME}/.bash_profile" ;;
  *)      SHELL_RC="${HOME}/.profile" ;;
esac
SOURCE_LINE="[ -f ${ENV_FILE} ] && source ${ENV_FILE}  # BOOM Homie"
if ! grep -qF "${ENV_FILE}" "${SHELL_RC}" 2>/dev/null; then
  echo "${SOURCE_LINE}" >> "${SHELL_RC}"
  ok "Aggiunto autoload a ${SHELL_RC}"
else
  ok "Autoload già in ${SHELL_RC}"
fi

# Esporta nella shell corrente
export HOMIE_SECRET="${SECRET}"
export BOOM_BASE_URL="${BOOM_BASE_URL:-https://boomrome.com}"

# 3) chmod +x boom
bold "3/5  Permessi binario boom"
chmod +x "${SCRIPT_DIR}/boom"
ok "${SCRIPT_DIR}/boom eseguibile"

# 4) Smoke test
bold "4/5  Smoke test connessione → ${BOOM_BASE_URL}"
echo "  heartbeat:"
if "${SCRIPT_DIR}/boom" heartbeat --status live --tool watching-whatsapp >/dev/null 2>&1; then
  ok "heartbeat OK (cockpit pallino verde tra qualche secondo)"
else
  fail "heartbeat FALLITO. Verifica: il secret è uguale a quello di Vercel? Vercel ha la env var HOMIE_SECRET impostata? La rete è OK?"
fi
echo "  snapshot:"
if "${SCRIPT_DIR}/boom" snapshot >/dev/null 2>&1; then
  ok "snapshot OK (portal raggiungibile, dati leggibili)"
else
  warn "snapshot ha avuto un problema (potresti vedere comunque attività). Non-fatal."
fi

# 5) keep-alive launchd (opzionale)
bold "5/5  Keep-alive launchd (opzionale)"
printf "  Vuoi installare il keep-alive auto-start (heartbeat ogni 30s, riavvio dopo logout)? [Y/n] "
read -r ka || ka="y"
if [[ "${ka}" == "" || "${ka}" == "y" || "${ka}" == "Y" ]]; then
  mkdir -p "$(dirname "${LAUNCH_PLIST}")"
  cat > "${LAUNCH_PLIST}" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>com.boomrome.homie</string>
  <key>ProgramArguments</key>
  <array>
    <string>/bin/bash</string>
    <string>-c</string>
    <string>source ${ENV_FILE} &amp;&amp; ${SCRIPT_DIR}/boom heartbeat --status live --tool watching-whatsapp</string>
  </array>
  <key>StartInterval</key><integer>30</integer>
  <key>RunAtLoad</key><true/>
  <key>StandardOutPath</key><string>${ENV_DIR}/heartbeat.log</string>
  <key>StandardErrorPath</key><string>${ENV_DIR}/heartbeat.err</string>
</dict>
</plist>
EOF
  # (Re)load
  launchctl unload "${LAUNCH_PLIST}" 2>/dev/null || true
  launchctl load   "${LAUNCH_PLIST}"
  ok "Installato + caricato (${LAUNCH_PLIST})"
  ok "Log heartbeat: ${ENV_DIR}/heartbeat.log"
else
  warn "Saltato. Per attivare dopo: bash install.sh"
fi

echo
bold "✅  Tutto pronto."
cat <<EOF

  Cosa puoi fare ORA dal Mac:

    boom snapshot                              # vedi lo stato del portal
    boom heartbeat --status live               # forza un ping (il launchd lo fa solo)
    boom lead-create --name "Anna" --phone "+39..." --message "..." --grade B --dedup
    boom message --direction in --phone "+39..." --body "Ciao, è libero il bilocale?" --needs-reply true
    boom action --kind reply --lead <leadId> --summary "..." --draft "..."

  La policy operativa di Homie è in HOMIE.md (caricala come system prompt).
  Per disinstallare il keep-alive:  launchctl unload ${LAUNCH_PLIST} && rm ${LAUNCH_PLIST}

EOF
