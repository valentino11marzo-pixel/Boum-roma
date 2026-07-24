#!/usr/bin/env python3
"""
BOOM Listing Wizard — heartbeat + self-update wrapper.

launchd runs THIS file instead of boom_listing_wizard.py (see
com.boom.listing-wizard.plist). On every start it:
  1. SELF-UPDATES: downloads the latest boom_listing_wizard.py (and this
     wrapper, effective next restart) from the public GitHub repo, compile-
     checks it, and swaps it in with a .bak kept. Merge to main → the Mac
     aligns itself on the next restart. Any failure keeps the local copy:
     the bot must always start.
  2. Starts a daemon thread that writes heartbeat/listing-wizard to
     Firestore every minute — the /api/wizard/health cron alerts Telegram
     when it goes stale.
  3. Hands control to the bot's own main().

No .env changes needed. Deploy next to boom_listing_wizard.py on the Mac.
"""

import hashlib
import logging
import os
import subprocess
import sys
import threading
import time
import urllib.request
from datetime import datetime, timezone

HEARTBEAT_EVERY_S = 60
RAW_BASE = 'https://raw.githubusercontent.com/valentino11marzo-pixel/Boum-roma/main/bot/'
HERE = os.path.dirname(os.path.abspath(__file__))

logging.basicConfig(format='%(asctime)s - %(name)s - %(levelname)s - %(message)s', level=logging.INFO)
logger = logging.getLogger('BoomWizardWrapper')


def _self_update():
    """Pull the latest bot files from GitHub. Local copy always wins on any
    doubt (network down, compile error): availability beats freshness."""
    for fname in ('boom_listing_wizard.py', 'wizard_heartbeat.py'):
        try:
            with urllib.request.urlopen(RAW_BASE + fname, timeout=15) as r:
                new = r.read()
            if not new or len(new) < 500:
                continue
            path = os.path.join(HERE, fname)
            old = open(path, 'rb').read() if os.path.exists(path) else b''
            if hashlib.sha1(new).digest() == hashlib.sha1(old).digest():
                continue
            tmp = path + '.new'
            with open(tmp, 'wb') as f:
                f.write(new)
            chk = subprocess.run([sys.executable, '-m', 'py_compile', tmp],
                                 capture_output=True, text=True)
            if chk.returncode != 0:
                logger.warning(f'{fname}: update does not compile, keeping local — {chk.stderr[:200]}')
                os.remove(tmp)
                continue
            if old:
                with open(path + '.bak', 'wb') as f:
                    f.write(old)
            os.replace(tmp, path)
            logger.info(f'{fname}: updated from GitHub ({len(new)} bytes)')
        except Exception as e:
            logger.warning(f'self-update {fname}: {e}')


def _beat_forever(wizard):
    while True:
        try:
            wizard.fs_update('heartbeat', 'listing-wizard', {
                'source': 'listing-wizard',
                'status': 'live',
                'pid': os.getpid(),
                'version': getattr(wizard, 'BOT_VERSION', '?'),
                'lastSeenAt': datetime.now(timezone.utc).isoformat(),
            })
        except Exception as e:
            # Never let a Firestore hiccup take the bot down with it.
            logger.warning(f'heartbeat write failed: {e}')
        time.sleep(HEARTBEAT_EVERY_S)


def main():
    _self_update()
    sys.path.insert(0, HERE)
    import boom_listing_wizard as wizard   # after self-update, on purpose
    threading.Thread(target=_beat_forever, args=(wizard,), daemon=True, name='wizard-heartbeat').start()
    wizard.main()


if __name__ == '__main__':
    main()
