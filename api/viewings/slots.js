// api/viewings/slots.js — real availability, instant confirmation.
//
// The old flow asked the client to GUESS a time and then wait for a human to
// approve it: two days of ping-pong for a 30-minute visit, and the best
// prospects (the ones with three other appointments booked in an hour) simply
// go elsewhere. This endpoint publishes the operator's actual availability
// and lets the client take a slot — confirmed on the spot, exactly like a
// flight seat.
//
// GET  /api/viewings/slots?listingId=&mode=person|video&days=14
//      → { ok, timezone, slots:[{date, label, times:[{iso, label}]}] }
// POST /api/viewings/slots
//      { listingId, when, mode, name, email, phone, notes?, company? }
//      → { ok, id, status:'confirmed', when, videoUrl?, passUrl }
//
// Rules (config doc `settings/viewingAvailability`, defaults below):
//   · weekly windows per weekday, Rome time
//   · minimum notice, horizon, per-mode duration
//   · a slot already taken by a live viewing disappears for everyone
//   · booking inside published availability is CONFIRMED immediately — the
//     slots ARE the operator's declared availability, so there is nothing
//     left to approve. Anything else would re-introduce the ping-pong.

import { fsGet, fsCreate, fsList, fsPatch, readJson, logActivity } from '../homie/_lib.js';
import { videoRoom, passUrl, manageUrl } from './_lib.js';
import { sendConfirmation } from './_email.js';
import { inviteOperator } from './_invite.js';
import { TZ, loadConfig, busyBlocks, buildSlots, slotOffered, listingCtx } from './_avail.js';
import { replyLang } from '../_lang.js';

// re-exported so the availability engine has a single public entry point for
// callers that already knew this module (and for the unit tests)
export { buildSlots };

const clip = (s, n) => String(s == null ? '' : s).trim().slice(0, n);
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[a-z]{2,}$/i;

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(204).end();

  const cfg = await loadConfig();

  if (req.method === 'GET') {
    const mode = String((req.query && req.query.mode) || 'person').toLowerCase() === 'video' ? 'video' : 'person';
    try {
      // the listing being booked shapes the gaps: same-apartment slots chain,
      // cross-town ones spread by real travel time (book.html already sends it)
      const ctx = await listingCtx(clip((req.query && req.query.listingId) || '', 80));
      const slots = buildSlots(cfg, await busyBlocks(cfg), mode, new Date(), ctx);
      res.setHeader('Cache-Control', 'public, max-age=0, s-maxage=60');
      return res.status(200).json({ ok: true, timezone: TZ, mode, slots });
    } catch (e) {
      console.error('[viewings/slots] GET', e);
      return res.status(500).json({ ok: false, error: 'internal' });
    }
  }

  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'method_not_allowed' });

  let body;
  try { body = await readJson(req); } catch { return res.status(400).json({ ok: false, error: 'invalid_json' }); }
  if (body && clip(body.company, 80)) return res.status(200).json({ ok: true, id: null }); // honeypot

  const name = clip(body.name, 120);
  const email = clip(body.email, 160);
  const phone = clip(body.phone, 40);
  const listingId = clip(body.listingId, 80);
  const mode = String(body.mode || 'person').toLowerCase() === 'video' ? 'video' : 'person';
  const when = new Date(body.when);
  if (!name || !EMAIL_RE.test(email)) return res.status(400).json({ ok: false, error: 'name_and_email_required' });
  if (isNaN(when.getTime())) return res.status(400).json({ ok: false, error: 'when_invalid' });

  try {
    let listing = null;
    if (listingId) listing = await fsGet(`listings/${listingId}`).catch(() => null);
    const ctx = listing
      ? { listingId, lat: listing.lat != null ? Number(listing.lat) : null, lng: listing.lng != null ? Number(listing.lng) : null }
      : (listingId ? { listingId } : null);

    // re-verify the slot server-side: the list the client saw may be stale
    const busy = await busyBlocks(cfg);
    if (!slotOffered(buildSlots(cfg, busy, mode, new Date(), ctx), when)) return res.status(409).json({ ok: false, error: 'slot_taken' });

    const durationMinutes = cfg.slotMinutes[mode] || 45;
    const doc = {
      clientName: name, clientEmail: email, clientPhone: phone || null,
      name, email, phone: phone || null,
      listingId: listingId || null,
      listingName: (listing && (listing.name || listing.address)) || clip(body.listingName, 160) || null,
      listingZone: (listing && listing.zone) || null,
      listingPrice: (listing && listing.price) || null,
      // coords ride on the doc so busyBlocks can compute travel gaps for free
      lat: listing && listing.lat != null ? Number(listing.lat) : null,
      lng: listing && listing.lng != null ? Number(listing.lng) : null,
      mode, durationMinutes,
      proposedDateTime: when.toISOString(),
      confirmedDateTime: when.toISOString(),
      confirmedDate: when.toISOString().slice(0, 10),
      confirmedTime: when.toISOString().slice(11, 16),
      scheduledAt: when.toISOString(),
      status: 'confirmed',                       // the slot WAS the availability
      selfBooked: true,
      // unknown stays unknown: replyLang reads the notes they actually typed
      // and falls back to English, BOOM's house language
      language: ['it', 'en'].includes(String(body.language || '').toLowerCase()) ? String(body.language).toLowerCase() : null,
      notes: clip(body.notes, 800) || null,
      voided: false,
      reminder24hSent: false, reminder3hSent: false, reminder30mSent: false, afterAskSent: false,
      confirmationSent: false,
      createdAt: new Date(), confirmedAt: new Date(), createdBy: 'self-service',
    };
    if (mode === 'video') doc.videoUrl = null;   // filled right after we have the id

    const { id } = await fsCreate('viewingRequests', doc);
    const full = { ...doc, id };
    if (mode === 'video') {
      full.videoUrl = videoRoom(id);
      await fsPatch(`viewingRequests/${id}`, { videoUrl: full.videoUrl });
    }
    if (listing && listing.address) full.listingAddress = listing.address;

    // confirm instantly — waiting 15 minutes for the cron would break the promise
    try {
      await sendConfirmation(full, replyLang(full));
      await fsPatch(`viewingRequests/${id}`, { confirmationSent: true, confirmationSentAt: new Date() });
    } catch (e) { console.warn('[viewings/slots] confirmation mail:', e.message); }

    // the appointment lands in the operator's calendar by itself
    try { await inviteOperator(full, 'new'); }
    catch (e) { console.warn('[viewings/slots] operator invite:', e.message); }

    await logActivity('Visita prenotata dal cliente', 'viewing',
      { id, mode, when: when.toISOString(), listing: full.listingName }, 'self-service');

    return res.status(200).json({
      ok: true, id, status: 'confirmed', when: when.toISOString(), mode,
      videoUrl: full.videoUrl || undefined, passUrl: passUrl(full),
      manageUrl: manageUrl(full),
    });
  } catch (e) {
    console.error('[viewings/slots] POST', e);
    return res.status(500).json({ ok: false, error: 'internal' });
  }
}
