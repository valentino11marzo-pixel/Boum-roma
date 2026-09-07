#!/usr/bin/env bash
# wa-forwarder.sh — L'ORECCHIO. Inoltra ogni messaggio WhatsApp (in + out)
# verbatim a POST /api/homie/message. `messageId` è la chiave di
# idempotenza: il server deduplica in silenzio, quindi RIMANDARE È GRATIS —
# ed è il perno di tutte le correzioni qui sotto.
#
# È il pezzo che il server non può fare da solo (serve una sessione WhatsApp
# viva su una macchina vera) e da cui dipende TUTTO il resto: senza questo,
# `api/homie/_lead.js` non vede nessuno, il Lead Brain non grada, Telegram
# non pinga, e il Commerciale scrive a chi hai già risposto tu.
#
# ── I TRE DIFETTI DEL 7 SETTEMBRE 2026 ────────────────────────────────────
# Il file è vissuto un mese fuori da git (esisteva solo sul disco del Mac
# mini) e nessuno l'aveva mai riletto. Il sintomo dell'operatore era «non
# si aggiorna live da WhatsApp, e ad alcuni avevo già risposto».
#
# 1. IL CURSORE AVANZAVA ANCHE SUL FALLIMENTO. `raw="$(wacli ... || echo '')"`
#    rendeva «wacli è giù» e «non ci sono messaggi nuovi» IDENTICI, e in
#    entrambi i casi il cursore veniva riscritto in coda al giro. Ogni
#    minuto in cui wacli si riavviava o la sessione WhatsApp si
#    riconnetteva, quei messaggi sparivano PER SEMPRE: mai inoltrati, mai
#    diventati lead, mai arrivati su Telegram. Stessa identica lezione di
#    `runVerdict` in api/homie/searches.js — un orecchio SORDO non deve mai
#    somigliare a un mondo silenzioso — che lì era stata imparata e qui no.
#    Ora: l'esito di wacli si legge, e il cursore avanza solo se il giro è
#    andato davvero. Idem per gli invii: un 5xx/timeout tiene fermo il
#    cursore (il replay è gratis), un 4xx no — quel messaggio non sarà mai
#    accettato e bloccherebbe la coda per sempre.
#
# 2. I MESSAGGI SENZA TESTO VENIVANO BUTTATI. `if not mid or not text:
#    continue`. Una nota vocale, una foto dell'appartamento, un PDF: la
#    persona non esisteva. A Roma metà dei primi contatti sono note vocali.
#    Ora i media riconoscibili viaggiano con un'etichetta ([nota vocale],
#    [foto]…) così la persona diventa un lead; e ciò che NON si sa
#    nominare viene SCARTATO MA LOGGATO, perché uno scarto silenzioso è
#    indistinguibile da un difetto (e il log ci dice lo schema vero di
#    wacli per la prossima volta).
#
# 3. I GRUPPI DIVENTAVANO LEAD SPAZZATURA. `phone = 'group:' + jid` e il
#    server non filtra: nasceva un lead con numero «group:12036…», che
#    nessuno può richiamare. Ora i @g.us si saltano come già @newsletter e
#    @broadcast, e il conto finisce nel log.
#
# State: ~/.boom/wa-forwarder-cursor (ISO dell'ultimo giro RIUSCITO)
set -uo pipefail

ENV_FILE="${HOME}/.boom/env"
# shellcheck disable=SC1090
[ -f "$ENV_FILE" ] && . "$ENV_FILE"

POLL_SECS="${POLL_SECS:-20}"
API="${WA_FORWARD_API:-https://www.boomrome.com/api/homie/message}"
CURSOR="${HOME}/.boom/wa-forwarder-cursor"
LOG="${HOME}/.boom/wa-forwarder.log"
WACLI="${WACLI:-$(command -v wacli 2>/dev/null || echo '')}"
# Dopo quanto un cursore bloccato smette di essere un intoppo e diventa una
# notizia da dare all'operatore (una volta, non a ogni giro).
STUCK_ALERT_SECS="${STUCK_ALERT_SECS:-900}"

