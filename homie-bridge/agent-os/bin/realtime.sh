#!/usr/bin/env bash
# realtime.sh — event-driven daemon. Always-on, polls /api/agent/queue
# every POLL_SECS (default 15) and converts each pending notification into
# an immediate Homie wake.
#
# IL DIFETTO DEL 7 SETTEMBRE 2026 — questo daemon era il cliente che pagava
# due volte. Per OGNI notifica del server (lead.new ogni 10' dallo
# scan-inbox, giorno e notte) svegliava Homie con l'istruzione "dedup,
# qualifica, scrivi la risposta di benvenuto": esattamente il lavoro che
# bot/HOMIE.md vieta e che il server fa già gratis (Lead Brain,
# Commerciale). Ogni sveglia = un turno col modello di default del gateway
# (Sonnet) + 21k caratteri di bootstrap, che teneva la corsia
# `agent:main:main` fino a 240s. Risultato misurato nel log: "No reply from
# agent" alle :01, :11, :21… tutta la notte, le "troppe transazioni"
# Anthropic, e l'operatore che scrive a Homie su Telegram e non vede nemmeno
# "sta scrivendo" — il suo messaggio aspettava una corsia sempre occupata.
# Danno collaterale: la claim su /api/agent/queue toglie le notifiche dallo
# stato `pending` PRIMA che notify-pending (ogni minuto) le trasformi in card
# Telegram — la card "anche col Mac spento" arrivava SOLO col Mac spento.
#
# Ora: per DEFAULT questo daemon non sveglia nessuno e non interroga la
# coda (la lascia al server). REALTIME_WAKE_TYPES="tipo1,tipo2" in
# ~/.boom/env riaccende la sveglia SOLO per i tipi elencati — e quei tipi
# non riceveranno più la card Telegram del server, perché li consuma il Mac.
#
# launchd:  KeepAlive=true, RunAtLoad=true. If this script ever exits it
#           gets restarted within seconds; if the Mini reboots it comes
#           up on its own.
#
# Cost:    polling /api/agent/queue is FREE (no LLM call). Only allow-listed
#          events incur a Homie wake — through aos_wake_homie, whose model
#          is the GATEWAY DEFAULT (set it to haiku in openclaw.json: the old
#          comment "haiku + minimal" was a wish, not a fact).
set -uo pipefail

AOS_NAME="realtime"
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
. "$HERE/../lib/common.sh"
. "$HERE/../lib/wacli.sh"
. "$HERE/../lib/portal.sh" 2>/dev/null || true

POLL_SECS="${POLL_SECS:-15}"
API_BASE="${API_BASE:-https://boomrome.com/api/agent}"
MAX_ATTEMPTS_RETRY="${MAX_ATTEMPTS_RETRY:-3}"
# Allow-list of event types that may wake the LLM. Empty = mandate mode:
# no polling, no wakes, the server's own pipeline handles every event.
REALTIME_WAKE_TYPES="${REALTIME_WAKE_TYPES:-}"

if [ -z "${HOMIE_SECRET:-}" ]; then
    aos_log "FATAL: HOMIE_SECRET not set (load ~/.boom/env first)"
    sleep 60
    exit 1
fi

if [ -z "$REALTIME_WAKE_TYPES" ]; then
    aos_log "realtime daemon in MANDATE mode: nessuna sveglia LLM, coda lasciata al server (REALTIME_WAKE_TYPES vuota — vedi bot/HOMIE.md)"
    # Stay alive quietly (KeepAlive would just restart us); re-read the env
    # every 5 min so enabling the allow-list needs no restart.
    while :; do
        sleep 300
        [ -f "$HOME/.boom/env" ] && . "$HOME/.boom/env"
        [ -n "${REALTIME_WAKE_TYPES:-}" ] && { aos_log "REALTIME_WAKE_TYPES impostata ($REALTIME_WAKE_TYPES) — riavvio in modalità sveglia"; exit 0; }
    done
fi
aos_log "realtime daemon starting (poll=${POLL_SECS}s, api=$API_BASE, wake_types=$REALTIME_WAKE_TYPES)"

