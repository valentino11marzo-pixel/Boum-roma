# BOOM Listing Wizard — Telegram bot

Telegram bot that publishes apartments to the public `listings` catalog and
manages them entirely from chat: `/rent`, `/reactivate`, `/delete`,
`/listings`, plus post-publish edit commands — `/prezzo ID 1300`,
`/deposito ID 3` (months → also writes the € `deposit` the money section
reads), `/video ID link`, `/modifica ID campo valore` (whitelisted fields:
nome indirizzo zona prezzo mq piano letti bagni arredato disponibile
descrizione video commissione stato). The bot also understands plain
Italian: write "metti il deposito a due mesi per Pigneto" or "aumenta il
prezzo di Levico di 100€" — it builds the edit via `/api/wizard/interpret`
(Claude against the real catalog; local regex fallback if the endpoint is
unavailable) and applies it only after the ✅ Conferma tap. Runs on the
**Mac mini** (`boomserver@Mac-mini-di-BOOM`), polling Telegram. Writes to
Firestore + Storage via the Firebase REST API using the admin account
`valentino@boomrome.com` (same email/password pattern as `api/reminder-cron.js`).

This folder is the **version-controlled mirror** of the live copy at
`/Users/boomserver/boom-listing-wizard/`. The live `.env` (secrets) is **not**
committed.

## Requirements on the Mac mini

- Python 3.13 with `python-telegram-bot`, `requests`, `python-dotenv`
- A `.env` next to the script (loaded via `python-dotenv`):

```
BOOM_TELEGRAM_BOT_TOKEN=...     # from BotFather
BOOM_TELEGRAM_CHAT_ID=...       # admin chat id (only this chat may command)
FIREBASE_API_KEY=...            # public web key
FIREBASE_ADMIN_EMAIL=...        # admin account (must have users/{uid}.role == 'admin')
FIREBASE_ADMIN_PASS=...
FIREBASE_PROJECT_ID=boom-property-dashboards
FIREBASE_BUCKET=boom-property-dashboards.firebasestorage.app
WIZARD_SECRET=...               # shared secret for the BOOM wizard API
                                # (AI descriptions; same value as on Vercel).
                                # Optional — if unset, AI features fall back to
                                # the built-in template; everything else works.
```

> The publish account **must** have a Firestore `users/{uid}` doc with
> `role: 'admin'`, otherwise every write fails with `PERMISSION_DENIED`
> (the security rules gate `listings`/`leads`/etc. on that role).

## Keep it alive (launchd — auto-start + auto-restart)

Without a supervisor the bot does **not** come back after a reboot or crash —
it just goes silently offline. `com.boom.listing-wizard.plist` fixes that
(`KeepAlive` restarts on crash, `RunAtLoad` starts it on login).

Install on the Mac mini (one time):

```bash
# 1) Make sure nothing already auto-starts it (avoid a double instance)
ls ~/Library/LaunchAgents/ 2>/dev/null | grep -i boom
launchctl list | grep -i boom

# 2) Install the agent
mkdir -p ~/Library/LaunchAgents
cp /Users/boomserver/boom-listing-wizard/com.boom.listing-wizard.plist ~/Library/LaunchAgents/
#    (or copy this repo's bot/com.boom.listing-wizard.plist there)

# 3) Verify the Python path in the plist matches this machine
ls -l /Library/Frameworks/Python.framework/Versions/3.13/bin/python3

# 4) Stop the current un-supervised process, then hand control to launchd
pkill -f boom_listing_wizard.py
launchctl load ~/Library/LaunchAgents/com.boom.listing-wizard.plist

# 5) Confirm it's running under launchd (shows a PID)
launchctl list | grep boom
```

Then send the bot `/help` on Telegram to confirm it answers. Logs:
`~/boom-listing-wizard/wizard.log` and `wizard.err.log`.

> For the bot to come back **after a reboot**, the Mac mini must auto-login
> `boomserver` (System Settings → Users & Groups → Automatic login), because a
> LaunchAgent runs inside the user session.

To stop/restart manually:

```bash
launchctl unload ~/Library/LaunchAgents/com.boom.listing-wizard.plist   # stop
launchctl load   ~/Library/LaunchAgents/com.boom.listing-wizard.plist   # start
```

## Heartbeat wrapper (watchdog)

launchd launches `wizard_heartbeat.py`, NOT the bot directly. The wrapper
imports `boom_listing_wizard`, starts a daemon thread that writes
`heartbeat/listing-wizard` to Firestore every 60s, then runs the bot's own
`main()`. Because the thread shares the bot's process, the heartbeat stops
exactly when the bot stops — and `/api/wizard/health` (Vercel cron) alerts
the admin Telegram chat after 5 minutes of silence.

Installing/upgrading the wrapper on the Mac mini:

```bash
# copy wizard_heartbeat.py next to boom_listing_wizard.py, then point launchd
# at it (one-time; new installs just use this repo's plist as-is):
sed -i '' 's|boom_listing_wizard.py|wizard_heartbeat.py|' \
    ~/Library/LaunchAgents/com.boom.listing-wizard.plist
launchctl unload ~/Library/LaunchAgents/com.boom.listing-wizard.plist
launchctl load   ~/Library/LaunchAgents/com.boom.listing-wizard.plist
```

## Updating the bot

When this mirror changes, copy the new `boom_listing_wizard.py` (and/or
`wizard_heartbeat.py`) onto the Mac mini (keeping the local `.env`), then
restart via the unload/load above.

## Deploying an update to the Mac mini

```bash
# from the Mac mini, with the live folder backed up first:
cp /Users/boomserver/boom-listing-wizard/boom_listing_wizard.py \
   /Users/boomserver/boom-listing-wizard/boom_listing_wizard.py.bak
# copy the new boom_listing_wizard.py into /Users/boomserver/boom-listing-wizard/
# then restart:
launchctl unload ~/Library/LaunchAgents/com.boom.listing-wizard.plist 2>/dev/null
pkill -f boom_listing_wizard.py 2>/dev/null
launchctl load   ~/Library/LaunchAgents/com.boom.listing-wizard.plist
# (if launchd isn't installed yet, just: python3 boom_listing_wizard.py &)
```
Rollback = copy `.bak` back and restart.

## Roadmap

- [x] **AI descriptions (IT/EN)** — `/api/wizard/describe` (Claude); the
      "auto-genera" option now writes a bilingual description, falling back to
      the built-in template if the AI/secret is unavailable.
- [x] **Suggested legal rent** — indicative canone concordato range (Accordo
      Territoriale Roma 2023, fascia B) shown at the price step.
- [x] **Fault-tolerant publishing** — photos go through `POST /api/wizard/upload`
      and the listing through `POST /api/wizard/publish`, each falling back to a
      direct Storage/Firestore write, so a rule/role change can't break the
      publish flow again.
- [x] **Health heartbeat + alert** — `wizard_heartbeat.py` (the launchd entry
      point) writes `heartbeat/listing-wizard` every 60s from inside the bot
      process; the `/api/wizard/health` cron on Vercel (every 10 min) sends a
      Telegram alert when the heartbeat is >5 min stale (re-alert every 6h,
      recovery message when it comes back). Missing doc = wrapper not deployed
      yet → the cron stays silent.
