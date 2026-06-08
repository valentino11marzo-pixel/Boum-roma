# wacli wrapper — reads WhatsApp messages as TEXT (no vision tokens).
# Tolerant of flag-name variations across wacli versions: tries --since,
# falls back to --limit + in-code timestamp filter. Always emits JSON.

# Where wacli lives. install.sh symlinks ~/agent-os here.
WACLI="${WACLI:-$HOME/bin/wacli}"
if ! [ -x "$WACLI" ] && command -v wacli >/dev/null 2>&1; then
    WACLI="$(command -v wacli)"
fi

# Test wacli is reachable. Returns 0/1 and logs.
wacli_check() {
    if ! [ -x "$WACLI" ]; then
        aos_log "wacli: binary not found ($WACLI)"
        return 1
    fi
    "$WACLI" --version >/dev/null 2>&1 || return 1
    return 0
}

# Fetch messages newer than the given ISO-8601 timestamp.
# Echoes raw JSON to stdout on success, empty on failure.
# Behavior:
#   - first try: wacli messages list --since "$since" --json --limit 200
#   - fallback: wacli messages list --json --limit 200, filter in jq by timestamp
wacli_messages_since() {
    local since="$1"
    local limit="${2:-200}"
    [ -z "$since" ] && since="$(date -u -v-1H +%Y-%m-%dT%H:%M:%SZ 2>/dev/null \
                              || date -u -d '1 hour ago' +%Y-%m-%dT%H:%M:%SZ)"
    local out
    out="$("$WACLI" messages list --since "$since" --json --limit "$limit" 2>/dev/null)"
    if [ -n "$out" ] && [ "$(printf '%s' "$out" | head -c 1)" = "[" ]; then
        printf '%s' "$out"
        return 0
    fi
    # Fallback path — wacli versions where --since isn't a flag yet.
    out="$("$WACLI" messages list --json --limit "$limit" 2>/dev/null)"
    [ -z "$out" ] && return 1
    # Filter by timestamp client-side. Tolerant of field name variants.
    printf '%s' "$out" | python3 -c "
import sys, json
since = '$since'
try: data = json.load(sys.stdin)
except: sys.exit(0)
if not isinstance(data, list): sys.exit(0)
def ts_of(m):
    for k in ('timestamp','time','sentAt','at','ts','date','createdAt'):
        if k in m and m[k]: return str(m[k])
    return ''
out = [m for m in data if ts_of(m) >= since]
print(json.dumps(out))
"
}

# Count messages in a JSON array, no jq dependency.
wacli_count() {
    python3 -c "
import sys, json
try: data = json.load(sys.stdin)
except: data = []
print(len(data) if isinstance(data, list) else 0)
" 2>/dev/null
}

# Compress a JSON message list into a small text summary the agent can
# read with minimal token cost. One line per chat, last sender + preview.
wacli_compact() {
    python3 -c "
import sys, json, re
try: data = json.load(sys.stdin)
except: sys.exit(0)
if not isinstance(data, list) or not data: sys.exit(0)
# Group by chat id / name. Field names vary across wacli versions — try several.
def field(m, *keys, default=''):
    for k in keys:
        if k in m and m[k]: return m[k]
    return default
groups = {}
for m in data:
    chat = field(m, 'chatName','chat','chatId','jid','remoteJid','peer')
    if not chat: chat = field(m, 'from','sender','name','phone', default='?')
    sender = field(m, 'sender','from','pushName','author','name')
    body = field(m, 'body','text','content','message') or ''
    if isinstance(body, dict): body = json.dumps(body, ensure_ascii=False)[:80]
    body = re.sub(r'\s+', ' ', str(body)).strip()[:140]
    ts = field(m, 'timestamp','time','sentAt','at','ts','date','createdAt')
    groups.setdefault(chat, []).append({'sender': sender, 'body': body, 'ts': ts})
lines = []
for chat, msgs in groups.items():
    last = msgs[-1]
    n = len(msgs)
    line = f'{chat}'
    if last.get('sender') and last['sender'] != chat: line += f' ({last[\"sender\"]})'
    if n > 1: line += f' [{n} msg]'
    line += f': {last[\"body\"]}' if last.get('body') else ''
    lines.append(line)
print('\n'.join(lines[:40]))
" 2>/dev/null
}
