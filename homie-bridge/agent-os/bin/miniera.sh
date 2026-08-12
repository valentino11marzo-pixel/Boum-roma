#!/usr/bin/env bash
# miniera.sh — LA MINIERA, lato Mac: lo storico wacli sale al server.
#
# Il Mac è l'unico posto dove vivono i MESI di conversazioni WhatsApp
# (wacli); il server è l'unico posto col giudizio. Questo script fa il
# lavoro di SESSIONE e nient'altro (regola di bot/HOMIE.md): estrae lo
# storico, lo riduce a righe per-thread (miniera_extract.py — feature e
# campioni corti, mai l'archivio integrale), salta gli invariati, POSTa a
# lotti e chiede lo studio. Il verdetto arriva su Telegram dal server.
#
# Uso:
#   miniera.sh              sync completo + studio
#   miniera.sh --dry        estrae e conta soltanto, non manda nulla
#   miniera.sh --no-study   solo sync, senza rigenerare lo studio
#   miniera.sh --since ISO  limita l'estrazione (default: tutto lo storico)
#
# Idempotente per costruzione: righe con hash invariato non partono nemmeno,
# e il server fa comunque upsert deterministico (sha1 del chatId).
set -uo pipefail

AOS_NAME="miniera"
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
. "$HERE/../lib/common.sh"
. "$HERE/../lib/wacli.sh"

BOOM_BASE_URL="${BOOM_BASE_URL:-https://www.boomrome.com}"
API="$BOOM_BASE_URL/api/homie/miniera"

DRY=0; DO_STUDY=1; SINCE="2015-01-01T00:00:00Z"
while [ $# -gt 0 ]; do
    case "$1" in
        --dry) DRY=1 ;;
        --no-study) DO_STUDY=0 ;;
        --since) shift; SINCE="${1:-$SINCE}" ;;
    esac
    shift || true
done

if [ -z "${HOMIE_SECRET:-}" ]; then
    aos_log "FATAL: HOMIE_SECRET non impostato (carica ~/.boom/env)"
    exit 1
fi
wacli_check || { aos_log "FATAL: wacli non raggiungibile"; exit 1; }

aos_lock "$AOS_NAME" 3600 || exit 0

WORK="$(mktemp -d "${TMPDIR:-/tmp}/miniera.XXXX")"
trap 'rm -rf "$WORK"' EXIT

# 1 · Lo stato del server: cosa conosce già (mappa id→hash).
KNOWN="$WORK/known.json"
if [ "$DRY" -eq 0 ]; then
    curl -fsS -m 30 -H "X-Homie-Secret: $HOMIE_SECRET" "$API" 2>/dev/null \
        | python3 -c "import sys,json; print(json.dumps((json.load(sys.stdin) or {}).get('known', {})))" \
        > "$KNOWN" 2>/dev/null || printf '{}' > "$KNOWN"
else
    printf '{}' > "$KNOWN"
fi

# 2 · Tutto lo storico wacli → righe per-thread → lotti pronti da spedire.
aos_log "estraggo lo storico wacli (da $SINCE)…"
SUMMARY="$(wacli_messages_since "$SINCE" 100000 \
    | python3 "$HERE/miniera_extract.py" --known "$KNOWN" --batches "$WORK/batches" $([ "$DRY" -eq 1 ] && printf -- --dry))"
aos_log "estrazione: $SUMMARY"

if [ "$DRY" -eq 1 ]; then
    echo "$SUMMARY (dry run — niente inviato)"
    exit 0
fi

# 3 · I lotti salgono. Un lotto fallito si riprova al giro dopo: l'upsert
#     è idempotente, quindi rimandare è sempre innocuo.
sent=0; failed=0
for f in "$WORK"/batches/batch_*.json; do
    [ -e "$f" ] || break
    if curl -fsS -m 60 -X POST "$API" \
        -H "Content-Type: application/json" \
        -H "X-Homie-Secret: $HOMIE_SECRET" \
        --data-binary "@$f" >/dev/null 2>&1; then
        sent=$((sent + 1))
    else
        failed=$((failed + 1))
        aos_log "lotto fallito: $(basename "$f") (riproverà al prossimo giro)"
    fi
done
aos_log "sync: $sent lotti inviati, $failed falliti"

# 4 · Lo studio: il server incrocia con gli esiti e manda il verdetto su
#     Telegram. Qui si stampa solo il podio, per chi lancia a mano.
if [ "$DO_STUDY" -eq 1 ] && [ "$failed" -eq 0 ]; then
    aos_log "chiedo lo studio…"
    curl -fsS -m 120 -X POST "$API" \
        -H "Content-Type: application/json" \
        -H "X-Homie-Secret: $HOMIE_SECRET" \
        -d '{"op":"study"}' 2>/dev/null \
        | python3 -c "
import sys, json
try: r = json.load(sys.stdin)
except Exception: print('studio: risposta illeggibile'); sys.exit(0)
if not r.get('ok'): print('studio fallito:', r.get('error')); sys.exit(0)
v = r.get('verdict') or {}
st = r.get('study') or {}
f = st.get('funnel') or {}
print('STUDIO OK — thread:', f.get('threads'), '· lead agganciati:', f.get('joinedLeads'),
      '· contratti:', f.get('contract'))
if v.get('note'): print('NOTA:', v['note'])
for i, p in enumerate([p for p in v.get('powers', []) if p.get('measurable') is not False][:3], 1):
    print(f\"{i}. {p.get('title')} — punteggio {p.get('score')}\" + ('' if p.get('sufficient') else ' (dati insufficienti)'))
    for w in p.get('why', []): print('   ·', w)
print('Rapporto:', r.get('report'))
"
elif [ "$failed" -gt 0 ]; then
    aos_log "studio saltato: $failed lotti non sono saliti — rilancia lo script"
fi
