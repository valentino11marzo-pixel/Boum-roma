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


BOT_FILES = ('boom_listing_wizard.py', 'wizard_heartbeat.py')
UPDATE_CHECK_EVERY_S = 3600          # ricontrollo orario mentre il bot vive


def source_build():
    """L'IMPRONTA DERIVATA di ciò che gira: sha1 dei byte veri sul disco.

    BOT_VERSION è una costante scritta a mano, ed è rimasta a '3.0' mentre il
    file cambiava cinque volte — quindi come segnale di obsolescenza era
    inservibile proprio quando serviva. Un hash non si può dimenticare di
    aggiornare: cambia da solo a ogni modifica.
    """
    h = hashlib.sha1()
    for fname in BOT_FILES:
        try:
            with open(os.path.join(HERE, fname), 'rb') as f:
                h.update(f.read())
        except Exception:
            h.update(b'?')
    return h.hexdigest()[:12]


def _self_update():
    """Pull the latest bot files from GitHub. Local copy always wins on any
    doubt (network down, compile error): availability beats freshness.
    @returns esito leggibile: 'applied' | 'same' | 'net-failed' | …
    Ogni ramo LOGGA: prima lo skip silenzioso su download corto non lasciava
    traccia, quindi "non ha aggiornato" e "non ha potuto" erano identici."""
    outcome = 'same'
    for fname in BOT_FILES:
        try:
            with urllib.request.urlopen(RAW_BASE + fname, timeout=15) as r:
                new = r.read()
            if not new or len(new) < 500:
                logger.warning(f'{fname}: download troppo corto ({len(new or b"")}B), ignorato')
                outcome = 'short-download'
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
                outcome = 'compile-failed'
                continue
            if old:
                with open(path + '.bak', 'wb') as f:
                    f.write(old)
            os.replace(tmp, path)
            logger.info(f'{fname}: updated from GitHub ({len(new)} bytes)')
            outcome = 'applied'
        except Exception as e:
            logger.warning(f'self-update {fname}: {e}')
            outcome = 'net-failed'
    return outcome


def _beat_forever(wizard, build, update_outcome):
    """Battito + ricontrollo periodico dell'aggiornamento.

    IL DIFETTO CHE CHIUDE: _self_update() girava SOLO all'avvio, poi
    run_polling() blocca per sempre e KeepAlive riavvia solo se il bot muore.
    Cioè **un bot sano non si aggiornava mai**: la freschezza del codice
    dipendeva dai crash. Qui si ricontrolla ogni ora e, se è arrivato
    qualcosa, si esce con os._exit(0) — launchd (KeepAlive) rialza il
    processo dopo 15s e il nuovo codice parte davvero.
    """
    last_check = time.time()
    while True:
        try:
            wizard.fs_update('heartbeat', 'listing-wizard', {
                'source': 'listing-wizard',
                'status': 'live',
                'pid': os.getpid(),
                'version': getattr(wizard, 'BOT_VERSION', '?'),   # etichetta umana
                'build': build,                # impronta DERIVATA: non si dimentica
                # chi ha lanciato il processo. Se qui compare
                # "boom_listing_wizard.py" significa, letteralmente, che
                # launchd salta il wrapper e l'auto-aggiornamento è spento —
                # il guasto rimasto invisibile per 12 giorni.
                'launcher': os.path.basename(sys.argv[0] or '?'),
                'updateResult': update_outcome,
                'lastSeenAt': datetime.now(timezone.utc).isoformat(),
            })
        except Exception as e:
            # Never let a Firestore hiccup take the bot down with it.
            logger.warning(f'heartbeat write failed: {e}')

        if time.time() - last_check >= UPDATE_CHECK_EVERY_S:
            last_check = time.time()
            try:
                if _self_update() == 'applied':
                    logger.info('nuovo codice applicato — esco, launchd mi rialza')
                    os._exit(0)
            except Exception as e:
                logger.warning(f'ricontrollo aggiornamento: {e}')

        time.sleep(HEARTBEAT_EVERY_S)


def main():
    outcome = _self_update()
    sys.path.insert(0, HERE)
    import boom_listing_wizard as wizard   # after self-update, on purpose
    build = source_build()
    logger.info(f'build {build} · launcher {os.path.basename(sys.argv[0] or "?")} · update {outcome}')
    threading.Thread(target=_beat_forever, args=(wizard, build, outcome),
                     daemon=True, name='wizard-heartbeat').start()
    wizard.main()


if __name__ == '__main__':
    main()
