// api/wizard/health.js
// Watchdog for the Telegram listing wizard bot (runs on the Mac mini).
//
// The bot — via bot/wizard_heartbeat.py — writes heartbeat/listing-wizard
// every 60s. This cron (vercel.json, every 10 min) checks the doc's age:
//   - stale > 5 min  → Telegram alert (re-alert every 6h while still down)
//   - back after an alert → one recovery message
//   - doc missing (heartbeat wrapper not deployed yet) → no-op, never alarms
//
// Alert state lives in the same doc under `watch{}` — a field the bot never
// touches (its PATCH updateMask only covers its own fields), so the two
// writers can't clobber each other.
//
// Auth: Vercel cron Bearer CRON_SECRET, X-Homie-Secret, or an admin Firebase
// ID token (same guard as the PFS radar endpoints).

import { fsGet, fsPatch } from '../homie/_lib.js';
import { tgNotify } from '../pfs/_health.js';
import { requireCronOrAdmin } from '../pfs/_guard.js';

const STALE_MS = 5 * 60 * 1000;
const REALERT_MS = 6 * 3600 * 1000;

export default async function handler(req, res) {
  const actor = await requireCronOrAdmin(req, res);
  if (!actor) return;

  try {
    const hb = await fsGet('heartbeat/listing-wizard');

    if (!hb || !hb.lastSeenAt) {
      return res.status(200).json({ ok: true, status: 'no-heartbeat-yet' });
    }

    const now = Date.now();
    const lastSeen = new Date(hb.lastSeenAt).getTime();
    const ageMs = now - (Number.isFinite(lastSeen) ? lastSeen : 0);
    const down = ageMs > STALE_MS;
    const watch = hb.watch || {};

    if (down) {
      const lastAlertAt = watch.lastAlertAt ? new Date(watch.lastAlertAt).getTime() : 0;
      if (now - lastAlertAt > REALERT_MS) {
        const mins = Math.round(ageMs / 60000);
        const sent = await tgNotify(
          '🔴 <b>Listing Wizard offline</b>\n' +
          `Nessun heartbeat dal bot da ${mins} minuti.\n` +
          'Sul Mac mini: <code>launchctl list | grep listing-wizard</code> poi ' +
          '<code>tail -30 ~/boom-listing-wizard/wizard.err.log</code>'
        );
        if (sent) {
          await fsPatch('heartbeat/listing-wizard', {
            watch: {
              down: true,
              lastAlertAt: new Date(),
              downSince: (watch.down && watch.downSince) ? watch.downSince : new Date(),
            },
          });
        }
      }
    } else if (watch.down) {
      await tgNotify('🟢 Listing Wizard di nuovo online.');
      await fsPatch('heartbeat/listing-wizard', {
        watch: { down: false, lastAlertAt: watch.lastAlertAt || null, downSince: null },
      });
    }

    return res.status(200).json({
      ok: true,
      status: down ? 'down' : 'live',
      ageSeconds: Math.round(ageMs / 1000),
    });
  } catch (err) {
    console.error('[wizard/health]', err);
    return res.status(500).json({ ok: false, error: err.message || 'internal' });
  }
}
