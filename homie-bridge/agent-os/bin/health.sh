#!/usr/bin/env bash
# health.sh — DEAD-MAN SWITCH. Runs every 2 min via launchd.
# Watches the whole agent-os fleet and alerts you on Telegram the moment
# something stops breathing — then tries to revive it automatically.
#
# This is L5 "Osservabilità / Affidabilità". It is the answer to the
# silent failure we caught on day one: com.boomrome.homie sitting at
# exit 127 with nobody watching.
#
# Checks, in order:
#   1. launchd fleet — any com.boomrome.* job whose LAST EXIT != 0
#        (127 = binary/PATH missing, others = crash)
#   2. pulse freshness — last_pulse_ts must be < PULSE_MAX_AGE old,
#        otherwise the guardian itself has stalled
#   3. wacli daemon — must have a live PID (it's the WhatsApp bridge)
#   4. openclaw gateway — must respond (the wake path depends on it)
#
# Discipline:
#   - Alerts only on STATE TRANSITION (healthy→sick / sick→healthy),
#     never on every tick. Re-nags every RENAG_SECS if still sick.
#   - Attempts ONE auto-revive per sick job per tick
#     (launchctl kickstart -k), logs the outcome.
set -uo pipefail

AOS_NAME="health"
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
. "$HERE/../lib/common.sh"

PULSE_MAX_AGE="${PULSE_MAX_AGE:-1500}"   # 25 min — pulse runs every 15
RENAG_SECS="${RENAG_SECS:-1800}"         # re-alert every 30 min if still sick
UID_NUM="$(id -u)"

problems=()        # human-readable list of what's wrong this tick
revived=()         # jobs we kicked this tick

# ─── 1 · launchd fleet exit codes ────────────────────────────────────
# `launchctl list` columns: PID  LAST_EXIT  LABEL
# PID "-" just means "not running right now" (normal for interval jobs).
# We care about LAST_EXIT != 0.
while IFS= read -r line; do
    [ -z "$line" ] && continue
    pid="$(printf '%s' "$line" | awk '{print $1}')"
    code="$(printf '%s' "$line" | awk '{print $2}')"
    label="$(printf '%s' "$line" | awk '{print $3}')"
    case "$label" in
        com.boomrome.*) ;;
        *) continue ;;
    esac
    # health itself is allowed to be mid-run; skip self.
    [ "$label" = "com.boomrome.health" ] && continue
    if [ "$code" != "0" ] && [ "$code" != "-" ]; then
        why="exit $code"
        [ "$code" = "127" ] && why="exit 127 (binary/PATH non trovato)"
        problems+=("$label: $why")
        # Auto-revive attempt.
        if launchctl kickstart -k "gui/$UID_NUM/$label" >/dev/null 2>&1; then
            revived+=("$label")
            aos_log "kickstart $label OK"
        else
            aos_log "kickstart $label FAILED"
        fi
    fi
done < <(launchctl list 2>/dev/null | grep 'com\.boomrome\.')

# ─── 2 · pulse freshness ─────────────────────────────────────────────
last_pulse="$(aos_state_get last_pulse_ts)"
if [ -n "$last_pulse" ]; then
    lp_epoch="$(date -j -f '%Y-%m-%dT%H:%M:%SZ' "$last_pulse" +%s 2>/dev/null \
              || date -d "$last_pulse" +%s 2>/dev/null || echo 0)"
    now_epoch="$(date +%s)"
    age=$(( now_epoch - lp_epoch ))
    if [ "$lp_epoch" -gt 0 ] && [ "$age" -gt "$PULSE_MAX_AGE" ]; then
        problems+=("pulse fermo da ${age}s (max ${PULSE_MAX_AGE}s) — guardiano stallato")
        launchctl kickstart -k "gui/$UID_NUM/com.boomrome.pulse" >/dev/null 2>&1 \
            && revived+=("com.boomrome.pulse (stale)")
    fi
else
    aos_log "no last_pulse_ts yet (pulse may not have run) — skipping freshness"
fi

# ─── 3 · wacli daemon alive ──────────────────────────────────────────
wacli_pid="$(launchctl list 2>/dev/null | awk '$3=="com.boomrome.wacli"{print $1}')"
if [ -n "$wacli_pid" ] && [ "$wacli_pid" = "-" ]; then
    problems+=("wacli daemon non in esecuzione (PID assente) — WhatsApp cieco")
    launchctl kickstart -k "gui/$UID_NUM/com.boomrome.wacli" >/dev/null 2>&1 \
        && revived+=("com.boomrome.wacli")
fi

# ─── 4 · openclaw gateway reachable ──────────────────────────────────
# The wake path runs through openclaw. If the CLI is gone from PATH the
# whole brain is unreachable — worth knowing.
if ! command -v openclaw >/dev/null 2>&1; then
    problems+=("openclaw non in PATH — il risveglio dell'agente non funziona")
fi

# ─── DECISION · alert only on transitions ────────────────────────────
prev_state="$(aos_state_get health_state)"          # ok | sick
prev_state="${prev_state:-ok}"
last_nag="$(aos_state_get health_last_nag)"
last_nag="${last_nag:-0}"
now_epoch="$(date +%s)"

if [ "${#problems[@]}" -eq 0 ]; then
    aos_state_set health_state ok
    aos_state_set health_last_ok "$now_epoch"
    if [ "$prev_state" = "sick" ]; then
        aos_alert "Agent OS di nuovo SANO ✅ — tutti i servizi rispondono." info
    fi
    aos_log "healthy"
    exit 0
fi

# We have problems.
summary="$(printf '%s; ' "${problems[@]}")"
revived_txt=""
[ "${#revived[@]}" -gt 0 ] && revived_txt=" · auto-restart tentato: $(printf '%s, ' "${revived[@]}")"
aos_log "SICK: ${summary}${revived_txt}"
aos_state_set health_state sick

# Alert on transition, or re-nag if enough time passed.
should_alert=0
[ "$prev_state" = "ok" ] && should_alert=1
[ $(( now_epoch - last_nag )) -gt "$RENAG_SECS" ] && should_alert=1
if [ "$should_alert" -eq 1 ]; then
    aos_alert "Agent OS DEGRADATO 🚑
${summary}${revived_txt}" crit
    aos_state_set health_last_nag "$now_epoch"
fi
exit 0
