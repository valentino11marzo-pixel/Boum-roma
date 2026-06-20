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
TELEMETRY_PLIST="$PLIST_DIR/com.boomrome.telemetry.plist"
MEMORY_PLIST="$PLIST_DIR/com.boomrome.memory.plist"
REALTIME_PLIST="$PLIST_DIR/com.boomrome.realtime.plist"
PULSE_BIN="$HOME/agent-os/bin/pulse.sh"
HEALTH_BIN="$HOME/agent-os/bin/health.sh"
TELEMETRY_BIN="$HOME/agent-os/bin/telemetry.sh"
MEMORY_BIN="$HOME/agent-os/bin/memory.sh"
REALTIME_BIN="$HOME/agent-os/bin/realtime.sh"

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

# 5) launchd · telemetry (ogni ora — costi, budget cap, digest 09:00)
bold "5/8  Registra launchd com.boomrome.telemetry (ogni ora)"
printf '<?xml version="1.0" encoding="UTF-8"?>\n<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">\n<plist version="1.0">\n<dict>\n  <key>Label</key><string>com.boomrome.telemetry</string>\n  <key>ProgramArguments</key>\n  <array>\n    <string>/bin/bash</string>\n    <string>%s</string>\n  </array>\n  <key>StartInterval</key><integer>3600</integer>\n  <key>RunAtLoad</key><true/>\n  <key>StandardOutPath</key><string>%s/state/launchd.telemetry.log</string>\n  <key>StandardErrorPath</key><string>%s/state/launchd.telemetry.err</string>\n  <key>EnvironmentVariables</key>\n  <dict>\n    <key>PATH</key><string>/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin</string>\n  </dict>\n</dict>\n</plist>\n' "$TELEMETRY_BIN" "$HERE" "$HERE" > "$TELEMETRY_PLIST"
launchctl unload "$TELEMETRY_PLIST" 2>/dev/null || true
launchctl load "$TELEMETRY_PLIST"
if launchctl list | grep -q com.boomrome.telemetry; then
    ok "telemetry registrato (digest giornaliero + budget cap)"
else
    warn "telemetry NON trovato in list"
fi

# 6) launchd · memory (ogni ora — refresh profili per-contatto)
bold "6/8  Registra launchd com.boomrome.memory (ogni ora)"
printf '<?xml version="1.0" encoding="UTF-8"?>\n<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">\n<plist version="1.0">\n<dict>\n  <key>Label</key><string>com.boomrome.memory</string>\n  <key>ProgramArguments</key>\n  <array>\n    <string>/bin/bash</string>\n    <string>%s</string>\n  </array>\n  <key>StartInterval</key><integer>3600</integer>\n  <key>RunAtLoad</key><true/>\n  <key>StandardOutPath</key><string>%s/state/launchd.memory.log</string>\n  <key>StandardErrorPath</key><string>%s/state/launchd.memory.err</string>\n  <key>EnvironmentVariables</key>\n  <dict>\n    <key>PATH</key><string>/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin</string>\n  </dict>\n</dict>\n</plist>\n' "$MEMORY_BIN" "$HERE" "$HERE" > "$MEMORY_PLIST"
launchctl unload "$MEMORY_PLIST" 2>/dev/null || true
launchctl load "$MEMORY_PLIST"
if launchctl list | grep -q com.boomrome.memory; then
    ok "memory registrato (profili per contatto WhatsApp)"
else
    warn "memory NON trovato in list"
fi

# 7) launchd · realtime (event-driven daemon, always-on, KeepAlive)
#    Sostituisce il polling con il push: appena qualcosa arriva in
#    agentNotifications su Firestore, Homie reagisce in ~15 secondi.
bold "7/9  Registra launchd com.boomrome.realtime (daemon always-on)"
printf '<?xml version="1.0" encoding="UTF-8"?>\n<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">\n<plist version="1.0">\n<dict>\n  <key>Label</key><string>com.boomrome.realtime</string>\n  <key>ProgramArguments</key>\n  <array>\n    <string>/bin/bash</string>\n    <string>%s</string>\n  </array>\n  <key>KeepAlive</key><true/>\n  <key>RunAtLoad</key><true/>\n  <key>ThrottleInterval</key><integer>10</integer>\n  <key>StandardOutPath</key><string>%s/state/launchd.realtime.log</string>\n  <key>StandardErrorPath</key><string>%s/state/launchd.realtime.err</string>\n  <key>EnvironmentVariables</key>\n  <dict>\n    <key>PATH</key><string>/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin</string>\n  </dict>\n</dict>\n</plist>\n' "$REALTIME_BIN" "$HERE" "$HERE" > "$REALTIME_PLIST"
launchctl unload "$REALTIME_PLIST" 2>/dev/null || true
launchctl load "$REALTIME_PLIST"
if launchctl list | grep -q com.boomrome.realtime; then
    ok "realtime registrato (daemon always-on, poll ogni 15s)"
else
    warn "realtime NON trovato in list"
fi

# 8) Smoke-test tutta la fleet
bold "8/9  Smoke-test pulse + health + telemetry + memory"
mkdir -p "$HERE/state"
for bin in "$PULSE_BIN" "$HEALTH_BIN" "$TELEMETRY_BIN" "$MEMORY_BIN"; do
    name="$(basename "$bin" .sh)"
    if bash "$bin" >/dev/null 2>&1; then
        ok "$name exit 0"
    else
        warn "$name exit ≠ 0 — guarda $HERE/state/$name.log"
    fi
done

# 9) Disabilita la vecchia boom-sweep di OpenClaw (era a vision, cara)
bold "9/9  Disabilita boom-sweep OpenClaw (sostituita da pulse)"
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
bold "✅  BOOM Agent OS installato — 5 pilastri attivi."
cat <<EOF

  Pulse     (15 min)  L1 Sense       — gate WhatsApp+portal, sveglia
                                      Homie solo sui delta veri
  Health    (2 min)   L5 Affidabilità — dead-man switch, auto-restart
                                      della flotta com.boomrome.*
  Telemetry (1 ora)   L5 Costi       — digest 09:00 + budget cap
                                      (default €5/giorno, override
                                      con BUDGET_DAILY_EUR)
  Memory    (1 ora)   L6 Memoria     — profili per contatto WhatsApp
                                      iniettati nel risveglio di Homie
  Realtime  (always)  L1 Push        — event-driven: poll /api/agent/queue
                                      ogni 15s, Homie reagisce ai lead
                                      del sito / firme / pagamenti in
                                      secondi invece di minuti

  Verifica:
    tail -f $HERE/state/pulse.log
    tail -f $HERE/state/realtime.log
    cat   $HERE/state/metrics.json
    launchctl list | grep boomrome

  Test realtime end-to-end (manda un fake lead, deve arrivare a Homie
  entro ~15s):
    curl -X POST \$API_BASE/notify \\
      -H "Content-Type: application/json" \\
      -H "X-Homie-Secret: \$HOMIE_SECRET" \\
      -d '{"type":"lead.new","priority":"high","summary":"Test realtime",
           "payload":{"name":"Test","property":"Via Test 1"}}'

  Consultare la memoria di un contatto:
    $HOME/agent-os/bin/memory.sh show "<chatId>"
    $HOME/agent-os/bin/memory.sh inject "<chatId>"   # come la vede Homie

  Per disinstallare:
    for P in $PLIST $HEALTH_PLIST $TELEMETRY_PLIST $MEMORY_PLIST $REALTIME_PLIST; do
      launchctl unload "\$P" && rm "\$P"
    done && rm $LINK

EOF
