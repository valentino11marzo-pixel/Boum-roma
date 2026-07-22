// api/search/matcher.js
// The saved-search alert engine. Cron (3×/day) — every active doc in
// `savedSearches` is matched against the live `listings` catalog; NEW
// matches (never notified before) are emailed as a short digest with
// direct /listing/:id links.
//
// Anti-spam by design:
//   - First run per search SEEDS silently: everything that already matches
//     is recorded in notifiedIds without an email, so subscribers are only
//     ever told about listings that appeared AFTER they saved the search.
//   - notifiedIds caps at 400 ids (oldest dropped) — a listing is never
//     emailed twice to the same subscriber.
//   - Max 6 listings per email; max 40 emails per run (safety valve).
//
// Auth: Vercel cron (`Authorization: Bearer CRON_SECRET`).
// GET /api/search/matcher?dry=1 → report only, no emails, no writes.

import { fsList, fsPatch } from '../homie/_lib.js';
import { sendEmail } from '../agent/_lib.js';
import { requireCronOrAdmin } from '../pfs/_guard.js';

const SITE = 'https://www.boomrome.com';

const norm = s => String(s || '').toLowerCase().trim();

// Mirrors apartments.html mapReal() for every field the filter touches.
// The portal, the Telegram wizard and the bots write DIFFERENT names for
// the same thing (beds/bedrooms, videoUrl/youtubeUrl, furnished true /
// 'partial' / only a "furnished"/"arredato" word in the features text) —
// matching on the raw doc silently starved subscribers whose filters used
// those fields, while the site itself displayed the homes as matching.
export function normListing(d) {
  const feats = Array.isArray(d.features) ? d.features : (Array.isArray(d.amenities) ? d.amenities : []);
  const blob = (feats.join(' ') + ' ' + (d.description || '') + ' ' + String(d.furnished || '')).toLowerCase();
  return {
    id: d.id,
    name: d.name || d.title || 'Apartment in Rome',
    zone: d.zone || d.neighborhood || d.address || 'Rome',
    price: +d.price || 0,
    beds: d.beds != null ? +d.beds : (d.bedrooms != null ? +d.bedrooms : 0),
    baths: d.bathrooms != null ? +d.bathrooms : (d.baths != null ? +d.baths : 1),
    sqm: +d.sqm || +d.size || 0,
    furnished: d.furnished === true
      || (typeof d.furnished === 'string' && d.furnished.trim() !== ''
          && !['no', 'false', 'unfurnished', '0', 'non arredato'].includes(d.furnished.trim().toLowerCase()))
      || blob.includes('furnish') || blob.includes('arredat'),
    videoUrl: !!(d.videoUrl || d.youtubeUrl),
    features: feats,
    description: d.description || '',
    status: ((d.status || d.availabilityStatus || 'available') + '').toLowerCase(),
  };
}

// Same blocklist as the site's isRentable() (+ 'reserved', the 48h hold).
function isRentable(l) {
  const st = l.status;
  return !(st === 'rented' || st === 'affittato' || st === 'off_market' || st === 'draft' || st === 'hidden' || st === 'reserved');
}

// Mirrors the discovery page's pass() closely enough to keep promises honest.
// Expects a listing already run through normListing().
export function matches(criteria, l) {
  const c = criteria || {};
  // Same 1.15× tolerance the discovery page applies to the budget slider.
  if (c.budgetMax && Number(l.price) > Number(c.budgetMax) * 1.15) return false;
  if (c.beds  && Number(l.beds  || 0) < Number(c.beds))  return false;
  if (c.baths && Number(l.baths || 0) < Number(c.baths)) return false;
  if (c.furnished && !l.furnished) return false;
  if (c.video && !l.videoUrl) return false;
  if (Array.isArray(c.zones) && c.zones.length) {
    const z = norm(l.zone);
    if (!c.zones.some(x => z === norm(x) || z.includes(norm(x)))) return false;
  }
  if (Array.isArray(c.feats) && c.feats.length) {
    const feats = l.features.map(norm);
    if (!c.feats.every(f => feats.some(x => x.includes(norm(f))))) return false;
  }
  if (c.q) {
    const hay = norm(l.name + ' ' + l.zone + ' ' + l.description);
    if (!hay.includes(norm(c.q))) return false;
  }
  return true;
}

const eur = n => '€' + Number(n || 0).toLocaleString('en-US');

