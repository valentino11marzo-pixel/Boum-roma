#!/usr/bin/env bash
# pulse.sh — the FREE guardian. Runs every 15 min via launchd.
# Reads WhatsApp as TEXT (via wacli) and diffs the portal (via boom risk).
# Wakes the LLM agent ONLY when something real has changed. Otherwise
# exits silently with 0 token cost.
#
# This is the L1 "Sense" layer of BOOM Agent OS. Cheap, fast, idempotent.
#
# Triggers a wake on any of:
#   - new inbound WhatsApp message(s) since last pulse
#   - new high-severity risk item server-side (overdue payment, expired
#     contract, missing signature, fiscal deadline crossed)
#   - new lead from the public website (snapshot delta on leads.newToday)
#
# Cost discipline: per pulse, sends AT MOST one wake-up with --thinking
# minimal + haiku. The agent itself may escalate inside its turn.
set -uo pipefail

AOS_NAME="pulse"
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
. "$HERE/../lib/common.sh"
. "$HERE/../lib/wacli.sh"
. "$HERE/../lib/portal.sh"

aos_lock "$AOS_NAME" 900 || exit 0

# Last successful pulse timestamp — drives the wacli "since" window.
last_pulse="$(aos_state_get last_pulse_ts)"
[ -z "$last_pulse" ] && last_pulse="$(date -u -v-30M +%Y-%m-%dT%H:%M:%SZ 2>/dev/null \
                                   || date -u -d '30 min ago' +%Y-%m-%dT%H:%M:%SZ)"
now="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
aos_log "pulse start (since $last_pulse)"

# ─── GATE A · WhatsApp delta ─────────────────────────────────────────
wa_delta=""
wa_count=0
if wacli_check; then
    wa_json="$(wacli_messages_since "$last_pulse" 200)"
    wa_count="$(printf '%s' "$wa_json" | wacli_count)"
    wa_count="${wa_count:-0}"
    if [ "$wa_count" -gt 0 ]; then
        wa_delta="$(printf '%s' "$wa_json" | wacli_compact)"
        aos_log "wacli: $wa_count new message(s)"
    fi
else
    aos_log "wacli not reachable, skipping WhatsApp gate"
fi

# ─── GATE B · portal delta ───────────────────────────────────────────
risk_delta=""
if portal_check; then
    risk_delta="$(portal_risk_delta "$AOS_STATE/risk.last.json" 2>/dev/null)"
    [ -n "$risk_delta" ] && aos_log "portal risk delta detected"

    # Snapshot fingerprint — captures new leads/contracts/overdues coming
    # from places Homie can't see in WhatsApp (e.g. the public form).
    snap_fp_now="$(portal_snapshot_fingerprint)"
    snap_fp_prev="$(aos_state_get snapshot_fp)"
    if [ -n "$snap_fp_now" ] && [ "$snap_fp_now" != "$snap_fp_prev" ]; then
        aos_log "portal snapshot fingerprint changed ($snap_fp_prev → $snap_fp_now)"
        snap_summary="$(portal_one_liner)"
        risk_delta="${risk_delta:+$risk_delta
}PORTAL CHANGED · $snap_summary"
        aos_state_set snapshot_fp "$snap_fp_now"
    fi
else
    aos_log "boom not reachable, skipping portal gate"
fi

# ─── DECISION · wake agent only if anything real changed ─────────────
if [ -z "$wa_delta" ] && [ -z "$risk_delta" ]; then
    aos_log "no changes, skipping wake (FREE pulse)"
    aos_state_set last_pulse_ts "$now"
    # Telemetry counter for skipped (free) pulses.
    skipped="$(aos_state_get pulse_skipped_today)"
    aos_state_set pulse_skipped_today "$(( ${skipped:-0} + 1 ))"
    exit 0
fi

# Build a tight, token-cheap context. No full payloads — just the delta.
context="$(printf 'PULSE %s (since %s)\n' "$now" "$last_pulse")"
if [ -n "$wa_delta" ]; then
    context="$(printf '%s\n\nWHATSAPP — %d nuovi messaggi:\n%s' \
        "$context" "$wa_count" "$wa_delta")"
fi
if [ -n "$risk_delta" ]; then
    context="$(printf '%s\n\nPORTAL — cambiamenti:\n%s' \
        "$context" "$risk_delta")"
fi

context="$(printf '%s\n\nAGISCI per SOUL.md (Bilanciato):\n- Specchia i WhatsApp con boom message (Tier-1).\n- Lead nuovi: boom lead-create --dedup.\n- Risposte/visite/chiamate: boom action (Tier-2, mando approvazione su Telegram).\n- Anti-rumore: SILENZIO su Telegram salvo proposte Tier-2 o urgenze vere.\n- Quiet hours 22-08: agisci sul portal, niente messaggi.' "$context")"

aos_log "waking agent (wa=$wa_count, risk_delta=${risk_delta:+yes})"
aos_wake_homie "$context" minimal 240 || aos_log "agent wake failed (exit $?)"

# Counters for telemetry (consumed by bin/telemetry.sh).
woken="$(aos_state_get pulse_woken_today)"
aos_state_set pulse_woken_today "$(( ${woken:-0} + 1 ))"

aos_state_set last_pulse_ts "$now"
aos_log "pulse done"