# Trap SIGTERM / SIGINT for clean launchd shutdowns.
running=1
trap 'aos_log "received signal, stopping"; running=0' INT TERM

# Build the human-readable context an event should turn into. Memory.sh
# is reused: if the event mentions a known WhatsApp contact, the contact's
# profile is injected too (continuity for free).
build_context() {
    local type="$1" summary="$2" priority="$3" payload="$4"
    python3 -c "
import json, sys
type    = sys.argv[1]
summary = sys.argv[2]
priority= sys.argv[3]
payload_json = sys.argv[4]
try: payload = json.loads(payload_json) if payload_json else {}
except: payload = {}

hdr = {
  'lead.new':            'NUOVO LEAD',
  'lead.update':         'LEAD AGGIORNATO',
  'contract.signed':     'CONTRATTO FIRMATO',
  'contract.expired':    'CONTRATTO SCADUTO',
  'payment.received':    'PAGAMENTO RICEVUTO',
  'payment.overdue':     'PAGAMENTO IN RITARDO',
  'maintenance.opened':  'TICKET MANUTENZIONE',
  'maintenance.updated': 'TICKET AGGIORNATO',
  'action.approved':     'AZIONE APPROVATA (eseguire)',
  'action.rejected':     'AZIONE RIFIUTATA',
  'document.uploaded':   'DOCUMENTO CARICATO',
  'custom':              'EVENTO',
}.get(type, type.upper())

out = [f'⚡ REALTIME [{priority.upper()}] {hdr}', summary]
if payload:
    # Compact key:val list, no noise.
    kv = []
    for k, v in payload.items():
        if k.startswith('_'): continue
        s = str(v) if not isinstance(v, (dict, list)) else json.dumps(v, ensure_ascii=False)[:120]
        kv.append(f'  · {k}: {s[:200]}')
    if kv:
        out.append('Dettagli:')
        out.extend(kv)

guide = {
  'lead.new':            'Lead nuovo arrivato: dedup contro leads esistenti, qualifica, scrivi risposta di benvenuto (Tier-2), proponi visita se hai property+budget.',
  'contract.signed':     'Firma chiusa: crea utente tenant, manda docs, chiudi il lead, aggiorna stato property a affittata. Notifica landlord.',
  'maintenance.opened':  'Ticket aperto dal tenant: diagnostica (parse-docs sulle foto se ci sono), proponi intervento (Tier-2), aggiorna landlord.',
  'payment.overdue':     'Scaduto: messaggio di promemoria garbato al tenant (Tier-2), avvisa landlord, aggiorna risk.',
  'action.approved':     'Esegui la action approvata (boom action --execute <id>), conferma su Telegram.',
}.get(type, 'Valuta SOUL-V2 e agisci di conseguenza (Tier-1 silente / Tier-2 con approvazione).')
out.append('')
out.append(guide)
print('\n'.join(out))
" "$type" "$summary" "$priority" "$payload"
}

# Optional WhatsApp-contact memory injection if payload contains a chat id.
inject_memory_if_any() {
    local payload="$1"
    local chat
    chat="$(python3 -c "
import json, sys
try: p = json.loads(sys.argv[1])
except: p = {}
for k in ('chat','chatId','jid','phone','from','wa'):
    if p.get(k): print(p[k]); break
" "$payload" 2>/dev/null)"
    [ -z "$chat" ] && return 0
    bash "$HERE/memory.sh" inject "$chat" 2>/dev/null
}

type_allowed() {
    case ",$REALTIME_WAKE_TYPES," in
        *",$1,"*) return 0 ;;
        *) return 1 ;;
    esac
}

