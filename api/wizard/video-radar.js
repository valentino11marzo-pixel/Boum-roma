// api/wizard/video-radar.js
// Weekly video-coverage radar (cron: Monday 07:00 UTC ≈ 09:00 Rome).
//
// The video tour is a core differentiator ("✓ Video-verified" badge, inline
// cinema on the listing page, VideoObject SEO) — but only for listings that
// actually carry one. This cron lists every AVAILABLE listing without a
// videoUrl and nudges the admin chat on Telegram, with the exact bot command
// to fix each one (/video <id> <link>). Full coverage = "every BOOM home has
// a video tour" becomes a true marketing claim.
//
// Silent when coverage is 100% — no noise, alerts stay meaningful.
// Auth like the other wizard/PFS crons (see api/pfs/_guard.js).

import { fsList } from '../homie/_lib.js';
import { tgNotify } from '../pfs/_health.js';
import { requireCronOrAdmin } from '../pfs/_guard.js';

export default async function handler(req, res) {
  const actor = await requireCronOrAdmin(req, res);
  if (!actor) return;

  try {
    const listings = await fsList('listings', {
      filter: { field: 'status', op: 'EQUAL', value: 'available' },
      limit: 200,
    });
    const noVideo = listings.filter(l => !(l.videoUrl || l.youtubeUrl));

    if (noVideo.length) {
      const rows = noVideo.slice(0, 15).map(l =>
        `• <b>${l.name || l.id}</b>${l.zone ? ' — ' + l.zone : ''}\n` +
        `  <code>/video ${l.id} link-youtube</code>`
      ).join('\n');
      const more = noVideo.length > 15 ? `\n…e altri ${noVideo.length - 15}.` : '';
      await tgNotify(
        `🎥 <b>Radar video</b> — ${noVideo.length}/${listings.length} case attive senza tour:\n\n` +
        rows + more +
        `\n\nGira il video (orizzontale!) e incollalo col comando qui sopra.`
      );
    }

    return res.status(200).json({
      ok: true,
      active: listings.length,
      missingVideo: noVideo.length,
      covered: listings.length - noVideo.length,
    });
  } catch (err) {
    console.error('[wizard/video-radar]', err);
    return res.status(500).json({ ok: false, error: err.message || 'internal' });
  }
}
