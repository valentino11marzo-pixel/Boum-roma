#!/usr/bin/env bash
# BOOM Agent OS · installer turnkey per il Mac Mini (boomserver).
#
# Idempotente: rilancia quante volte vuoi, non duplica nulla.
# Cosa fa:
#   1) symlink: ~/agent-os → ~/Boum-roma/homie-bridge/agent-os
#   2) chmod +x sui bin/
#   3) registra launchd per pulse.sh ogni 15 min
#   4) registra launchd per health.sh ogni 2 min (dead-man switch)
#   5) smoke-test (pulse + health a vuoto)
#   6) DISABILITA la vecchia boom-sweep di OpenClaw (usavamo vision = caro).
#      Pulse la sostituisce con la lettura WhatsApp testuale.
#
# Run:
#   bash ~/Boum-roma/homie-bridge/agent-os/install.sh
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$HERE/../.." && pwd)"
LINK="$HOME/agent-os"
PLIST_DIR="$HOME/Library/LaunchAgents"
PLIST="$PLIST_DIR/com.boomrome.pulse.plist"
HEALTH_PLIST="$PLIST_DIR/com.boomrome.health.plist"
PULSE_BIN="$HOME/agent-os/bin/pulse.sh"
HEALTH_BIN="$HOME/agent-os/bin/health.sh"

ok()   { printf '  \033[32m✓\033[0m %s\n' "$*"; }
warn() { printf '  \033[33m!\033[0m %s\n' "$*"; }
bold() { printf '\033[1m%s\033[0m\n' "$*"; }

bold "BOOM Agent OS · installer"
echo

# 1) Symlink
bold "1/5  Symlink ~/agent-os → repo"
if [ -L "$LINK" ] && [ "$(readlink "$LINK")" = "$HERE" ]; then
    ok "già OK ($LINK → $HERE)"
elif [ -e "$LINK" ]; then
    warn "$LINK esiste e non è il symlink atteso. Rinominalo a mano se vuoi sostituirlo."
else
    ln -s "$HERE" "$LINK"
    ok "creato $LINK"
fi

# 2) chmod
bold "2/5  Permessi eseguibili"
chmod +x "$HERE"/bin/*.sh 2>/dev/null || true
ok "bin/*.sh eseguibili"

# 3) launchd · pulse
bold "3/6  Registra launchd com.boomrome.pulse (ogni 15 min)"
mkdir -p "$PLIST_DIR"
printf '<?xml version="1.0" encoding="UTF-8"?>\n<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">\n<plist version="1.0">\n<dict>\n  <key>Label</key><string>com.boomrome.pulse</string>\n  <key>ProgramArguments</key>\n  <array>\n    <string>/bin/bash</string>\n    <string>%s</string>\n  </array>\n  <key>StartInterval</key><integer>900</integer>\n  <key>RunAtLoad</key><true/>\n  <key>StandardOutPath</key><string>%s/state/launchd.pulse.log</string>\n  <key>StandardErrorPath</key><string>%s/state/launchd.pulse.err</string>\n  <key>EnvironmentVariables</key>\n  <dict>\n    <key>PATH</key><string>/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin</string>\n  </dict>\n</dict>\n</plist>\n' "$PULSE_BIN" "$HERE" "$HERE" > "$PLIST"
launchctl unload "$PLIST" 2>/dev/null || true
launchctl load "$PLIST"
if launchctl list | grep -q com.boomrome.pulse; then
    ok "pulse registrato (parte ora + ogni 15 min)"
else
    warn "pulse NON trovato in list — controlla $PLIST"
fi

# 4) launchd · health (dead-man switch). Ogni 2 min. KeepAlive così il
#    watchdog stesso si rialza se crasha (è l'ultima linea di difesa).
bold "4/6  Registra launchd com.boomrome.health (ogni 2 min, dead-man switch)"
printf '<?xml version="1.0" encoding="UTF-8"?>\n<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">\n<plist version="1.0">\n<dict>\n  <key>Label</key><string>com.boomrome.health</string>\n  <key>ProgramArguments</key>\n  <array>\n    <string>/bin/bash</string>\n    <string>%s</string>\n  </array>\n  <key>StartInterval</key><integer>120</integer>\n  <key>RunAtLoad</key><true/>\n  <key>StandardOutPath</key><string>%s/state/launchd.health.log</string>\n  <key>StandardErrorPath</key><string>%s/state/launchd.health.err</string>\n  <key>EnvironmentVariables</key>\n  <dict>\n    <key>PATH</key><string>/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin</string>\n  </dict>\n</dict>\n</plist>\n' "$HEALTH_BIN" "$HERE" "$HERE" > "$HEALTH_PLIST"
launchctl unload "$HEALTH_PLIST" 2>/dev/null || true
launchctl load "$HEALTH_PLIST"
if launchctl list | grep -q com.boomrome.health; then
    ok "health registrato (sorveglia la flotta ogni 2 min)"
else
    warn "health NON trovato in list — controlla $HEALTH_PLIST"
fi

# 5) Smoke-test
bold "5/6  Smoke-test pulse.sh + health.sh"
mkdir -p "$HERE/state"
if bash "$PULSE_BIN" >/dev/null 2>&1; then
    ok "pulse exit 0"
else
    warn "pulse exit ≠ 0 — guarda $HERE/state/pulse.log"
fi
if bash "$HEALTH_BIN" >/dev/null 2>&1; then
    ok "health exit 0"
    tail -2 "$HERE/state/health.log" 2>/dev/null | sed 's/^/    /'
else
    warn "health exit ≠ 0 — guarda $HERE/state/health.log"
fi

# 6) Disabilita la vecchia boom-sweep di OpenClaw (era a vision, cara)
bold "6/6  Disabilita boom-sweep OpenClaw (sostituita da pulse)"
if command -v openclaw >/dev/null 2>&1; then
    SWEEP_ID="$(python3 -c "
import json
try:
    j = json.load(open('$HOME/.openclaw/cron/jobs.json'))
    for x in j.get('jobs', []):
        if x.get('name') == 'boom-sweep' and x.get('sessionTarget') == 'isolated':
            print(x['id']); break
except: pass
" 2>/dev/null)"
    if [ -n "$SWEEP_ID" ]; then
        openclaw cron disable "$SWEEP_ID" >/dev/null 2>&1 && \
            ok "boom-sweep ($SWEEP_ID) disabilitata" || \
            warn "non sono riuscito a disabilitare boom-sweep — fallo a mano: openclaw cron disable $SWEEP_ID"
    else
        ok "nessuna boom-sweep da disabilitare (probabilmente già fatto)"
    fi
else
    warn "openclaw non in PATH — disabilita boom-sweep a mano se serve"
fi

echo
bold "✅  Pulse + Health installati."
cat <<EOF

  Pulse (ogni 15 min): legge gratis WhatsApp (wacli testo) e il portal
  (boom risk + snapshot fingerprint), sveglia Homie SOLO sui cambiamenti
  veri.

  Health (ogni 2 min): dead-man switch. Sorveglia tutta la flotta
  com.boomrome.*, ti scrive su Telegram se qualcosa muore (es. exit 127)
  e tenta il restart automatico. Avvisa solo sui cambi di stato, niente
  spam.

  Verifica:
    tail -f $HERE/state/pulse.log
    tail -f $HERE/state/health.log
    launchctl list | grep boomrome

  Per disinstallare:
    launchctl unload $PLIST $HEALTH_PLIST && rm $PLIST $HEALTH_PLIST
    rm $LINK
    (boom-sweep la riattivi con: openclaw cron enable <id>)

EOF
