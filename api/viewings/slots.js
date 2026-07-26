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
import { videoRoom, passUrl, startOf } from './_lib.js';
import { sendConfirmation } from './_email.js';

const TZ = 'Europe/Rome';
const DEFAULTS = {
  // 0 = Sunday … 6 = Saturday, Rome local hours
  windows: {
    1: [['10:00', '13:00'], ['15:00', '19:00']],
    2: [['10:00', '13:00'], ['15:00', '19:00']],
    3: [['10:00', '13:00'], ['15:00', '19:00']],
    4: [['10:00', '13:00'], ['15:00', '19:00']],
    5: [['10:00', '13:00'], ['15:00', '18:00']],
    6: [['10:00', '13:00']],
  },
  slotMinutes: { person: 45, video: 20 },
  minNoticeHours: 4,
  horizonDays: 14,
  maxPerDay: 6,
};

const clip = (s, n) => String(s == null ? '' : s).trim().slice(0, n);
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[a-z]{2,}$/i;

// ── Rome-time helpers (no external tz library: derive the offset from Intl) ──
function romeOffsetMinutes(utcDate) {
  const s = new Intl.DateTimeFormat('en-US', {
    timeZone: TZ, hour12: false,
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
  }).formatToParts(utcDate).reduce((a, p) => (a[p.type] = p.value, a), {});
  const asUTC = Date.UTC(+s.year, +s.month - 1, +s.day, +s.hour, +s.minute);
  return Math.round((asUTC - utcDate.getTime()) / 60000);
}
// a Rome wall-clock (Y-M-D H:M) → the real UTC instant
function romeToUtc(y, m, d, hh, mm) {
  const guess = new Date(Date.UTC(y, m - 1, d, hh, mm));
  const off = romeOffsetMinutes(guess);
  return new Date(guess.getTime() - off * 60000);
}
function romeParts(date) {
  const p = new Intl.DateTimeFormat('en-GB', {
    timeZone: TZ, weekday: 'short', day: '2-digit', month: 'short',
    year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false,
  }).formatToParts(date).reduce((a, x) => (a[x.type] = x.value, a), {});
  return p;
}
const hhmm = str => { const [h, m] = String(str).split(':').map(Number); return { h: h || 0, m: m || 0 }; };

async function loadConfig() {
  try {
    const c = await fsGet('settings/viewingAvailability');
    if (!c) return DEFAULTS;
    return {
      windows: c.windows && Object.keys(c.windows).length ? c.windows : DEFAULTS.windows,
      slotMinutes: { ...DEFAULTS.slotMinutes, ...(c.slotMinutes || {}) },
      minNoticeHours: Number(c.minNoticeHours) > 0 ? Number(c.minNoticeHours) : DEFAULTS.minNoticeHours,
      horizonDays: Number(c.horizonDays) > 0 ? Math.min(30, Number(c.horizonDays)) : DEFAULTS.horizonDays,
      maxPerDay: Number(c.maxPerDay) > 0 ? Number(c.maxPerDay) : DEFAULTS.maxPerDay,
    };
  } catch { return DEFAULTS; }
}

// every live appointment in the horizon, as [startMs, endMs) blocks
async function busyBlocks(cfg) {
  const out = [];
  for (const status of ['confirmed', 'pending']) {
    let rows = [];
    try { rows = await fsList('viewingRequests', { filter: { field: 'status', op: 'EQUAL', value: status }, limit: 200 }); }
    catch { /* best effort: an unreadable list must not block booking */ }
    for (const v of rows) {
      if (v.voided) continue;
      const s = startOf(v);
      if (!s) continue;
      const dur = Number(v.durationMinutes) || 45;
      out.push([s.getTime(), s.getTime() + dur * 60000, String(v.confirmedDate || '').slice(0, 10) || null]);
    }
  }
  return out;
}

