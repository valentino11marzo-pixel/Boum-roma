#!/usr/bin/env bash
# BOOM Agent OS · installer turnkey per il Mac Mini (boomserver).
#
# Idempotente: rilancia quante volte vuoi, non duplica nulla.
# Cosa fa:
#   1) symlink: ~/agent-os → ~/Boum-roma/homie-bridge/agent-os
#   2) chmod +x sui bin/
#   3) registra launchd per pulse.sh ogni 15 min
#   4) smoke-test (pulse a vuoto, deve uscire "no changes" o wake riuscito)
#   5) DISABILITA la vecchia boom-sweep di OpenClaw (usavamo vision = caro).
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
PULSE_BIN="$HOME/agent-os/bin/pulse.sh"

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

# 3) launchd
bold "3/5  Registra launchd com.boomrome.pulse (ogni 15 min)"
mkdir -p "$PLIST_DIR"
printf '<?xml version="1.0" encoding="UTF-8"?>\n<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">\n<plist version="1.0">\n<dict>\n  <key>Label</key><string>com.boomrome.pulse</string>\n  <key>ProgramArguments</key>\n  <array>\n    <string>/bin/bash</string>\n    <string>%s</string>\n  </array>\n  <key>StartInterval</key><integer>900</integer>\n  <key>RunAtLoad</key><true/>\n  <key>StandardOutPath</key><string>%s/state/launchd.pulse.log</string>\n  <key>StandardErrorPath</key><string>%s/state/launchd.pulse.err</string>\n  <key>EnvironmentVariables</key>\n  <dict>\n    <key>PATH</key><string>/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin</string>\n  </dict>\n</dict>\n</plist>\n' "$PULSE_BIN" "$HERE" "$HERE" > "$PLIST"
launchctl unload "$PLIST" 2>/dev/null || true
launchctl load "$PLIST"
if launchctl list | grep -q com.boomrome.pulse; then
    ok "launchd registrato (parte ora + ogni 15 min)"
else
    warn "launchd NON trovato in list — controlla $PLIST"
fi

# 4) Smoke-test
bold "4/5  Smoke-test pulse.sh"
mkdir -p "$HERE/state"
if bash "$PULSE_BIN" >/dev/null 2>&1; then
    ok "pulse exit 0"
    tail -3 "$HERE/state/pulse.log" 2>/dev/null | sed 's/^/    /'
else
    warn "pulse exit ≠ 0 — guarda $HERE/state/pulse.log"
fi

# 5) Disabilita la vecchia boom-sweep di OpenClaw (era a vision, cara)
bold "5/5  Disabilita boom-sweep OpenClaw (sostituita da pulse)"
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
bold "✅  Pulse installato."
cat <<EOF

  Da ora ogni 15 min pulse interroga gratis WhatsApp (wacli testo) e il
  portal (boom risk + snapshot fingerprint), sveglia Homie SOLO se c'è
  un cambiamento vero.

  Verifica:
    tail -f $HERE/state/pulse.log
    launchctl list | grep boomrome
    openclaw cron list           # boom-digest + boom-risk restano attive,
                                 # boom-sweep è ora disabilitata

  Per disinstallare:
    launchctl unload $PLIST && rm $PLIST
    rm $LINK
    (boom-sweep la riattivi con: openclaw cron enable <id>)

EOF
