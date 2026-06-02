# Homie Bridge

The connection between **Homie** (the WhatsApp agent on the Mac) and the **BOOM Roma portal**.

Homie already watches WhatsApp and has a CLI. These files give it (1) a clear operating policy and (2) a simple command to update the portal — conservative by design.

## Files

- **`HOMIE.md`** — Homie's operating manual. Load it as Homie's instructions / system context. This is where "quality not quantity" and the Tier-1 (auto) vs Tier-2 (propose) rule live.
- **`boom`** — the CLI Homie calls to talk to the portal (`boom lead-create`, `boom action`, `boom heartbeat`, …). Thin wrapper over `https://boomrome.com/api/agent/*`.

## Setup on the Mac (once)

```bash
# 1. Put these files somewhere Homie can reach, e.g. ~/homie-bridge/
# 2. Set the shared secret (the SAME value set in Vercel as HOMIE_SECRET)
export HOMIE_SECRET="…"            # add to ~/.zshrc to persist
# (optional) export BOOM_BASE_URL="https://boomrome.com"   # default

# 3. Make the CLI executable
chmod +x boom

# 4. Smoke test — should print the portal state
./boom snapshot
```

Requires Node 18+ (for global `fetch`). Check with `node -v`.

## Keep the cockpit alive

Run a heartbeat on a timer so the cockpit's status dot stays green:

```bash
# simple loop (or use launchd / cron / Homie's own scheduler)
while true; do ./boom heartbeat --status live --tool watching-whatsapp; sleep 30; done
```

## Wire it into Homie

1. Give Homie **`HOMIE.md`** as its operating instructions.
2. Tell Homie it can run **`./boom <command>`** to act on the portal (the command help is in `HOMIE.md` and `./boom` with no args).
3. That's it. Homie reads WhatsApp → decides per the policy → runs `boom` → the portal updates and Valentino sees it in the cockpit / Telegram.

## The two lanes (the whole policy in one line)

- **Tier 1 (Homie acts):** `lead-create`, `lead-update`, `note`, `radar`, `heartbeat`.
- **Tier 2 (Homie proposes, human approves):** `action --kind reply|schedule_viewing|…`, contracts, signatures, any outbound message.

## Telegram (optional, recommended)

To get notified and approve Tier-2 actions from your phone, point Homie's Telegram side at:
- notify you when `boom action` creates a pending item;
- on `/approva <id>`, call the portal executor:
  ```bash
  curl -s -X POST "$BOOM_BASE_URL/api/agent/execute" \
    -H "Content-Type: application/json" -H "X-Homie-Secret: $HOMIE_SECRET" \
    -d '{"id":"<actionId>"}'
  ```

## Troubleshooting

- `HOMIE_SECRET not set` → export it (must match Vercel exactly).
- `… → 401 invalid_secret` → the secret doesn't match the one in Vercel.
- `… → 403 Host not in allowlist` → a Vercel Firewall rule is blocking the request; allow the Mac's traffic in Vercel → Firewall (this does not affect browser use).
- `ai-reply` returns an error → the Claude model isn't available on the key; set `ANTHROPIC_MODEL=claude-haiku-4-5` in Vercel.