export function buildSlots(cfg, busy, mode, now = new Date()) {
  const step = cfg.slotMinutes[mode] || 45;
  const gap = 15;                                  // travel/reset between visits
  const notAfter = now.getTime() + cfg.horizonDays * 86400000;
  const notBefore = now.getTime() + cfg.minNoticeHours * 3600000;
  const days = [];

  for (let i = 0; i <= cfg.horizonDays; i++) {
    const probe = new Date(now.getTime() + i * 86400000);
    const p = romeParts(probe);
    const y = +p.year, mo = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'].indexOf(p.month) + 1, d = +p.day;
    const dow = romeToUtc(y, mo, d, 12, 0).getUTCDay();
    const wins = cfg.windows[dow] || cfg.windows[String(dow)] || [];
    if (!wins.length) continue;

    const dateKey = `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    const bookedToday = busy.filter(b => b[2] === dateKey).length;
    if (bookedToday >= cfg.maxPerDay) continue;

    const times = [];
    for (const [from, to] of wins) {
      const a = hhmm(from), b = hhmm(to);
      let cur = romeToUtc(y, mo, d, a.h, a.m);
      const end = romeToUtc(y, mo, d, b.h, b.m);
      while (cur.getTime() + step * 60000 <= end.getTime() + 1) {
        const s = cur.getTime(), e = s + step * 60000;
        const free = !busy.some(([bs, be]) => s < be + gap * 60000 && e + gap * 60000 > bs);
        if (free && s >= notBefore && s <= notAfter) {
          times.push({
            iso: new Date(s).toISOString(),
            label: new Intl.DateTimeFormat('en-GB', { timeZone: TZ, hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(s)),
          });
        }
        cur = new Date(e);
      }
    }
    if (times.length) {
      days.push({
        date: dateKey,
        label: new Intl.DateTimeFormat('en-GB', { timeZone: TZ, weekday: 'short', day: 'numeric', month: 'short' }).format(romeToUtc(y, mo, d, 12, 0)),
        times,
      });
    }
  }
  return days;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(204).end();

  const cfg = await loadConfig();

  if (req.method === 'GET') {
    const mode = String((req.query && req.query.mode) || 'person').toLowerCase() === 'video' ? 'video' : 'person';
    try {
      const slots = buildSlots(cfg, await busyBlocks(cfg), mode);
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
    // re-verify the slot server-side: the list the client saw may be stale
    const busy = await busyBlocks(cfg);
    const offered = buildSlots(cfg, busy, mode).some(d => d.times.some(t => t.iso === when.toISOString()));
    if (!offered) return res.status(409).json({ ok: false, error: 'slot_taken' });

    let listing = null;
    if (listingId) listing = await fsGet(`listings/${listingId}`).catch(() => null);

    const durationMinutes = cfg.slotMinutes[mode] || 45;
    const doc = {
      clientName: name, clientEmail: email, clientPhone: phone || null,
      name, email, phone: phone || null,
      listingId: listingId || null,
      listingName: (listing && (listing.name || listing.address)) || clip(body.listingName, 160) || null,
      listingZone: (listing && listing.zone) || null,
      listingPrice: (listing && listing.price) || null,
      mode, durationMinutes,
      proposedDateTime: when.toISOString(),
      confirmedDateTime: when.toISOString(),
      confirmedDate: when.toISOString().slice(0, 10),
      confirmedTime: when.toISOString().slice(11, 16),
      scheduledAt: when.toISOString(),
      status: 'confirmed',                       // the slot WAS the availability
      selfBooked: true,
      language: String(body.language || '').toLowerCase() === 'it' ? 'it' : 'en',
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
      await sendConfirmation(full, full.language);
      await fsPatch(`viewingRequests/${id}`, { confirmationSent: true, confirmationSentAt: new Date() });
    } catch (e) { console.warn('[viewings/slots] confirmation mail:', e.message); }

    await logActivity('Visita prenotata dal cliente', 'viewing',
      { id, mode, when: when.toISOString(), listing: full.listingName }, 'self-service');

    return res.status(200).json({
      ok: true, id, status: 'confirmed', when: when.toISOString(), mode,
      videoUrl: full.videoUrl || undefined, passUrl: passUrl(full),
    });
  } catch (e) {
    console.error('[viewings/slots] POST', e);
    return res.status(500).json({ ok: false, error: 'internal' });
  }
}