log() { printf '%s [wa-fwd] %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$*" >> "$LOG"; }

# aos_alert se agent-os è a fianco (lo è: stessa cartella bin/). Best-effort:
# un orecchio non deve morire perché manca la libreria degli allarmi.
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
AOS_NAME="wa-forwarder"
# shellcheck disable=SC1091
. "$HERE/../lib/common.sh" 2>/dev/null || true
alert() { if command -v aos_alert >/dev/null 2>&1; then aos_alert "$1" "${2:-warn}"; fi; }

if [ -z "${HOMIE_SECRET:-}" ]; then log "FATAL: HOMIE_SECRET missing"; sleep 60; exit 1; fi
if [ -z "$WACLI" ] || [ ! -x "$WACLI" ]; then log "FATAL: wacli not found"; sleep 60; exit 1; fi

# Primo avvio: si parte da adesso, non si rigioca la storia.
[ -f "$CURSOR" ] || date -u +%Y-%m-%dT%H:%M:%SZ > "$CURSOR"

running=1
trap 'log "stopping"; running=0' INT TERM
log "started (poll=${POLL_SECS}s, api=$API)"

stuck_since=0
alerted=0

while [ "$running" -eq 1 ]; do
    cursor="$(cat "$CURSOR" 2>/dev/null)"
    # Istante preso PRIMA della lettura: un messaggio arrivato durante il
    # giro verrà ripescato al giro dopo (duplicato = gratis), mai perso.
    new_cursor="$(date -u +%Y-%m-%dT%H:%M:%SZ)"

    raw="$("$WACLI" messages list --after "$cursor" --json --limit 500 2>/dev/null)"
    wacli_rc=$?

    if [ "$wacli_rc" -ne 0 ]; then
        # DIFETTO 1: qui prima si finiva nello stesso ramo di "zero messaggi"
        # e il cursore avanzava lo stesso.
        log "wacli EXIT $wacli_rc — cursore fermo a $cursor, riprovo fra ${POLL_SECS}s"
        [ "$stuck_since" -eq 0 ] && stuck_since="$(date +%s)"
    else
        lines="$(printf '%s' "$raw" | python3 -c "
import json, sys

MEDIA = {
    'audio': '[nota vocale]', 'ptt': '[nota vocale]', 'voice': '[nota vocale]',
    'image': '[foto]', 'video': '[video]', 'document': '[documento]',
    'location': '[posizione]', 'contact': '[contatto]',
}

try:
    data = json.loads(sys.stdin.read())
except Exception:
    sys.exit(0)

if isinstance(data, dict):
    msgs = (data.get('data') or {}).get('messages') or data.get('messages') or []
elif isinstance(data, list):
    msgs = data
else:
    sys.exit(0)

groups = 0
unknown = []
for m in msgs:
    jid = m.get('ChatJID', '') or ''
    if '@newsletter' in jid or '@broadcast' in jid:
        continue
    # DIFETTO 3: un gruppo non e' una persona da richiamare.
    if jid.endswith('@g.us'):
        groups += 1
        continue
    mid = m.get('MsgID', '') or ''
    if not mid:
        continue
    text = m.get('Text', '') or m.get('DisplayText', '') or ''
    if not text:
        # DIFETTO 2: prima qui si buttava tutto.
        kind = str(m.get('MediaType') or m.get('Type') or m.get('Kind') or '').strip().lower()
        text = MEDIA.get(kind, '')
        if not text:
            unknown.append(kind or ','.join(sorted(m.keys()))[:120])
            continue
    ts = m.get('Timestamp', '') or ''
    name = (m.get('ChatName', '') or '').replace('\t', ' ')
    phone = '+' + jid.split('@')[0]
    direction = 'out' if m.get('FromMe') else 'in'
    print('\t'.join([direction, phone, name, text.replace('\t', ' '), mid, ts]))

if groups or unknown:
    sys.stderr.write('SKIP groups=%d muti=%s\n' % (groups, ';'.join(unknown[:5])))
" 2>>"$LOG")"

        fail_retryable=0
        sent=0
        while IFS=$'\t' read -r direction phone name body msg_id ts; do
            [ -z "$msg_id" ] && continue
            payload="$(python3 -c "
import json,sys
print(json.dumps({'direction':sys.argv[1],'channel':'whatsapp','phone':sys.argv[2],
                  'name':sys.argv[3],'body':sys.argv[4],'messageId':sys.argv[5],
                  'timestamp':sys.argv[6]}))" \
                "$direction" "$phone" "$name" "$body" "$msg_id" "$ts" 2>/dev/null)"
            [ -z "$payload" ] && { log "ERR payload illeggibile msg=$msg_id"; continue; }
            resp="$(curl -s -w '\n%{http_code}' -m 10 -X POST "$API" \
                -H "X-Homie-Secret: $HOMIE_SECRET" \
                -H "Content-Type: application/json" \
                -d "$payload" 2>/dev/null)"
            code="$(printf '%s' "$resp" | tail -1)"
            case "$code" in
                200) sent=$((sent + 1)) ;;
                # Un 4xx (payload rifiutato) non si aggiusta aspettando: se
                # tenesse fermo il cursore bloccherebbe la coda per sempre.
                4*) [ "$code" = "429" ] && fail_retryable=$((fail_retryable + 1)) \
                        || log "SCARTATO $code msg=$msg_id phone=$phone (definitivo)" ;;
                *)  fail_retryable=$((fail_retryable + 1)); log "ERR $code msg=$msg_id phone=$phone (riprovo)" ;;
            esac
        done <<< "$lines"

        if [ "$fail_retryable" -eq 0 ]; then
            printf '%s' "$new_cursor" > "$CURSOR"
            [ "$sent" -gt 0 ] && log "inoltrati $sent"
            stuck_since=0
            if [ "$alerted" -eq 1 ]; then
                alert "WhatsApp: l'inoltro è ripartito, i messaggi in sospeso sono passati." info
                alerted=0
            fi
        else
            log "$fail_retryable invii da riprovare — cursore fermo a $cursor (il server deduplica: il replay è gratis)"
            [ "$stuck_since" -eq 0 ] && stuck_since="$(date +%s)"
        fi
    fi

    # Un orecchio fermo va detto UNA volta, non a ogni giro (disciplina
    # alertDecision di api/pfs/_health.js).
    if [ "$stuck_since" -ne 0 ] && [ "$alerted" -eq 0 ]; then
        if [ $(( $(date +%s) - stuck_since )) -gt "$STUCK_ALERT_SECS" ]; then
            alert "WhatsApp NON arriva al server da oltre $((STUCK_ALERT_SECS / 60)) minuti (wa-forwarder fermo). I messaggi non sono persi: ripartono da soli quando torna. Log: ~/.boom/wa-forwarder.log" crit
            alerted=1
        fi
    fi

    for _ in $(seq 1 "$POLL_SECS"); do
        [ "$running" -eq 1 ] || break
        sleep 1
    done
done

log "stopped"
