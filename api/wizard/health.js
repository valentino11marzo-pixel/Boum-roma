// api/wizard/health.js
// Watchdog for the Telegram listing wizard bot (runs on the Mac mini).
//
// The bot — via bot/wizard_heartbeat.py — writes heartbeat/listing-wizard
// every 60s. This cron (vercel.json, every 10 min) checks the doc's age:
//   - stale > 5 min  → Telegram alert (re-alert every 6h while still down)
//   - back after an alert → one recovery message
//   - doc missing → silent, ma NON per sempre (vedi sotto)
//   - wrapper saltato (`launcher` = boom_listing_wizard.py) → UN messaggio
//
// LA LEZIONE DEL 7 AGOSTO 2026. Per 12 giorni launchd ha lanciato il bot
// DIRETTAMENTE invece del wrapper: l'auto-aggiornamento non è mai partito, il
// codice sul Mac è rimasto indietro di due settimane, e questo guardiano ha
// taciuto — perché "documento assente" era codificato come stato neutro
// ("wrapper non ancora deployato"). Il guasto peggiore e la macchina appena
// installata producevano lo stesso identico silenzio verde.
// Due correzioni, entrambe nello spirito di api/pfs/_health.js: si parla
// quando c'è una DECISIONE da prendere, una volta sola per condizione.
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
// Grazia sul documento ASSENTE: copre l'installazione nuova e il Mac che non
// ha ancora preso il codice che scrive il battito di riserva. Dopo, però, il
// silenzio finisce — è stato il silenzio a nascondere 12 giorni di guasto.
export const MISSING_GRACE_MS = 24 * 3600 * 1000;

/**
 * Cosa dire, e soprattutto quando TACERE. Pura ed esportata: decide se
 * consumare l'attenzione dell'operatore, quindi si testa.
 *
 * @param hb   il doc heartbeat/listing-wizard (o null se non esiste)
 * @param now  epoch ms
 * @returns { state, say, ageMs, bypassed }
 *          say ∈ null | 'down' | 'recovery' | 'bypass' | 'missing'
 */
export function wizardVerdict(hb, now = Date.now()) {
  const watch = (hb && hb.watch) || {};

  // ── il battito non c'è affatto ──────────────────────────────────────────
  if (!hb || !hb.lastSeenAt) {
    const since = watch.missingSince ? new Date(watch.missingSince).getTime() : 0;
    if (!since) return { state: 'missing', say: null, first: true, ageMs: 0, bypassed: false };
    const overdue = now - since > MISSING_GRACE_MS;
    return {
      state: 'missing',
      say: (overdue && !watch.missingNotified) ? 'missing' : null,
      ageMs: now - since,
      bypassed: false,
    };
  }

  const lastSeen = new Date(hb.lastSeenAt).getTime();
  const ageMs = now - (Number.isFinite(lastSeen) ? lastSeen : 0);
  const down = ageMs > STALE_MS;
  // DERIVATO dal Mac (sys.argv[0]): se è il bot, launchd salta il wrapper e
  // l'auto-aggiornamento è spento — il guasto rimasto invisibile 12 giorni.
  const bypassed = String(hb.launcher || '').startsWith('boom_listing_wizard');

  if (down) {
    const lastAlertAt = watch.lastAlertAt ? new Date(watch.lastAlertAt).getTime() : 0;
    const due = now - lastAlertAt > REALERT_MS;
    return { state: 'down', say: due ? 'down' : null, ageMs, bypassed };
  }
  if (watch.down) return { state: 'live', say: 'recovery', ageMs, bypassed };
  // un bot vivo ma senza auto-aggiornamento: azionabile, quindi si dice —
  // UNA volta, perché ripeterlo ogni 6h lo farebbe diventare il radar che grida
  if (bypassed && !watch.bypassNotified) return { state: 'live', say: 'bypass', ageMs, bypassed };
  return { state: 'live', say: null, ageMs, bypassed };
}

