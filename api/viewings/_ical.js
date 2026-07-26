// api/viewings/_ical.js — real calendaring, not a "add to calendar" link.
//
// Two mechanisms, both credential-free (no Google OAuth, no API project, no
// token to expire at 3am):
//
//  1. INVITES (METHOD:REQUEST) — the booking is emailed to the operator (and
//     to the client) as a genuine iCalendar invitation. Gmail, Apple Mail and
//     Outlook all add it to the calendar automatically. Because every invite
//     carries the SAME UID with an increasing SEQUENCE, a reschedule UPDATES
//     the existing event in place instead of creating a second one, and
//     METHOD:CANCEL removes it. That is the same protocol Calendly and
//     Outlook speak to each other — implemented properly, it beats an API
//     integration in reliability and costs nothing.
//
//  2. FEED (feed.js) — one URL to subscribe to once; every viewing, always
//     current, on any calendar app.
//
// Video viewings carry the room in LOCATION, in the description and in
// X-GOOGLE-CONFERENCE, so Google Calendar shows a real "join" button.

import { videoRoom, isVideo, startOf, endOf, calendarTitle, WA } from './_lib.js';

const ORG_NAME = 'BOOM Rome';
const ORG_EMAIL = process.env.GMAIL_USER || 'valentino@boom-rome.com';
export const OPERATOR_EMAIL = process.env.VIEWINGS_CALENDAR_EMAIL || ORG_EMAIL;

const stamp = d => new Date(d).toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
const esc = t => String(t == null ? '' : t)
  .replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');

// RFC 5545 asks for ≤75 octet lines; Outlook is the one that actually cares.
function fold(line) {
  if (line.length <= 73) return line;
  const out = [line.slice(0, 73)];
  let rest = line.slice(73);
  while (rest.length > 72) { out.push(' ' + rest.slice(0, 72)); rest = rest.slice(72); }
  if (rest) out.push(' ' + rest);
  return out.join('\r\n');
}

export const uidFor = v => `boom-viewing-${v.id}@boomrome.com`;

function describe(v, lang) {
  const it = lang === 'it';
  const L = [];
  if (isVideo(v)) {
    L.push((it ? 'Videochiamata: ' : 'Video call: ') + (v.videoUrl || videoRoom(v.id)));
    L.push(it ? 'Si apre nel browser, nessuna app.' : 'Opens in the browser, no app needed.');
  } else {
    L.push((it ? 'Indirizzo: ' : 'Address: ') + [v.listingAddress || v.listingName, 'Roma'].filter(Boolean).join(', '));
    L.push((it ? 'Punto d\'incontro: ' : 'Meeting point: ') + (v.meetingPoint || (it ? 'al citofono' : 'at the intercom')));
  }
  L.push('');
  L.push((it ? 'Cliente: ' : 'Client: ') + [v.clientName || v.name, v.clientPhone || v.phone, v.clientEmail || v.email].filter(Boolean).join(' · '));
  if (v.notes) L.push((it ? 'Note: ' : 'Notes: ') + v.notes);
  L.push('');
  L.push(`WhatsApp BOOM: ${WA}`);
  L.push(`https://www.boomrome.com/portal`);
  return L.join('\n');
}

/**
 * Build an iCalendar object for a viewing.
 * @param v        viewing (enriched with listing name/address)
 * @param opts.method   'REQUEST' (create/update) | 'CANCEL' | 'PUBLISH' (feed)
 * @param opts.sequence bump on every change so calendars update in place
 * @param opts.attendees [{email, name, role}] — operator first
 */
export function buildInvite(v, { method = 'REQUEST', sequence = 0, attendees = [], lang = 'en' } = {}) {
  const s = startOf(v);
  if (!s) return null;
  const cancelled = method === 'CANCEL';
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//BOOM Rome//Viewings//EN',
    'CALSCALE:GREGORIAN',
    `METHOD:${method}`,
    'BEGIN:VEVENT',
    `UID:${uidFor(v)}`,
    `SEQUENCE:${Math.max(0, Number(sequence) || 0)}`,
    `DTSTAMP:${stamp(new Date())}`,
    `DTSTART:${stamp(s)}`,
    `DTEND:${stamp(endOf(v, s))}`,
    `SUMMARY:${esc((cancelled ? (lang === 'it' ? 'ANNULLATA — ' : 'CANCELLED — ') : '') + calendarTitle(v, lang) + ' · ' + (v.clientName || v.name || ''))}`,
    `DESCRIPTION:${esc(describe(v, lang))}`,
    `LOCATION:${esc(isVideo(v) ? (v.videoUrl || videoRoom(v.id)) : [v.listingAddress || v.listingName, 'Roma'].filter(Boolean).join(', '))}`,
    `ORGANIZER;CN=${esc(ORG_NAME)}:mailto:${ORG_EMAIL}`,
    `STATUS:${cancelled ? 'CANCELLED' : 'CONFIRMED'}`,
    'TRANSP:OPAQUE',
  ];
  if (isVideo(v)) {
    const room = v.videoUrl || videoRoom(v.id);
    lines.push(`URL:${room}`);
    lines.push(`X-GOOGLE-CONFERENCE:${room}`);   // Google renders a join button
  }
  for (const a of attendees) {
    if (!a || !a.email) continue;
    lines.push(fold(`ATTENDEE;CUTYPE=INDIVIDUAL;ROLE=${a.role || 'REQ-PARTICIPANT'};PARTSTAT=${cancelled ? 'DECLINED' : 'ACCEPTED'};RSVP=FALSE;CN=${esc(a.name || a.email)}:mailto:${a.email}`));
  }
  if (!cancelled) {
    lines.push('BEGIN:VALARM', 'TRIGGER:-PT3H', 'ACTION:DISPLAY', `DESCRIPTION:${esc(calendarTitle(v, lang))}`, 'END:VALARM');
    lines.push('BEGIN:VALARM', 'TRIGGER:-PT30M', 'ACTION:DISPLAY', `DESCRIPTION:${esc(calendarTitle(v, lang))}`, 'END:VALARM');
  }
  lines.push('END:VEVENT', 'END:VCALENDAR');
  return lines.map(fold).join('\r\n');
}

// A whole calendar of events — used by the subscribable feed.
export function buildFeed(viewings, lang = 'en') {
  const head = [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//BOOM Rome//Viewings Feed//EN',
    'CALSCALE:GREGORIAN', 'METHOD:PUBLISH',
    'X-WR-CALNAME:BOOM — Viewings', 'X-WR-TIMEZONE:Europe/Rome',
    'X-PUBLISHED-TTL:PT15M', 'REFRESH-INTERVAL;VALUE=DURATION:PT15M',
  ];
  const body = [];
  for (const v of viewings) {
    const one = buildInvite(v, { method: 'PUBLISH', sequence: v.icalSequence || 0, lang });
    if (!one) continue;
    const inner = one.split('\r\n');
    const a = inner.indexOf('BEGIN:VEVENT'), b = inner.indexOf('END:VEVENT');
    if (a >= 0 && b > a) body.push(...inner.slice(a, b + 1));
  }
  return [...head, ...body, 'END:VCALENDAR'].join('\r\n');
}
