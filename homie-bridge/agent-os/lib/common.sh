# Shared helpers used by all agent-os scripts. Sourced, not executed.
# Conventions:
#   AOS_HOME   → ~/agent-os    (symlinked to the repo by install.sh)
#   AOS_STATE  → AOS_HOME/state (runtime state, not in git)
#   AOS_LOG    → AOS_HOME/state/<script>.log
# Every executable script does:
#   . "$(dirname "$0")/../lib/common.sh"

AOS_HOME="${AOS_HOME:-$HOME/agent-os}"
AOS_STATE="${AOS_STATE:-$AOS_HOME/state}"
mkdir -p "$AOS_STATE" 2>/dev/null

# Load HOMIE_SECRET / BOOM_BASE_URL once. Idempotent.
if [ -z "${HOMIE_SECRET:-}" ] && [ -f "$HOME/.boom/env" ]; then
    # shellcheck disable=SC1091
    . "$HOME/.boom/env"
fi

# Telegram chat we ping for alerts. Comes from the existing OpenClaw job
# pattern (see jobs.json contract-monitor-001). Override with TG_CHAT_ID
# in the environment if needed.
TG_CHAT_ID="${TG_CHAT_ID:-553858752}"

# Sessione in cui vivono le sveglie AUTOMATICHE. Deve essere DIVERSA dalla
# conversazione Telegram dell'operatore: vedi aos_wake_homie.
AOS_WAKE_SESSION="${AOS_WAKE_SESSION:-agent-os-auto}"

# ─── logging ──────────────────────────────────────────────────────────
aos_log() {
    local name="${AOS_NAME:-aos}"
    local ts
    ts="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
    printf '%s [%s] %s\n' "$ts" "$name" "$*" >> "$AOS_STATE/${name}.log"
    # Also stdout so launchd captures it in its own log.
    printf '%s [%s] %s\n' "$ts" "$name" "$*"
}

# ─── state helpers (single-line text values, atomic via mv) ───────────
aos_state_get() {
    local key="$1"
    cat "$AOS_STATE/$key" 2>/dev/null
}
aos_state_set() {
    local key="$1" value="$2"
    local tmp
    tmp="$(mktemp "$AOS_STATE/.$key.XXXX")" || return 1
    printf '%s' "$value" > "$tmp"
    mv "$tmp" "$AOS_STATE/$key"
}

# ─── single-instance lock (prevent overlapping pulse runs) ────────────
# Uses `mkdir` which is atomic on POSIX. Locks expire after STALE_SECS
# (default 30 min) so a crashed run doesn't block forever.
aos_lock() {
    local name="${1:-$AOS_NAME}"
    local lock="$AOS_STATE/.${name}.lock"
    local stale_secs="${2:-1800}"
    if mkdir "$lock" 2>/dev/null; then
        # shellcheck disable=SC2064
        trap "rmdir '$lock' 2>/dev/null" EXIT
        return 0
    fi
    # Lock exists — check age.
    local age now
    now="$(date +%s)"
    age=$(( now - $(stat -f %m "$lock" 2>/dev/null || echo "$now") ))
    if [ "$age" -gt "$stale_secs" ]; then
        aos_log "stale lock ($age s old), forcing"
        rmdir "$lock" 2>/dev/null
        return $(aos_lock "$name" "$stale_secs")
    fi
    aos_log "another run is active ($age s), skipping"
    return 1
}

# ─── send a Telegram alert via the running OpenClaw gateway ───────────
# Uses the cron-style isolated agent turn so it goes through the same
# proven delivery path as boom-digest. Fire-and-forget; never blocks.
#
# THE HOLE (2026-09-05): this path goes THROUGH the gateway. When the
# gateway itself is down — the one failure health.sh most needs to
# report — the alert is silently lost. So when the gateway port is not
# answering (or the CLI is missing) we fall back to the Telegram Bot API
# directly with curl, if TG_BOT_TOKEN is available (put it in
# ~/.boom/env next to HOMIE_SECRET). No token → log only, and say so.
aos_gateway_up() {
    nc -z 127.0.0.1 "${OPENCLAW_GATEWAY_PORT:-18789}" >/dev/null 2>&1
}
aos_alert() {
    local message="$1"
    local urgency="${2:-info}"   # info | warn | crit
    local icon
    case "$urgency" in
        crit) icon='🚨' ;;
        warn) icon='⚠️' ;;
        *)    icon='ℹ️' ;;
    esac
    aos_log "ALERT[$urgency] $message"
    local text
    text="$(printf '[agent-os] %s %s' "$icon" "$message" | head -c 3500)"
    # `openclaw agent --deliver` faceva girare un TURNO DI MODELLO solo per
    # recapitare un testo già scritto — e lo scriveva dentro la sessione
    # dell'operatore. `message send` consegna e basta: zero token, zero
    # storico aggiunto alla chat.
    if command -v openclaw >/dev/null 2>&1 && aos_gateway_up; then
        openclaw message send --channel telegram --target "$TG_CHAT_ID" \
            --message "$text" >/dev/null 2>&1 &
    elif [ -n "${TG_BOT_TOKEN:-}" ]; then
        curl -s -m 15 -X POST "https://api.telegram.org/bot${TG_BOT_TOKEN}/sendMessage" \
            --data-urlencode "chat_id=${TG_CHAT_ID}" \
            --data-urlencode "text=$text" >/dev/null 2>&1 &
        aos_log "alert delivered via Bot API (gateway down)"
    else
        aos_log "alert NOT delivered: gateway down and TG_BOT_TOKEN unset"
    fi
}

# ─── wake Homie with a precise delta (token-efficient agent turn) ─────
# Usage: aos_wake_homie "Sofia Poulet ha scritto un messaggio nuovo: ..."
#
# LA SESSIONE È IL PUNTO (7 settembre 2026). Questa funzione passava
# `--channel telegram --to "$TG_CHAT_ID"`, e nel CLI `--to` è "the recipient
# number USED TO DERIVE THE SESSION KEY": ogni sveglia automatica finiva
# quindi DENTRO la conversazione Telegram dell'operatore. Dopo mesi la
# sessione `agent:main:main` portava ~8.000 messaggi di valutazioni lead
# generate dai cron, e il modello continuava quello schema qualunque cosa
# gli si scrivesse: alla domanda "rispondi solo ok" ha risposto graduando
# un lead di Via Satrico. Da fuori si vedeva "non risponde alle mie
# domande, analizza solo le email" — e ogni turno ripagava quello storico.
# Ora l'automazione ha la SUA sessione (AOS_WAKE_SESSION) e la chat
# dell'operatore resta la chat dell'operatore. Nessun --deliver: la sveglia
# fa agire, non parlare (il canale resta libero per le decisioni vere).
aos_wake_homie() {
    local context="$1"
    local thinking="${2:-minimal}"
    local timeout="${3:-180}"
    if [ -z "$context" ]; then
        aos_log "wake_homie: empty context, skipping"
        return 1
    fi
    aos_log "waking Homie (session=$AOS_WAKE_SESSION, thinking=$thinking, timeout=${timeout}s) :: ${context:0:120}"
    openclaw agent --agent main \
        --session-id "$AOS_WAKE_SESSION" \
        --thinking "$thinking" --timeout "$timeout" \
        --message "$context" >/dev/null 2>&1
}

# Hash a file/stdin to a short fingerprint (for diff detection).
aos_hash() {
    if [ $# -gt 0 ]; then
        shasum -a 256 "$1" 2>/dev/null | cut -c1-16
    else
        shasum -a 256 2>/dev/null | cut -c1-16
    fi
}
