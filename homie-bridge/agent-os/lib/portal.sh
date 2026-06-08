# portal wrapper — boom CLI + hash/diff helpers to detect server-side
# changes (new lead, overdue, signed contract, etc.) without LLM cost.

BOOM_BIN="${BOOM_BIN:-$HOME/homie-bridge/boom}"

portal_check() {
    if ! [ -x "$BOOM_BIN" ]; then
        aos_log "boom: binary not found ($BOOM_BIN)"
        return 1
    fi
    return 0
}

# Run a boom command, capturing JSON. Echoes output, exits 1 on error.
portal_call() {
    "$BOOM_BIN" "$@" 2>/dev/null
}

# Fingerprint of the portal's risk surface. Stable across runs unless
# something materially changed. We hash JUST the (sev,cat,title,days)
# tuple per item — ignoring timestamps and ids — so the same overdue
# from yesterday doesn't trigger a wake.
portal_risk_fingerprint() {
    portal_call risk | python3 -c "
import sys, json, hashlib
try: data = json.load(sys.stdin)
except: print(''); sys.exit(0)
items = data.get('items') if isinstance(data, dict) else []
keys = sorted(
    f\"{i.get('sev','?')}|{i.get('cat','?')}|{i.get('title','?')}|{i.get('days','?')}\"
    for i in items
)
h = hashlib.sha256('\n'.join(keys).encode()).hexdigest()
print(h[:16])
" 2>/dev/null
}

# Compute what's NEW in risk compared to the previous snapshot file.
# Outputs a compact human-readable delta the agent can read cheaply.
portal_risk_delta() {
    local prev_file="$1"
    local cur
    cur="$(portal_call risk)"
    [ -z "$cur" ] && return 1
    printf '%s' "$cur" > "$prev_file.new"
    if ! [ -f "$prev_file" ]; then
        mv "$prev_file.new" "$prev_file"
        return 1  # first run, no delta
    fi
    python3 -c "
import sys, json
prev = json.load(open('$prev_file')).get('items', [])
cur  = json.load(open('$prev_file.new')).get('items', [])
def key(i): return (i.get('cat'), i.get('title'), i.get('days'), i.get('ref'))
prev_keys = {key(i) for i in prev}
new = [i for i in cur if key(i) not in prev_keys]
gone = [i for i in prev if key(i) not in {key(c) for c in cur}]
if not new and not gone:
    print('')
    sys.exit(0)
lines = []
for i in new[:10]:
    lines.append(f'NEW {i.get(\"sev\",\"?\").upper()}: {i.get(\"cat\",\"\")} — {i.get(\"title\",\"\")} ({i.get(\"detail\",\"\")})')
for i in gone[:10]:
    lines.append(f'CLEARED: {i.get(\"cat\",\"\")} — {i.get(\"title\",\"\")}')
print('\n'.join(lines))
" 2>/dev/null
    mv "$prev_file.new" "$prev_file"
}

# Snapshot fingerprint — lead count + overdue count. Cheap diff for
# detecting new leads from the public form (which Homie can't see in
# WhatsApp).
portal_snapshot_fingerprint() {
    portal_call snapshot | python3 -c "
import sys, json
try: data = json.load(sys.stdin)
except: print(''); sys.exit(0)
leads = data.get('leads', {})
fp = f\"{leads.get('total30d')}-{leads.get('newToday')}-{leads.get('pendingNew')}-{data.get('contracts',{}).get('unsigned')}-{data.get('payments',{}).get('overdue')}-{data.get('agenda',{}).get('todayViewings')}-{data.get('actionQueue',{}).get('pending')}\"
print(fp)
" 2>/dev/null
}

# Human-readable one-liner summary of the current portal state.
portal_one_liner() {
    portal_call snapshot | python3 -c "
import sys, json
try: data = json.load(sys.stdin)
except: sys.exit(0)
l = data.get('leads',{}); c = data.get('contracts',{}); p = data.get('payments',{})
print(f\"leads:{l.get('pendingNew',0)}/{l.get('total30d',0)} unsigned:{c.get('unsigned',0)} expiring30:{c.get('expiring30',0)} overdue:{p.get('overdue',0)}\")
" 2>/dev/null
}
