#!/usr/bin/env bash
# memory.sh — L6 Memoria. Runs every hour via launchd, plus is callable
# on-demand by pulse (memory.sh inject <chat_id>) to print a contact
# profile.
#
# The Mac Mini has a brain that forgets between sessions. This script is
# the persistent memory: per WhatsApp contact, one JSON file with the
# things that matter — last touch, what we promised, sentiment trend,
# property/budget if known, and any "watch out" flags. Pulse, when it
# wakes the agent over a chat, prepends this so Homie picks up the
# conversation as if it had remembered.
#
# Modes:
#   memory.sh              — refresh ALL profiles from the last 24h of wacli
#                            (default cron mode)
#   memory.sh inject CHAT  — print the profile context for CHAT
#                            (used by pulse to enrich wake messages)
#   memory.sh show CHAT    — pretty-print the JSON profile for a contact
#   memory.sh forget CHAT  — wipe a contact's profile (privacy / start over)
set -uo pipefail

AOS_NAME="memory"
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
. "$HERE/../lib/common.sh"
. "$HERE/../lib/wacli.sh"

PROFILES_DIR="$AOS_STATE/profiles"
mkdir -p "$PROFILES_DIR"

mode="${1:-refresh}"
chat_arg="${2:-}"

# Stable filename for a chat id (strip non-alnum).
profile_path() {
    local raw="$1"
    local key
    key="$(printf '%s' "$raw" | tr -c '[:alnum:]' '_' | head -c 64)"
    printf '%s/%s.json' "$PROFILES_DIR" "$key"
}

# ─── inject mode: cheap profile readout for pulse ────────────────────
if [ "$mode" = "inject" ]; then
    [ -z "$chat_arg" ] && exit 0
    pp="$(profile_path "$chat_arg")"
    [ ! -f "$pp" ] && exit 0
    python3 -c "
import json, sys
p = json.load(open('$pp'))
last = p.get('last_touch','?')
n = p.get('msg_count', 0)
sentiment = p.get('sentiment','?')
promises = p.get('promises',[])
budget = p.get('budget','?')
prop = p.get('property','?')
watch = p.get('watchouts',[])
out = [f'MEMORIA su {p.get(\"name\", p.get(\"chat\",\"?\"))}:']
out.append(f'  ultimo tocco: {last} ({n} messaggi totali)')
if budget and budget != '?': out.append(f'  budget: {budget}')
if prop and prop != '?':   out.append(f'  interesse: {prop}')
out.append(f'  sentiment: {sentiment}')
if promises:
    out.append('  promesse aperte:')
    for x in promises[-5:]: out.append(f'    · {x}')
if watch:
    out.append('  attenzione:')
    for x in watch[-3:]: out.append(f'    · {x}')
print('\n'.join(out))
"
    exit 0
fi

if [ "$mode" = "show" ]; then
    [ -z "$chat_arg" ] && { echo "usage: memory.sh show CHAT"; exit 1; }
    pp="$(profile_path "$chat_arg")"
    [ ! -f "$pp" ] && { echo "no profile for $chat_arg"; exit 1; }
    cat "$pp"
    exit 0
fi

if [ "$mode" = "forget" ]; then
    [ -z "$chat_arg" ] && { echo "usage: memory.sh forget CHAT"; exit 1; }
    pp="$(profile_path "$chat_arg")"
    rm -f "$pp" && aos_log "forgot profile for $chat_arg"
    exit 0
fi

# ─── refresh mode: rebuild profiles from the last 24h ────────────────
aos_lock "$AOS_NAME" 1200 || exit 0

wacli_check || { aos_log "wacli unreachable, skipping refresh"; exit 0; }

since="$(date -u -v-24H +%Y-%m-%dT%H:%M:%SZ 2>/dev/null \
       || date -u -d '24 hours ago' +%Y-%m-%dT%H:%M:%SZ)"
msgs="$(wacli_messages_since "$since" 500)"
n="$(printf '%s' "$msgs" | wacli_count)"; n="${n:-0}"
aos_log "refreshing profiles from $n messages (since $since)"
[ "$n" -eq 0 ] && exit 0

# Group, derive lightweight signals, persist per-contact JSON. All in
# python so we keep the bash file readable.
printf '%s' "$msgs" | python3 - "$PROFILES_DIR" <<'PY'
import json, sys, os, re, hashlib, datetime
profiles_dir = sys.argv[1]
data = sys.stdin.read()
try:
    msgs = json.loads(data)
