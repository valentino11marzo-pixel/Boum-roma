#!/usr/bin/env bash
# telemetry.sh — L5 Costi. Runs every hour via launchd.
# Reads the counters that pulse already writes (woken / skipped), peeks
# at OpenClaw's own log, computes an estimated $/€ spend for the day,
# rolls up a JSON metric snapshot, and:
#   - sends a daily 09:00 digest to Telegram (run-once per day);
#   - sends a BUDGET ALERT if today's estimated spend crosses the cap.
#
# This is the cost-discipline layer. The numbers are estimates (we don't
# have raw token usage from every channel), but they're better than the
# previous nothing.
#
# Tunables (env or .boom/env):
#   BUDGET_DAILY_EUR   soft cap; alert when exceeded (default 5.00)
#   DIGEST_HOUR_LOCAL  hour-of-day for the daily digest (default 9)
#   OPENCLAW_LOG       path to scan for token usage (default ~/.openclaw/agent.log)
set -uo pipefail

AOS_NAME="telemetry"
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
. "$HERE/../lib/common.sh"

BUDGET_DAILY_EUR="${BUDGET_DAILY_EUR:-5.00}"
DIGEST_HOUR_LOCAL="${DIGEST_HOUR_LOCAL:-9}"
OPENCLAW_LOG="${OPENCLAW_LOG:-$HOME/.openclaw/agent.log}"

# Estimated cost per Homie wake (haiku, --thinking minimal, short turn).
# Conservative: ~3k input + 600 output tokens.
# Haiku 4.5: $1/MTok in, $5/MTok out → ~$0.006 per turn → ~€0.0056.
COST_PER_WAKE_EUR="${COST_PER_WAKE_EUR:-0.006}"

today="$(date +%Y-%m-%d)"
hour_local="$(date +%H)"

# Daily roll-over: if state's "today" differs from current day, archive
# yesterday and reset counters. (pulse writes pulse_*_today, we own that
# convention here.)
prev_day="$(aos_state_get telemetry_day)"
if [ -n "$prev_day" ] && [ "$prev_day" != "$today" ]; then
    woken="$(aos_state_get pulse_woken_today)"; woken="${woken:-0}"
    skipped="$(aos_state_get pulse_skipped_today)"; skipped="${skipped:-0}"
    spent="$(printf '%s' "$(aos_state_get spent_today_eur)")"
    spent="${spent:-0}"
    # append to a daily ledger (one JSON line per day) for trend analysis.
    printf '{"day":"%s","woken":%s,"skipped":%s,"spent_eur":%s}\n' \
        "$prev_day" "$woken" "$skipped" "$spent" \
        >> "$AOS_STATE/ledger.jsonl"
    aos_state_set pulse_woken_today 0
    aos_state_set pulse_skipped_today 0
    aos_state_set spent_today_eur 0
    aos_state_set budget_alerted ""
    aos_state_set digest_sent ""
fi
aos_state_set telemetry_day "$today"

# Current-day numbers.
woken="$(aos_state_get pulse_woken_today)"; woken="${woken:-0}"
skipped="$(aos_state_get pulse_skipped_today)"; skipped="${skipped:-0}"
total=$(( woken + skipped ))

# Spend estimate. We bill on wakes (LLM calls). Cron'd OpenClaw jobs
# (boom-digest, boom-risk) are tracked separately if their counter exists.
digest_calls="$(aos_state_get openclaw_digest_calls_today)"; digest_calls="${digest_calls:-0}"
risk_calls="$(aos_state_get openclaw_risk_calls_today)"; risk_calls="${risk_calls:-0}"
total_calls=$(( woken + digest_calls + risk_calls ))
spent_eur="$(python3 -c "print(f'{$total_calls * $COST_PER_WAKE_EUR:.4f}')")"
aos_state_set spent_today_eur "$spent_eur"

# Efficiency: how often the gate saved us a wake (free pulses).
efficiency="0"
if [ "$total" -gt 0 ]; then
    efficiency="$(python3 -c "print(f'{$skipped * 100.0 / $total:.0f}')")"
fi

# JSON snapshot — handy for any dashboard we wire up later.
cat > "$AOS_STATE/metrics.json" <<EOF
{
  "day": "$today",
  "updated": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "pulse": {"woken": $woken, "skipped": $skipped, "efficiency_pct": $efficiency},
  "openclaw": {"digest_calls": $digest_calls, "risk_calls": $risk_calls},
  "cost": {"spent_eur": $spent_eur, "budget_eur": $BUDGET_DAILY_EUR},
  "cost_per_call_eur": $COST_PER_WAKE_EUR
}
EOF
aos_log "metrics: wake=$woken skip=$skipped eff=${efficiency}% spend=€$spent_eur / €$BUDGET_DAILY_EUR"

# ─── BUDGET ALERT ────────────────────────────────────────────────────
over_budget="$(python3 -c "print(1 if $spent_eur > $BUDGET_DAILY_EUR else 0)")"
already_alerted="$(aos_state_get budget_alerted)"
if [ "$over_budget" = "1" ] && [ "$already_alerted" != "$today" ]; then
    aos_alert "BUDGET superato 💸
oggi €$spent_eur / cap €$BUDGET_DAILY_EUR
$total_calls chiamate ($woken wake + $digest_calls digest + $risk_calls risk).
Pulse efficiency: ${efficiency}%. Considero di alzare il cap o stringere il gate." crit
    aos_state_set budget_alerted "$today"
fi

# ─── DAILY DIGEST · una sola volta, all'ora configurata ──────────────
digest_sent_for="$(aos_state_get digest_sent)"
if [ "$hour_local" = "$DIGEST_HOUR_LOCAL" ] && [ "$digest_sent_for" != "$today" ]; then
    # Compute yesterday's numbers from the ledger.
    yest="$(date -v-1d +%Y-%m-%d 2>/dev/null || date -d 'yesterday' +%Y-%m-%d)"
    yest_line="$(grep "\"day\":\"$yest\"" "$AOS_STATE/ledger.jsonl" 2>/dev/null | tail -1)"
    yest_part=""
    if [ -n "$yest_line" ]; then
        y_woken="$(printf '%s' "$yest_line" | python3 -c "import sys,json; print(json.loads(sys.stdin.read()).get('woken',0))")"
        y_spent="$(printf '%s' "$yest_line" | python3 -c "import sys,json; print(json.loads(sys.stdin.read()).get('spent_eur',0))")"
        yest_part="
Ieri: $y_woken wake · €$y_spent"
    fi
    aos_alert "🌅 Telemetria Agent OS
Pulse oggi: $woken wake / $skipped skip (eff ${efficiency}%)
Stima costo: €$spent_eur / cap €$BUDGET_DAILY_EUR$yest_part" info
    aos_state_set digest_sent "$today"
fi

aos_log "telemetry done"
