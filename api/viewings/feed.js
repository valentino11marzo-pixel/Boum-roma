// api/viewings/feed.js — the live calendar feed.
//
// Subscribe ONCE (Google Calendar → "From URL", Apple Calendar → "New
// Calendar Subscription") and every BOOM viewing is in your calendar forever:
// new ones appear, rescheduled ones move, cancelled ones vanish. No OAuth, no
// per-event action, works on every calendar client — and it keeps working if
// an invite email is ever missed.
//
// GET /api/viewings/feed?key=<FEED KEY>  → text/calendar
// The key is derived from the server secret (see feedKey) so the URL is
// unguessable and revocable by rotating the secret; the feed contains client
// names and phone numbers, so it is never public.

import crypto from 'node:crypto';
import { fsList, fsGet } from '../homie/_lib.js';
import { buildFeed } from './_ical.js';
import { startOf } from './_lib.js';

export function feedKey() {
  const salt = process.env.HOMIE_SECRET || process.env.CRON_SECRET || 'boom';
  return crypto.createHash('sha256').update('viewings-feed:' + salt).digest('hex').slice(0, 32);
}

const PAST_WINDOW_MS = 30 * 86400000;   // keep a month of history visible
const AHEAD_MS = 120 * 86400000;

export default async function handler(req, res) {
  const key = String((req.query && (req.query.key || req.query.k)) || '');
  if (!key || key !== feedKey()) return res.status(401).json({ ok: false, error: 'invalid_key' });

  try {
    const rows = [];
    for (const status of ['confirmed', 'completed']) {
      try {
        rows.push(...await fsList('viewingRequests', {
          filter: { field: 'status', op: 'EQUAL', value: status }, limit: 200,
        }));
      } catch { /* one bad status must not empty the calendar */ }
    }

    const now = Date.now();
    const live = rows.filter(v => {
      if (v.voided) return false;
      const s = startOf(v);
      if (!s) return false;
      const t = s.getTime();
      return t > now - PAST_WINDOW_MS && t < now + AHEAD_MS;
    });

    // enrich with the listing address (cheap: only the distinct ids in view)
    const ids = [...new Set(live.map(v => v.listingId || v.propertyId).filter(Boolean))];
    const byId = new Map();
    for (const id of ids.slice(0, 40)) {
      const l = await fsGet(`listings/${id}`).catch(() => null) || await fsGet(`properties/${id}`).catch(() => null);
      if (l) byId.set(id, l);
    }
    const enriched = live.map(v => {
      const l = byId.get(v.listingId || v.propertyId);
      return l ? { ...v, listingName: v.listingName || l.name || l.address, listingAddress: l.address || null } : v;
    });

    res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
    res.setHeader('Content-Disposition', 'inline; filename="boom-viewings.ics"');
    res.setHeader('Cache-Control', 'public, max-age=0, s-maxage=300');
    return res.status(200).send(buildFeed(enriched, 'it'));
  } catch (e) {
    console.error('[viewings/feed]', e);
    return res.status(500).json({ ok: false, error: 'internal' });
  }
}
