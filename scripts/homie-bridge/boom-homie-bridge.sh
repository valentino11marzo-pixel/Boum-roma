#!/usr/bin/env bash
# BOOM × Homie — Mac bridge
# ---------------------------------------------------------------------------
# Keeps the portal's "Homie connesso" indicator green by posting a heartbeat
# to /api/agent/heartbeat every HB_INTERVAL seconds, and is a thin client for
# forwarding events (e.g. leads) into the agent API.
#
# IMPORTANT: the Homie "brain" runs on THIS Mac. This script is the pipe that
# keeps the connection to the portal live and constant — it does not think on
# its own. Wire your real runtime to call `heartbeat`/`lead` here (or POST the
# same endpoints directly).
#
# Usage:
#   ./boom-homie-bridge.sh ping            # one-shot heartbeat — test the link
#   ./boom-homie-bridge.sh run             # loop forever (what launchd runs)
#   ./boom-homie-bridge.sh lead '{...}'    # POST a lead to /api/agent/leads.create
#
# Config (homie-bridge.env, copied from homie-bridge.env.example — NOT committed):
#   HOMIE_SECRET   shared secret, same as Vercel env (REQUIRED)
#   BOOM_BASE_URL  default https://boomrome.com
#   HB_INTERVAL    seconds between heartbeats (default 30)
#   HB_MODEL       label shown in the portal (default "claude")
#   HB_VERSION     client version label (default "mac-bridge/1.0")
# ---------------------------------------------------------------------------
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
if [ -f "$HERE/homie-bridge.env" ]; then set -a; . "$HERE/homie-bridge.env"; set +a; fi

BASE_URL="${BOOM_BASE_URL:-https://boomrome.com}"
SECRET="${HOMIE_SECRET:-}"
INTERVAL="${HB_INTERVAL:-30}"
MODEL="${HB_MODEL:-claude}"
VERSION="${HB_VERSION:-mac-bridge/1.0}"

if [ -z "$SECRET" ]; then
  echo "[bridge] HOMIE_SECRET non impostato." >&2
  echo "         Copia homie-bridge.env.example -> homie-bridge.env e inserisci il secret" >&2
  echo "         (lo stesso valore di HOMIE_SECRET su Vercel)." >&2
  exit 1
fi

# _post <endpoint> <json-body> — returns curl exit status, prints response body.
_post() {
  curl -fsS -X POST "$BASE_URL/api/agent/$1" \
    -H "Content-Type: application/json" \
    -H "X-Homie-Secret: $SECRET" \
    -d "$2"
}

# heartbeat <activeTool|""> <queueLen>
heartbeat() {
  local active="${1:-}" queue="${2:-0}" tool_json
  if [ -n "$active" ]; then tool_json="\"$active\""; else tool_json="null"; fi
  _post heartbeat \
    "{\"status\":\"live\",\"activeTool\":$tool_json,\"queueLen\":$queue,\"model\":\"$MODEL\",\"version\":\"$VERSION\",\"lastEvent\":\"bridge\"}" \
    >/dev/null
}

case "${1:-run}" in
  ping)
    echo "[bridge] ping -> $BASE_URL/api/agent/heartbeat"
    if heartbeat "ping" 0; then
      echo "[bridge] OK — heartbeat accettato. Il pallino nel Command Center diventa verde entro 2 min."
    else
      echo "[bridge] FAIL — heartbeat rifiutato." >&2
      echo "         Controlla: HOMIE_SECRET corretto, endpoint deployato ($BASE_URL/api/agent/heartbeat), rete." >&2
      exit 1
    fi
    ;;
  run)
    echo "[bridge] loop attivo: heartbeat ogni ${INTERVAL}s -> $BASE_URL (model=$MODEL version=$VERSION)"
    while true; do
      if heartbeat "" 0; then :; else
        echo "[bridge] $(date '+%Y-%m-%d %H:%M:%S') heartbeat fallito — ritento tra ${INTERVAL}s" >&2
      fi
      sleep "$INTERVAL"
    done
    ;;
  lead)
    [ -n "${2:-}" ] || { echo "uso: $0 lead '{\"source\":\"whatsapp\",\"name\":\"Mario\",\"phone\":\"+39...\"}'" >&2; exit 1; }
    _post leads.create "$2"; echo
    ;;
  *)
    echo "uso: $0 {ping|run|lead <json>}" >&2
    exit 1
    ;;
esac
