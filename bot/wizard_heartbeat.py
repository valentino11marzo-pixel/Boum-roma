#!/usr/bin/env python3
"""
BOOM Listing Wizard — heartbeat wrapper.

launchd runs THIS file instead of boom_listing_wizard.py (see
com.boom.listing-wizard.plist). It starts a daemon thread that writes
heartbeat/listing-wizard to Firestore every minute, then hands control to the
bot's own main(). Because the thread lives inside the bot process, the
heartbeat stops the moment the bot dies (crash, missing module, reboot, Mac
offline) — and the /api/wizard/health cron on Vercel alerts Telegram when the
doc goes stale.

No .env changes needed: it reuses the bot's own Firebase admin session.
Deploy next to boom_listing_wizard.py on the Mac mini.
"""

import logging
import os
import threading
import time
from datetime import datetime, timezone

import boom_listing_wizard as wizard

HEARTBEAT_EVERY_S = 60

logger = logging.getLogger('BoomWizardHeartbeat')


def _beat_forever():
    while True:
        try:
            wizard.fs_update('heartbeat', 'listing-wizard', {
                'source': 'listing-wizard',
                'status': 'live',
                'pid': os.getpid(),
                'lastSeenAt': datetime.now(timezone.utc).isoformat(),
            })
        except Exception as e:
            # Never let a Firestore hiccup take the bot down with it.
            logger.warning(f'heartbeat write failed: {e}')
        time.sleep(HEARTBEAT_EVERY_S)


def main():
    threading.Thread(target=_beat_forever, daemon=True, name='wizard-heartbeat').start()
    wizard.main()


if __name__ == '__main__':
    main()