process_one() {
    local id="$1" type="$2" summary="$3" priority="$4" payload="$5" attempts="$6"
    aos_log "event $id [$type/$priority] :: ${summary:0:100}"
    if ! type_allowed "$type"; then
        # Not ours: the server pipeline owns it. Release without an LLM turn.
        aos_log "event $id [$type] non in REALTIME_WAKE_TYPES — nessuna sveglia, ack done (gestito dal server)"
        curl -fsS -m 20 -X POST "$API_BASE/ack" \
            -H "Content-Type: application/json" \
            -H "X-Homie-Secret: $HOMIE_SECRET" \
            -d "$(printf '{"id":"%s","status":"done","detail":"server-side (realtime mandate)"}' "$id")" \
            >/dev/null 2>&1
        return 0
    fi
    local context
    context="$(build_context "$type" "$summary" "$priority" "$payload")"
    local mem
    mem="$(inject_memory_if_any "$payload")"
    [ -n "$mem" ] && context="$context

$mem"

    # Wake Homie. Urgent events get a slightly higher thinking budget.
    local thinking="minimal"
    [ "$priority" = "urgent" ] && thinking="low"
    if aos_wake_homie "$context" "$thinking" 240; then
        # ACK done
        curl -fsS -m 20 -X POST "$API_BASE/ack" \
            -H "Content-Type: application/json" \
            -H "X-Homie-Secret: $HOMIE_SECRET" \
            -d "$(printf '{"id":"%s","status":"done"}' "$id")" \
            >/dev/null 2>&1 || aos_log "ack done failed for $id"
        woken="$(aos_state_get realtime_woken_today)"
        aos_state_set realtime_woken_today "$(( ${woken:-0} + 1 ))"
        aos_log "event $id done"
    else
        local retry="false"
        [ "$attempts" -lt "$MAX_ATTEMPTS_RETRY" ] && retry="true"
        curl -fsS -m 20 -X POST "$API_BASE/ack" \
            -H "Content-Type: application/json" \
            -H "X-Homie-Secret: $HOMIE_SECRET" \
            -d "$(printf '{"id":"%s","status":"failed","retry":%s,"detail":"wake failed"}' "$id" "$retry")" \
            >/dev/null 2>&1
        aos_log "event $id wake FAILED (attempts=$attempts, retry=$retry)"
    fi
}

# ─── main loop ───────────────────────────────────────────────────────
while [ "$running" -eq 1 ]; do
    # Daily counter roll-over (so telemetry.sh can read realtime_woken_today).
    today="$(date +%Y-%m-%d)"
    prev_day="$(aos_state_get realtime_day)"
    if [ -n "$prev_day" ] && [ "$prev_day" != "$today" ]; then
        aos_state_set realtime_woken_today 0
        aos_state_set realtime_polls_today 0
    fi
    aos_state_set realtime_day "$today"

    polls="$(aos_state_get realtime_polls_today)"
    aos_state_set realtime_polls_today "$(( ${polls:-0} + 1 ))"

    # Poll the queue.
    resp="$(curl -fsS -m 10 -X POST "$API_BASE/queue" \
        -H "Content-Type: application/json" \
        -H "X-Homie-Secret: $HOMIE_SECRET" \
        -d '{"limit":5}' 2>/dev/null)"

    if [ -n "$resp" ]; then
        # Parse + dispatch with python (jq might not be installed).
        # Each line of output is: id\ttype\tpriority\tattempts\tsummary\tpayload_json
        items="$(printf '%s' "$resp" | python3 -c "
import json, sys
try: data = json.load(sys.stdin)
except: sys.exit(0)
if not data.get('ok'): sys.exit(0)
for it in data.get('items', []):
    payload = json.dumps(it.get('payload') or {}, ensure_ascii=False)
    summary = (it.get('summary') or '').replace('\t',' ').replace('\n',' ')
    print('\t'.join([
        str(it.get('id','')),
        str(it.get('type','')),
        str(it.get('priority','normal')),
        str(it.get('attempts',1)),
        summary,
        payload,
    ]))
" 2>/dev/null)"
        if [ -n "$items" ]; then
            while IFS=$'\t' read -r id type priority attempts summary payload; do
                [ -z "$id" ] && continue
                process_one "$id" "$type" "$summary" "$priority" "$payload" "$attempts"
            done <<EOF
$items
EOF
        fi
    fi

    # Interruptible sleep so SIGTERM doesn't have to wait POLL_SECS.
    for _ in $(seq 1 "$POLL_SECS"); do
        [ "$running" -eq 1 ] || break
        sleep 1
    done
done

aos_log "realtime daemon stopped cleanly"
exit 0
