// api/wizard/video-radar.js
// Weekly LISTING QUALITY radar (cron: Monday 07:00 UTC ≈ 09:00 Rome).
//
// Started as a video-coverage nudge; now grades every active listing on the
// full checklist that makes a BOOM page convert — video tour, gallery depth,
// description, availability date, deposit terms, canone concordato — and
// messages the admin chat with each listing's score and the exact bot
// command to fix the biggest gap. Silent when the whole catalog is 10/10:
// that silence IS the goal ("every BOOM home is complete").
//
// Auth like the other wizard/PFS crons (see api/pfs/_guard.js).

import { fsList } from '../homie/_lib.js';
import { tgNotify } from '../pfs/_health.js';
import { requireCronOrAdmin } from '../pfs/_guard.js';

// score: 10 points total; (points, missing-label, fix-command builder)
export function gradeListing(l) {
  const photos = [l.image, ...(Array.isArray(l.images) ? l.images : [])].filter(Boolean);
  const checks = [
    { pts: 3, ok: !!(l.videoUrl || l.youtubeUrl), miss: 'video tour', cmd: id => `/video ${id} link-youtube` },
    { pts: 2, ok: new Set(photos).size >= 8, miss: 'foto (min 8)', cmd: id => `manda altre foto e scrivi: aggiungi foto a ${l.name || id}` },
    { pts: 2, ok: String(l.description || '').length >= 200, miss: 'descrizione ricca', cmd: id => `/modifica ${id} descrizione …` },
    { pts: 1, ok: !!l.availableDate, miss: 'data disponibilità', cmd: id => `/modifica ${id} disponibile 2026-09-01` },
    { pts: 1, ok: Number(l.depositMonths) > 0, miss: 'deposito in mesi', cmd: id => `/deposito ${id} 2` },
    { pts: 1, ok: l.concordato === true || l.concordato === false, miss: 'canone concordato sì/no', cmd: id => `/modifica ${id} concordato …` },
  ];
  const score = checks.reduce((s, c) => s + (c.ok ? c.pts : 0), 0);
  const gaps = checks.filter(c => !c.ok);
  return { score, gaps };
}

export default async function handler(req, res) {
  const actor = await requireCronOrAdmin(req, res);
  if (!actor) return;

  try {
    const listings = await fsList('listings', {
      filter: { field: 'status', op: 'EQUAL', value: 'available' },
      limit: 200,
    });

    const graded = listings
      .map(l => ({ l, ...gradeListing(l) }))
      .sort((a, b) => a.score - b.score);
    const incomplete = graded.filter(g => g.score < 10);

    if (incomplete.length) {
      const rows = incomplete.slice(0, 12).map(g => {
        const top = g.gaps[0];
        return `• <b>${g.l.name || g.l.id}</b> — <b>${g.score}/10</b>\n` +
          `  manca: ${g.gaps.map(x => x.miss).join(', ')}\n` +
          `  <code>${top.cmd(g.l.id)}</code>`;
      }).join('\n');
      const more = incomplete.length > 12 ? `\n…e altri ${incomplete.length - 12}.` : '';
      const perfect = graded.length - incomplete.length;
      await tgNotify(
        `📋 <b>Pagella del catalogo</b> — ${perfect}/${graded.length} annunci completi (10/10)\n\n` +
        rows + more +
        `\n\nOgni riga ha il comando per colmare il buco più grosso. Catalogo 10/10 = "ogni casa BOOM è completa" diventa un claim vero.`
      );
    }

    return res.status(200).json({
      ok: true,
      active: listings.length,
      perfect: graded.length - incomplete.length,
      incomplete: incomplete.slice(0, 30).map(g => ({ id: g.l.id, name: g.l.name || null, score: g.score, missing: g.gaps.map(x => x.miss) })),
    });
  } catch (err) {
    console.error('[wizard/video-radar]', err);
    return res.status(500).json({ ok: false, error: err.message || 'internal' });
  }
}