export default async function handler(req, res) {
  const actor = await requireCronOrAdmin(req, res);
  if (!actor) return;

  try {
    const hb = await fsGet('heartbeat/listing-wizard');
    const now = Date.now();
    const watch = (hb && hb.watch) || {};
    const v = wizardVerdict(hb, now);

    // ── il battito non c'è ─────────────────────────────────────────────────
    if (v.state === 'missing') {
      // si annota QUANDO ha iniziato a mancare, così la grazia è misurata e
      // non eterna: è il silenzio senza scadenza che ha coperto 12 giorni
      if (v.first) {
        await fsPatch('heartbeat/listing-wizard', { watch: { ...watch, missingSince: new Date() } });
      }
      if (v.say === 'missing') {
        await tgNotify(
          '🔴 <b>Listing Wizard: nessun segnale</b>\n' +
          'Il bot non scrive un battito da oltre 24 ore. O è spento, o gira una ' +
          'versione troppo vecchia per segnalarsi.\n\n' +
          'Sul Mac mini: <code>launchctl list | grep listing-wizard</code>\n\n' +
          '<i>Te lo dico una volta sola: quando torna, te lo dico.</i>'
        );
        await fsPatch('heartbeat/listing-wizard', { watch: { ...watch, missingNotified: true } });
      }
      return res.status(200).json({ ok: true, status: 'missing', notified: v.say === 'missing' });
    }

    // ── offline / rientro / wrapper saltato ────────────────────────────────
    if (v.say === 'down') {
      const mins = Math.round(v.ageMs / 60000);
      await tgNotify(
        '🔴 <b>Listing Wizard offline</b>\n' +
        `Nessun heartbeat dal bot da ${mins} minuti.\n` +
        'Sul Mac mini: <code>launchctl list | grep listing-wizard</code> poi ' +
        '<code>tail -30 ~/boom-listing-wizard/wizard.err.log</code>'
      );
      // Lo stato si registra SEMPRE, anche se Telegram non ha risposto. Prima
      // stava dentro `if (sent)`: senza TELEGRAM_BOT_TOKEN, o durante un
      // disservizio di Telegram, il guardiano non ricordava nulla e non
      // passava mai a "down". Un guardiano che dipende dal canale con cui
      // avvisa tace proprio quando il canale è il problema.
      await fsPatch('heartbeat/listing-wizard', {
        watch: {
          ...watch, down: true, lastAlertAt: new Date(),
          downSince: (watch.down && watch.downSince) ? watch.downSince : new Date(),
        },
      });
    } else if (v.say === 'recovery') {
      await tgNotify('🟢 Listing Wizard di nuovo online.');
      await fsPatch('heartbeat/listing-wizard', {
        watch: { ...watch, down: false, downSince: null, missingNotified: false, missingSince: null },
      });
    } else if (v.say === 'bypass') {
      // Azionabile e risolvibile in un minuto → si dice. UNA volta: ripeterlo
      // ogni 6h lo trasformerebbe nel radar che gridava 96 volte.
      await tgNotify(
        '⚠️ <b>Wizard: auto-aggiornamento spento</b>\n' +
        `launchd sta lanciando <code>${String(hb.launcher || '?').slice(0, 40)}</code> invece di ` +
        '<code>wizard_heartbeat.py</code>: il bot funziona ma <b>non si aggiorna più</b>.\n\n' +
        'Sul Mac mini, punta launchd al wrapper e riavvia (bootout → 8s → bootstrap).\n\n' +
        '<i>Te lo dico una volta sola.</i>'
      );
      await fsPatch('heartbeat/listing-wizard', { watch: { ...watch, bypassNotified: true } });
    } else if (!v.bypassed && watch.bypassNotified) {
      await fsPatch('heartbeat/listing-wizard', { watch: { ...watch, bypassNotified: false } });
    }

    return res.status(200).json({
      ok: true,
      status: v.state,
      ageSeconds: Math.round(v.ageMs / 1000),
      // segnali DERIVATI dal Mac — impossibili da dimenticare di aggiornare,
      // al contrario di BOT_VERSION (rimasta a '3.0' mentre il file cambiava)
      build: hb.build || null,
      launcher: hb.launcher || null,
      updateResult: hb.updateResult || null,
      selfUpdating: !v.bypassed,
      version: hb.version || null,
    });
  } catch (err) {
    console.error('[wizard/health]', err);
    return res.status(500).json({ ok: false, error: err.message || 'internal' });
  }
}
