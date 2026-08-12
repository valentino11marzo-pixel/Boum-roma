// api/viewings/ics.js — the calendar file for Apple Calendar / Outlook.
//
// Public by design (the id is an unguessable Firestore id and the file
// contains only what the client already received by email), so the button in
// the confirmation email works on any device with no login. Includes a 3h
// alarm, so even a client who ignores our emails gets their own reminder.
//
// GET /api/viewings/ics?id=<viewingId> → text/calendar

import { fsGet } from '../homie/_lib.js';
import { buildIcs, startOf } from './_lib.js';

export default async function handler(req, res) {
  const id = String((req.query && req.query.id) || '').trim();
  if (!id) return res.status(400).json({ ok: false, error: 'id_required' });

  try {
    const v = await fsGet(`viewingRequests/${id}`);
    if (!v) return res.status(404).json({ ok: false, error: 'not_found' });
    const full = { ...v, id };
    if (!startOf(full)) return res.status(409).json({ ok: false, error: 'not_scheduled_yet' });

    // enrich with the listing address so the event has a real location
    const lid = v.listingId || v.propertyId;
    if (lid) {
      const l = await fsGet(`listings/${lid}`).catch(() => null) || await fsGet(`properties/${lid}`).catch(() => null);
      if (l) {
        full.listingName = full.listingName || l.name || l.address || null;
        full.listingAddress = l.address || full.listingAddress || null;
      }
    }

    const ics = buildIcs(full, String(v.language || '').toLowerCase() === 'it' ? 'it' : 'en');
    if (!ics) return res.status(409).json({ ok: false, error: 'not_scheduled_yet' });

    res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="boom-viewing-${id.slice(0, 8)}.ics"`);
    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).send(ics);
  } catch (e) {
    console.error('[viewings/ics]', e);
    return res.status(500).json({ ok: false, error: 'internal' });
  }
}