function digestHtml(search, hits) {
  const rows = hits.map(l => `
    <tr><td style="padding:12px 0;border-bottom:1px solid #eee">
      <a href="${SITE}/listing/${encodeURIComponent(l.id)}" style="color:#111;text-decoration:none">
        <strong style="font-size:15px">${(l.name || 'Apartment').replace(/</g, '&lt;')}</strong><br>
        <span style="color:#666;font-size:13px">${(l.zone || 'Rome').replace(/</g, '&lt;')}
        · ${l.beds || 'Studio'} bed · ${l.sqm ? l.sqm + ' m² · ' : ''}<strong style="color:#111">${eur(l.price)}/mo</strong>
        ${norm(l.status) === 'waitlist' ? ' · <em>waitlist — rents ahead</em>' : ''}</span><br>
        <span style="color:#B8960C;font-size:13px">View the home →</span>
      </a>
    </td></tr>`).join('');
  const unsub = `${SITE}/api/search/unsub?id=${encodeURIComponent(search.id)}&e=${encodeURIComponent(search.email)}`;
  return `<!doctype html><html><head><meta charset="utf-8"></head>
  <body style="margin:0;background:#f6f6f6;font-family:Helvetica,Arial,sans-serif">
  <div style="max-width:560px;margin:0 auto;padding:28px 18px">
    <div style="background:#fff;border-radius:14px;padding:26px 24px;border:1px solid #e8e8e8">
      <div style="letter-spacing:4px;font-size:12px;color:#B8960C">B O O M &nbsp;R O M E</div>
      <h2 style="font-weight:400;margin:14px 0 4px">New home${hits.length > 1 ? 's' : ''} matching your search</h2>
      <p style="color:#666;font-size:13.5px;margin:0 0 6px">${search.label ? 'Your search “' + String(search.label).replace(/</g, '&lt;') + '”' : 'Your saved search'} just matched ${hits.length} new listing${hits.length > 1 ? 's' : ''} — video-verified, transparent pricing.</p>
      <table style="width:100%;border-collapse:collapse">${rows}</table>
      <p style="margin:18px 0 0"><a href="${SITE}/apartments" style="display:inline-block;background:#D4AF37;color:#1a1407;text-decoration:none;font-weight:600;border-radius:100px;padding:11px 22px;font-size:14px">See everything →</a></p>
      <p style="color:#999;font-size:11.5px;margin:18px 0 0">Rome moves fast — the good ones go in days. Questions? Just reply, a human answers within 2 hours.</p>
    </div>
    <p style="color:#aaa;font-size:11px;text-align:center;margin:14px 0 0">
      You saved this search on boomrome.com · <a href="${unsub}" style="color:#aaa">stop these alerts</a>
    </p>
  </div></body></html>`;
}

export default async function handler(req, res) {
  // ?dry=1 used to SKIP auth entirely — free 600-doc Firestore reads for
  // anyone who found the URL. Dry stays available, but only to the cron
  // secret, the Homie secret or an admin ID token (same guard as pfs/*).
  const actor = await requireCronOrAdmin(req, res);
  if (!actor) return;
  const dry = req.query?.dry === '1';

  const report = { searches: 0, seeded: 0, emailed: 0, matchesFound: 0, errors: [] };
  try {
    const [searches, listings] = await Promise.all([
      fsList('savedSearches', { limit: 300 }),
      fsList('listings', { limit: 300 }),
    ]);
    const catalog = listings.map(normListing).filter(isRentable);
    let emailsSent = 0;

    for (const s of searches) {
      if (norm(s.status) !== 'active' || !s.email) continue;
      report.searches++;
      const criteria = typeof s.criteria === 'string' ? safeJson(s.criteria) : (s.criteria || {});
      const known = new Set(Array.isArray(s.notifiedIds) ? s.notifiedIds : (typeof s.notifiedIds === 'string' ? safeJson(s.notifiedIds) || [] : []));
      const hit = catalog.filter(l => matches(criteria, l));
      const fresh = hit.filter(l => !known.has(l.id));
      if (!fresh.length) continue;

      const allIds = [...known, ...fresh.map(l => l.id)].slice(-400);

      if (!s.lastNotified && !known.size) {
        // First contact: seed silently so we only ever alert on the future.
        report.seeded++;
        if (!dry) await fsPatch(`savedSearches/${s.id}`, { notifiedIds: JSON.stringify(allIds), seededAt: new Date().toISOString() });
        continue;
      }

      report.matchesFound += fresh.length;
      if (emailsSent >= 40) continue; // safety valve
      if (!dry) {
        try {
          await sendEmail({
            to: s.email,
            subject: fresh.length === 1
              ? `New in ${fresh[0].zone || 'Rome'}: ${(fresh[0].name || 'a verified home')} — ${eur(fresh[0].price)}/mo`
              : `${fresh.length} new Rome homes match your search`,
            html: digestHtml(s, fresh.slice(0, 6)),
          });
          emailsSent++;
          report.emailed++;
          await fsPatch(`savedSearches/${s.id}`, {
            notifiedIds: JSON.stringify(allIds),
            lastNotified: new Date().toISOString(),
            notifyCount: Number(s.notifyCount || 0) + 1,
          });
        } catch (e) {
          report.errors.push(`${s.id}: ${e.message}`.slice(0, 120));
        }
      } else {
        report.emailed++; // would have
      }
    }
    // Heartbeat (real runs only — a dry test must not overwrite cron state).
    if (!dry) {
      try {
        const { reportEmployeeHealth } = await import('../employees/_lib.js');
        await reportEmployeeHealth('search-matcher', {
          ok: report.errors.length === 0,
          error: report.errors.length ? report.errors.slice(0, 3).join(' | ') : null,
          stats: { searches: report.searches, seeded: report.seeded, emailed: report.emailed, matchesFound: report.matchesFound },
        });
      } catch (e) { console.error('[matcher] heartbeat failed:', e.message); }
    }

    return res.status(200).json({ ok: true, dry, ...report });
  } catch (e) {
    console.error('[matcher]', e);
    try {
      const { reportEmployeeHealth } = await import('../employees/_lib.js');
      await reportEmployeeHealth('search-matcher', { ok: false, error: e.message });
    } catch (e2) { console.error('[matcher] heartbeat failed:', e2.message); }
    return res.status(500).json({ ok: false, error: e.message, ...report });
  }
}

function safeJson(s) { try { return JSON.parse(s); } catch { return null; } }
