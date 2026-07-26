// api/viewings/_lib.js — the shared brain of the viewing cycle.
//
// A BOOM viewing behaves like a flight: the moment it is confirmed the client
// gets a boarding pass (Wallet), the event lands in their calendar, and the
// system speaks at the crucial moments (T-24h, T-3h, T-30m, then "how did it
// go?"). Everything is one tap: directions for an in-person visit, the video
// room for a remote one, WhatsApp for anything else.
//
// Two modes, one pipeline:
//   person → address + Apple/Google Maps + meeting point
//   video  → an instant browser room (no app, no account — the right call for
//            international clients) + the same reminders
//
// Pure helpers only: no I/O, so confirm.js, _moments.js and the ICS endpoint
// all build the exact same links and copy.

import crypto from 'node:crypto';

export const SITE = 'https://www.boomrome.com';
export const WA_NUMBER = '393313251961';
export const WA = `https://wa.me/${WA_NUMBER}`;
export const waMsg = t => WA + '?text=' + encodeURIComponent(t);

export const isVideo = v => String(v && v.mode || '').toLowerCase() === 'video';

// ── the video room ─────────────────────────────────────────────────────────
// Jitsi Meet: opens in any browser, no download, no account, no API key —
// the lowest-friction option for someone abroad on an unknown device. The
// room name is derived from the viewing id + a server secret, so it is
// unguessable and stable (re-deriving gives the same room after a reschedule).
export function videoRoom(viewingId) {
  const salt = process.env.HOMIE_SECRET || process.env.CRON_SECRET || 'boom';
  const h = crypto.createHash('sha256').update(`viewing:${viewingId}:${salt}`).digest('hex').slice(0, 12);
  return `https://meet.jit.si/boom-viewing-${h}`;
}

// ── time ───────────────────────────────────────────────────────────────────
export const startOf = v => {
  const raw = v && (v.confirmedDateTime || v.proposedDateTime || v.scheduledAt);
  if (!raw) return null;
  const d = new Date(raw);
  return isNaN(d.getTime()) ? null : d;
};
export const endOf = (v, start) => new Date((start || startOf(v)).getTime() + (Number(v && v.durationMinutes) || 30) * 60000);

// Rome-local, human, in the client's language
export function fmtWhen(date, lang = 'en') {
  if (!date) return '';
  const loc = lang === 'it' ? 'it-IT' : 'en-GB';
  return new Intl.DateTimeFormat(loc, {
    weekday: 'long', day: 'numeric', month: 'long',
    hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Rome',
  }).format(date);
}
const stampUTC = d => d.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';

// ── calendar ───────────────────────────────────────────────────────────────
export function calendarTitle(v, lang = 'en') {
  const what = isVideo(v) ? (lang === 'it' ? 'Video visita' : 'Video viewing') : (lang === 'it' ? 'Visita' : 'Viewing');
  return `${what} — ${v.listingName || v.propertyName || 'BOOM Rome'}`;
}

export function calendarDetails(v, lang = 'en') {
  const lines = [];
  if (isVideo(v)) {
    lines.push(lang === 'it' ? `Link videochiamata: ${videoRoom(v.id)}` : `Video call link: ${videoRoom(v.id)}`);
    lines.push(lang === 'it' ? 'Si apre nel browser, nessuna app da installare.' : 'Opens in your browser — no app to install.');
  } else {
    if (v.listingAddress || v.listingName) lines.push((lang === 'it' ? 'Indirizzo: ' : 'Address: ') + (v.listingAddress || v.listingName));
    lines.push((lang === 'it' ? 'Punto d\'incontro: ' : 'Meeting point: ') + (v.meetingPoint || (lang === 'it' ? 'al citofono' : 'at the intercom')));
  }
  lines.push('');
  lines.push(lang === 'it' ? `Serve aiuto? WhatsApp BOOM: ${WA}` : `Need help? WhatsApp BOOM: ${WA}`);
  return lines.join('\n');
}

export function googleCalUrl(v, lang = 'en') {
  const s = startOf(v); if (!s) return null;
  const p = new URLSearchParams({
    action: 'TEMPLATE',
    text: calendarTitle(v, lang),
    dates: `${stampUTC(s)}/${stampUTC(endOf(v, s))}`,
    details: calendarDetails(v, lang),
    location: isVideo(v) ? videoRoom(v.id) : [v.listingAddress || v.listingName, 'Roma'].filter(Boolean).join(', '),
  });
  return 'https://calendar.google.com/calendar/render?' + p.toString();
}

export const icsUrl = v => `${SITE}/api/viewings/ics?id=${encodeURIComponent(v.id)}`;

export function buildIcs(v, lang = 'en') {
  const s = startOf(v); if (!s) return null;
  const esc = t => String(t || '').replace(/([,;\\])/g, '\\$1').replace(/\n/g, '\\n');
  const loc = isVideo(v) ? videoRoom(v.id) : [v.listingAddress || v.listingName, 'Roma'].filter(Boolean).join(', ');
  return [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//BOOM Rome//Viewing//EN', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:viewing-${v.id}@boomrome.com`,
    `DTSTAMP:${stampUTC(new Date())}`,
    `DTSTART:${stampUTC(s)}`,
    `DTEND:${stampUTC(endOf(v, s))}`,
    `SUMMARY:${esc(calendarTitle(v, lang))}`,
    `DESCRIPTION:${esc(calendarDetails(v, lang))}`,
    `LOCATION:${esc(loc)}`,
    isVideo(v) ? `URL:${videoRoom(v.id)}` : null,
    'BEGIN:VALARM', 'TRIGGER:-PT3H', 'ACTION:DISPLAY', `DESCRIPTION:${esc(calendarTitle(v, lang))}`, 'END:VALARM',
    'END:VEVENT', 'END:VCALENDAR',
  ].filter(Boolean).join('\r\n');
}

// ── the one-tap action ─────────────────────────────────────────────────────
// video → join the room · in person → open Maps at the exact address
export function primaryAction(v, lang = 'en') {
  if (isVideo(v)) {
    return { href: videoRoom(v.id), label: lang === 'it' ? '🎥 Entra nella videochiamata' : '🎥 Join the video call' };
  }
  const q = encodeURIComponent([v.listingAddress || v.listingName, 'Roma', 'Italia'].filter(Boolean).join(', '));
  return { href: `https://www.google.com/maps/search/?api=1&query=${q}`, label: lang === 'it' ? '📍 Indicazioni stradali' : '📍 Get directions' };
}

export const passUrl = v => `${SITE}/pass-delivery?type=viewing&id=${encodeURIComponent(v.id)}`;