except Exception:
    sys.exit(0)
if not isinstance(msgs, list):
    sys.exit(0)

def field(m, *keys, default=''):
    for k in keys:
        if k in m and m[k]: return m[k]
    return default

def chat_key(raw):
    return re.sub(r'[^A-Za-z0-9]', '_', str(raw))[:64] or 'unknown'

# Crude but useful sentiment + intent signals — no LLM, free.
POSITIVE = ('grazie','perfetto','ok','volentieri','interessante','si','va bene','d\'accordo','firmo','prenoto')
NEGATIVE = ('no grazie','non mi interessa','troppo caro','annullo','disdico','rinuncio','arrabbiat','deluso','reclamo')
INTENT_VIEWING = ('visita','vedere','visitare','quando posso','possibile vedere','appuntamento')
INTENT_BUDGET  = re.compile(r'(\d{3,5})\s*(€|euro|eur)\b', re.I)
INTENT_DOC     = ('busta paga','contratto','codice fiscale','garante','documento')
PROMISE_PAT    = re.compile(r'\b(ti mando|ti scrivo|ti chiamo|ti faccio sapere|domani|stasera|tra .* ore|appena (?:ho|posso))\b', re.I)

# Group messages by chat id.
groups = {}
for m in msgs:
    chat = field(m,'chatId','chat','remoteJid','jid','peer','chatName')
    if not chat:
        chat = field(m,'from','sender','phone','name', default='?')
    groups.setdefault(chat, []).append(m)

now_iso = datetime.datetime.utcnow().isoformat() + 'Z'

for chat, items in groups.items():
    items.sort(key=lambda m: field(m,'timestamp','time','sentAt','at','ts','date','createdAt'))
    pp = os.path.join(profiles_dir, chat_key(chat) + '.json')
    prev = {}
    if os.path.exists(pp):
        try: prev = json.load(open(pp))
        except: prev = {}
    # Merge new signals into the existing profile.
    profile = {
        'chat': chat,
        'name': field(items[-1],'pushName','senderName','name','chatName', default=prev.get('name','')),
        'last_touch': field(items[-1],'timestamp','time','sentAt','at','ts','date','createdAt', default=now_iso),
        'msg_count': int(prev.get('msg_count', 0)) + len(items),
        'sentiment': prev.get('sentiment', 'neutral'),
        'promises': list(prev.get('promises', []))[-20:],
        'budget':   prev.get('budget','?'),
        'property': prev.get('property','?'),
        'watchouts': list(prev.get('watchouts', []))[-10:],
    }
    pos = neg = viewing_hits = doc_hits = 0
    for m in items:
        body = field(m,'body','text','content','message') or ''
        if isinstance(body, dict): body = json.dumps(body, ensure_ascii=False)
        body_low = str(body).lower()
        if any(p in body_low for p in POSITIVE): pos += 1
        if any(p in body_low for p in NEGATIVE): neg += 1
        if any(p in body_low for p in INTENT_VIEWING): viewing_hits += 1
        if any(p in body_low for p in INTENT_DOC): doc_hits += 1
        bmatch = INTENT_BUDGET.search(body_low)
        if bmatch and profile['budget'] == '?':
            profile['budget'] = f"{bmatch.group(1)}€"
        for pm in PROMISE_PAT.findall(body):
            promise = f"{profile['last_touch'][:10]}: \"{(body[:80]).strip()}\""
            if promise not in profile['promises']:
                profile['promises'].append(promise)
    # Update sentiment.
    if pos > neg and pos > 0:   profile['sentiment'] = 'positive'
    elif neg > pos and neg > 0: profile['sentiment'] = 'negative'
    # Watchouts: derived flags worth surfacing.
    watch = set(profile['watchouts'])
    if viewing_hits >= 2 and 'wants_viewing' not in watch:
        watch.add('wants_viewing')
    if doc_hits >= 1 and 'docs_in_play' not in watch:
        watch.add('docs_in_play')
    if neg >= 2:
        watch.add('sentiment_declining')
    profile['watchouts'] = sorted(watch)
    json.dump(profile, open(pp,'w'), ensure_ascii=False, indent=2)
print(f"refreshed {len(groups)} profiles")
PY
aos_log "memory refresh done"
