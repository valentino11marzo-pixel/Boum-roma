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

const SITE = 'https://www.boomrome.com';

const norm = s => String(s || '').toLowerCase().trim();

function isRentable(l) {
  const st = norm(l.status || 'available');
  return st === 'available' || st === 'waitlist';
}

// Mirrors the discovery page's pass() closely enough to keep promises honest.
export function matches(criteria, l) {
  const c = criteria || {};
  if (c.budgetMax && Number(l.price) > Number(c.budgetMax)) return false;
  if (c.beds  && Number(l.beds  || 0) < Number(c.beds))  return false;
  if (c.baths && Number(l.bathrooms || l.baths || 0) < Number(c.baths)) return false;
  if (c.furnished && !(l.furnished === true || norm(l.furnished) === 'yes' || norm(l.furnished) === 'furnished')) return false;
  if (c.video && !l.videoUrl) return false;
  if (Array.isArray(c.zones) && c.zones.length) {
    const z = norm(l.zone);
    if (!c.zones.some(x => z === norm(x) || z.includes(norm(x)))) return false;
  }
  if (Array.isArray(c.feats) && c.feats.length) {
    const feats = (Array.isArray(l.features) ? l.features : []).map(norm);
    if (!c.feats.every(f => feats.some(x => x.includes(norm(f))))) return false;
  }
  if (c.q) {
    const hay = norm((l.name || '') + ' ' + (l.zone || '') + ' ' + (l.description || ''));
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
  const isVercelCron = req.headers['authorization'] === `Bearer ${process.env.CRON_SECRET}`;
  const dry = req.query?.dry === '1';
  if (!isVercelCron && !dry) return res.status(401).json({ ok: false, error: 'unauthorized' });

  const report = { searches: 0, seeded: 0, emailed: 0, matchesFound: 0, errors: [] };
  try {
    const [searches, listings] = await Promise.all([
      fsList('savedSearches', { limit: 300 }),
      fsList('listings', { limit: 300 }),
    ]);
    const catalog = listings.filter(isRentable);
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
    return res.status(200).json({ ok: true, dry, ...report });
  } catch (e) {
    console.error('[matcher]', e);
    return res.status(500).json({ ok: false, error: e.message, ...report });
  }
}

function safeJson(s) { try { return JSON.parse(s); } catch { return null; } }
