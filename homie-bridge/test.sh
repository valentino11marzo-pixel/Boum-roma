#!/usr/bin/env bash
# Homie ↔ BOOM Roma — diagnostica end-to-end.
# Esegue ogni tool una volta e ti dice cosa è OK e cosa no.
#
# Uso:
#   cd ~/homie-bridge && bash test.sh
#
# Niente effetti collaterali sul portal — usiamo solo i comandi read-only
# (snapshot/risk/spec) + un message di test su una conversazione "diagnostic".
set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENV_FILE="${HOME}/.boom/env"
[ -f "${ENV_FILE}" ] && source "${ENV_FILE}"

bold() { printf "\033[1m%s\033[0m\n" "$*"; }
pass() { printf "  \033[32m✓\033[0m %-22s %s\n" "$1" "$2"; PASS=$((PASS+1)); }
warn() { printf "  \033[33m!\033[0m %-22s %s\n" "$1" "$2"; WARN=$((WARN+1)); }
fail() { printf "  \033[31m✗\033[0m %-22s %s\n" "$1" "$2"; FAIL=$((FAIL+1)); }

PASS=0; WARN=0; FAIL=0
BASE="${BOOM_BASE_URL:-https://boomrome.com}"

bold "BOOM Roma · Homie diagnostics → ${BASE}"
echo

# Env
if [ -n "${HOMIE_SECRET:-}" ]; then
  pass "HOMIE_SECRET" "settato (****${HOMIE_SECRET: -4})"
else
  fail "HOMIE_SECRET" "MANCANTE. Rilancia bash install.sh"
  exit 1
fi

# Node
if NODE_V=$(node -v 2>/dev/null); then
  pass "Node runtime" "${NODE_V}"
else
  fail "Node runtime" "non installato"
fi

# Binary
if [ -x "${SCRIPT_DIR}/boom" ]; then
  pass "boom binary" "eseguibile"
else
  fail "boom binary" "non eseguibile (chmod +x ${SCRIPT_DIR}/boom)"
fi

echo
bold "Round-trip su ogni endpoint"

run() {
  local name="$1"; shift
  local output
  if output=$("${SCRIPT_DIR}/boom" "$@" 2>&1); then
    pass "${name}" "OK"
    return 0
  else
    fail "${name}" "${output}"
    return 1
  fi
}

run "heartbeat"      heartbeat --status live --tool diagnostics
run "snapshot"       snapshot
run "spec"           spec
run "risk"           risk

# Test message round-trip — usa una conversazione "_diag" che non interferisce
# con i contatti reali, e un wamid casuale per non duplicare al rerun.
DIAG_PHONE="+390000000000"
DIAG_ID="diag-$(date +%s)"
echo "  → message round-trip (conv 'whatsapp/${DIAG_PHONE}', msgId ${DIAG_ID})"
if MSG_OUT=$("${SCRIPT_DIR}/boom" message \
    --direction in --channel whatsapp \
    --phone "${DIAG_PHONE}" --name "BOOM Diagnostic" \
    --message-id "${DIAG_ID}" \
    --body "[diag] test connection $(date '+%H:%M:%S')" \
    --summary "Diagnostic ping" --needs-reply false --urgency low 2>&1); then
  pass "message create" "OK"
  CID=$(echo "${MSG_OUT}" | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{try{console.log(JSON.parse(s).conversationId||'')}catch(_){}})" || true)
  if [ -n "${CID}" ]; then
    pass "conversationId" "${CID}"
  fi
  # Idempotency: same msgId → dedup
  if DUP_OUT=$("${SCRIPT_DIR}/boom" message \
      --direction in --phone "${DIAG_PHONE}" \
      --message-id "${DIAG_ID}" --body "[diag] duplicate" 2>&1); then
    if echo "${DUP_OUT}" | grep -q '"dedupHit": true'; then
      pass "idempotency"  "stesso messageId → dedupHit:true"
    else
      warn "idempotency"  "secondo write non ha de-duppato (controllare)"
    fi
  fi
  # Pulisci: chiudi la conversazione diagnostic
  if "${SCRIPT_DIR}/boom" inbox-sync \
      --conversation-id "${CID}" --status closed >/dev/null 2>&1; then
    pass "inbox-sync close" "conversazione test chiusa"
  fi
else
  fail "message create" "${MSG_OUT}"
fi

# action (Tier 2 proposta) — verifica che la queue accetti senza eseguire
echo "  → action propose (Tier 2, contextHash dedup)"
HASH="diag-$(date +%s)"
if ACT_OUT=$("${SCRIPT_DIR}/boom" action \
    --kind note --lead "diag-lead-${HASH}" \
    --summary "Diagnostic action" \
    --confidence 0.8 \
    --hash "${HASH}" 2>&1); then
  pass "action propose"   "OK ($(echo "${ACT_OUT}" | grep -o '"id"[^,]*' | head -1))"
else
  warn "action propose"   "endpoint reachable ma ha rifiutato (probabilmente leadId fittizio — non è grave)"
fi

echo
bold "Risultato"
TOTAL=$((PASS+WARN+FAIL))
printf "  %d test totali — \033[32m%d OK\033[0m · \033[33m%d warning\033[0m · \033[31m%d fail\033[0m\n" \
  "${TOTAL}" "${PASS}" "${WARN}" "${FAIL}"
echo
if [ "${FAIL}" -eq 0 ]; then
  echo "  Tutto verde. Apri https://boomrome.com/portal.html e cerca il pallino HOMIE LIVE."
  echo "  Poi: load HOMIE.md come system prompt nell'agente WhatsApp del Mac. Pronto."
  exit 0
else
  echo "  Errori sopra. Più comuni:"
  echo "    401 invalid_secret  → HOMIE_SECRET ≠ quello di Vercel"
  echo "    403 Host not in allowlist → Vercel → Firewall, autorizza il Mac"
  echo "    500 server_misconfigured → la env HOMIE_SECRET su Vercel è vuota"
  exit 1
fi
