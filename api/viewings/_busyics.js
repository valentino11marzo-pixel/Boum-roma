// api/viewings/_busyics.js — the operator's REAL calendar inside the grid.
//
// Instant booking works because the published slots ARE the operator's
// declared availability. But the operator also has a life — and a Google
// Workspace calendar. This module reads that calendar (the "secret address
// in iCal format": Google Calendar → Settings → your calendar → Integrate
// calendar) and turns every busy event into a block for the availability
// engine: if something is on the agenda, the slot is simply never offered —
// on book.html, on the client's self-service page and on the Telegram
// picker, which all read busyBlocks(). Blocking instant booking for an
// afternoon is therefore one drag in Google Calendar, no BOOM UI involved.
//
// Credential-free like the rest of the viewing cycle (no OAuth, no API
// project, no token to expire at 3am): the secret URL IS the credential.
// It lives in BUSY_ICS_URLS (env, comma-separated for several calendars)
// and/or settings/viewingAvailability.busyIcs — server-side only, never in
// a page. Rotate it from Google ("Reset" next to the secret address) to
// revoke.
//
// Rules of engagement:
//   · TRANSP:TRANSPARENT ("free") and STATUS:CANCELLED never block — an
//     all-day birthday must not close a whole day of viewings
//   · BOOM's own events (UID boom-viewing-*/viewing-*@boomrome.com — the
//     operator invites, the client .ics, the feed) are IGNORED: Firestore is
//     the truth for those, and without this filter a viewing's calendar copy
//     would block its own reschedule
//   · recurrences are expanded inside the horizon: DAILY/WEEKLY (INTERVAL,
//     BYDAY, COUNT, UNTIL, EXDATE, moved instances via RECURRENCE-ID) plus
//     simple MONTHLY/YEARLY; anything more exotic contributes only its
//     first instance — better one true block than a crash or a guess
//   · external events do NOT count toward maxPerDay (dateKey null): they
//     are occupied time, not viewings
//   · fail-open with a cache: fresh ≤2', on error the last good reading
//     (≤6h) is reused, and with nothing at all the grid is what it always
//     was — an unreachable calendar must never switch off bookings

const DEFAULT_TZ = 'Europe/Rome';
export const ICS_FETCH_TIMEOUT_MS = 4500;
const FRESH_MS = 2 * 60 * 1000;
const STALE_OK_MS = 6 * 60 * 60 * 1000;
const MAX_ITER = 40000;                    // recurrence runaway guard

// invites + client .ics + feed (viewing) AND the Regista's task events:
// Firestore is the truth for all of them — their calendar copies never block
const BOOM_UID_RE = /^(boom-(viewing|task)-|viewing-)[^@\s]*@boomrome\.com$/i;

// ── ICS text → raw VEVENTs ─────────────────────────────────────────────────
export function unfoldIcs(text) {
  // RFC 5545: CRLF + one space/tab continues the previous line
  return String(text || '').replace(/\r\n?/g, '\n').replace(/\n[ \t]/g, '');
}

// first ':' outside double quotes splits "NAME;PARAM=..." from the value
function splitProp(line) {
  let q = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') q = !q;
    else if (ch === ':' && !q) return [line.slice(0, i), line.slice(i + 1)];
  }
  return null;
}

function splitParams(left) {
  const parts = [];
  let cur = '', q = false;
  for (const ch of left) {
    if (ch === '"') { q = !q; cur += ch; }
    else if (ch === ';' && !q) { parts.push(cur); cur = ''; }
    else cur += ch;
  }
  parts.push(cur);
  const params = {};
  for (const p of parts.slice(1)) {
    const j = p.indexOf('=');
    if (j > 0) params[p.slice(0, j).toUpperCase()] = p.slice(j + 1).replace(/^"|"$/g, '');
  }
  return { name: parts[0].toUpperCase(), params };
}

/** @returns [{ DTSTART:{value,params}, …, EXDATE:[{value,params}…] }] */
export function parseVevents(text) {
  const events = [];
  let cur = null, nested = 0;             // VALARM blocks must not pollute the event
  for (const line of unfoldIcs(text).split('\n')) {
    if (line === 'BEGIN:VEVENT') { cur = {}; nested = 0; continue; }
    if (!cur) continue;
    if (line === 'END:VEVENT') { events.push(cur); cur = null; continue; }
    if (line.startsWith('BEGIN:')) { nested++; continue; }
    if (line.startsWith('END:')) { if (nested > 0) nested--; continue; }
    if (nested > 0) continue;
    const split = splitProp(line);
    if (!split) continue;
    const { name, params } = splitParams(split[0]);
    const entry = { value: split[1], params };
    if (name === 'EXDATE') (cur.EXDATE = cur.EXDATE || []).push(entry);
    else cur[name] = entry;
  }
  return events;
}

// ── time: ICS values → epoch ms, via Intl (no tz library) ─────────────────
const fmtCache = new Map();
function fmtFor(tz) {
  if (fmtCache.has(tz)) return fmtCache.get(tz);
  let f = null;
  for (const zone of [tz, DEFAULT_TZ]) {
    try {
      f = new Intl.DateTimeFormat('en-US', {
        timeZone: zone, hour12: false,
        year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit', second: '2-digit',
      });
      break;
    } catch { /* unknown TZID (an Outlook zone name): fall back to Rome */ }
  }
  fmtCache.set(tz, f);
  return f;
}

function zoneOffsetMinutes(utcMs, tz) {
  const f = fmtFor(tz);
  if (!f) return 0;
  const s = f.formatToParts(new Date(utcMs)).reduce((a, p) => (a[p.type] = p.value, a), {});
  const asUTC = Date.UTC(+s.year, +s.month - 1, +s.day, (+s.hour) % 24, +s.minute, +(s.second || 0));
  return Math.round((asUTC - utcMs) / 60000);
}

/** A wall-clock (Y-M-D H:M:S) in an arbitrary IANA zone → the UTC instant. */
export function zonedToEpoch(y, mo, d, hh, mm, ss, tz) {
  const guess = Date.UTC(y, mo - 1, d, hh, mm, ss || 0);
  const off1 = zoneOffsetMinutes(guess, tz);
  const t = guess - off1 * 60000;
  const off2 = zoneOffsetMinutes(t, tz);   // DST edge: the shifted instant may sit on the other side
  return off2 === off1 ? t : guess - off2 * 60000;
}

/** '20260803T100000[Z]' / '20260803' (+params) → parts. Floating times = Rome. */
export function parseIcsTime(value, params = {}, defaultTz = DEFAULT_TZ) {
  const v = String(value || '').trim();
  if ((params.VALUE || '').toUpperCase() === 'DATE' || /^\d{8}$/.test(v)) {
    const m = v.match(/^(\d{4})(\d{2})(\d{2})/);
    return m ? { allDay: true, y: +m[1], mo: +m[2], d: +m[3] } : null;
  }
  const m = v.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(Z?)$/);
  if (!m) return null;
  return { y: +m[1], mo: +m[2], d: +m[3], hh: +m[4], mm: +m[5], ss: +m[6], utc: m[7] === 'Z', tz: params.TZID || defaultTz };
}

export function icsEpoch(t) {
  if (!t) return null;
  if (t.allDay) return zonedToEpoch(t.y, t.mo, t.d, 0, 0, 0, DEFAULT_TZ);  // an all-day event is a Rome day
  if (t.utc) return Date.UTC(t.y, t.mo - 1, t.d, t.hh, t.mm, t.ss);
  return zonedToEpoch(t.y, t.mo, t.d, t.hh, t.mm, t.ss, t.tz);
}

function parseDuration(v) {
  const m = String(v || '').match(/^([+-])?P(?:(\d+)W)?(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/);
  if (!m) return null;
  const ms = ((+m[2] || 0) * 604800 + (+m[3] || 0) * 86400 + (+m[4] || 0) * 3600 + (+m[5] || 0) * 60 + (+m[6] || 0)) * 1000;
  return m[1] === '-' ? -ms : ms;
}

// local-date arithmetic (pure, no Intl — cheap enough to walk years of cadence)
const addDaysLocal = (t, n) => {
  const d = new Date(Date.UTC(t.y, t.mo - 1, t.d + n));
  return { ...t, y: d.getUTCFullYear(), mo: d.getUTCMonth() + 1, d: d.getUTCDate() };
};
const dowMon = t => (new Date(Date.UTC(t.y, t.mo - 1, t.d)).getUTCDay() + 6) % 7;  // Mon=0…Sun=6
const approxUTC = t => Date.UTC(t.y, t.mo - 1, t.d, t.hh || 0, t.mm || 0, t.ss || 0);

const BYDAY_NUM = { MO: 0, TU: 1, WE: 2, TH: 3, FR: 4, SA: 5, SU: 6 };

function parseRrule(value) {
  const rr = {};
  for (const part of String(value || '').split(';')) {
    const i = part.indexOf('=');
    if (i > 0) rr[part.slice(0, i).toUpperCase()] = part.slice(i + 1);
  }
  return rr;
}

/**
 * One VEVENT → its busy blocks inside [winStart, winEnd).
 * @param movedEpochs  instances of this series replaced by RECURRENCE-ID
 *                     overrides (the override VEVENT blocks its own new time)
 */
export function expandEvent(ev, winStart, winEnd, movedEpochs = null) {
  const start = parseIcsTime(ev.DTSTART && ev.DTSTART.value, (ev.DTSTART && ev.DTSTART.params) || {});
  if (!start) return [];

  const endT = parseIcsTime(ev.DTEND && ev.DTEND.value, (ev.DTEND && ev.DTEND.params) || {});
  let durMs = 0, durDays = 1;
  if (start.allDay) {
    durDays = endT ? Math.max(1, Math.round((approxUTC(endT) - approxUTC(start)) / 86400000)) : 1;
  } else if (endT) {
    durMs = Math.max(0, (icsEpoch(endT) || 0) - (icsEpoch(start) || 0));
  } else if (ev.DURATION) {
    durMs = Math.max(0, parseDuration(ev.DURATION.value) || 0);
  }
  if (!start.allDay && !durMs) return [];   // a zero-length event blocks nothing

  const blockOf = t => {
    if (start.allDay) {
      const endD = addDaysLocal(t, durDays);
      return [zonedToEpoch(t.y, t.mo, t.d, 0, 0, 0, DEFAULT_TZ),
              zonedToEpoch(endD.y, endD.mo, endD.d, 0, 0, 0, DEFAULT_TZ)];
    }
    const s = icsEpoch(t);
    return [s, s + durMs];
  };

  const ex = new Set();
  for (const e of ev.EXDATE || []) {
    for (const one of String(e.value).split(',')) {
      const ep = icsEpoch(parseIcsTime(one, e.params || {}));
      if (ep != null) ex.add(ep);
    }
  }

  const out = [];
  const emit = t => {
    const [s, e] = blockOf(t);
    if (e <= winStart || s >= winEnd) return;
    if (ex.has(s) || (movedEpochs && movedEpochs.has(s))) return;
    out.push([s, e]);
  };

  const rr = ev.RRULE ? parseRrule(ev.RRULE.value) : null;
  if (!rr) { emit(start); return out; }

  const freq = String(rr.FREQ || '').toUpperCase();
  const interval = Math.max(1, parseInt(rr.INTERVAL, 10) || 1);
  const count = rr.COUNT ? Math.max(1, parseInt(rr.COUNT, 10) || 1) : null;
  const untilT = rr.UNTIL ? parseIcsTime(rr.UNTIL, {}) : null;
  const untilEpoch = untilT
    ? (untilT.allDay ? zonedToEpoch(untilT.y, untilT.mo, untilT.d, 23, 59, 59, DEFAULT_TZ) : icsEpoch(untilT))
    : null;

  const unsupported =
    !['DAILY', 'WEEKLY', 'MONTHLY', 'YEARLY'].includes(freq)
    || rr.BYSETPOS || rr.BYWEEKNO || rr.BYYEARDAY || rr.BYHOUR || rr.BYMINUTE
    || (freq === 'WEEKLY' && rr.BYDAY && rr.BYDAY.split(',').some(x => !(x.trim().toUpperCase() in BYDAY_NUM)))
    || (freq === 'MONTHLY' && (rr.BYDAY || (rr.BYMONTHDAY && /,|-/.test(rr.BYMONTHDAY))))
    || (freq === 'YEARLY' && (rr.BYDAY || rr.BYMONTHDAY || rr.BYMONTH));
  if (unsupported) { emit(start); return out; }

  const stopApprox = Math.min(winEnd, untilEpoch != null ? untilEpoch : Infinity) + 2 * 86400000;
  let made = 0, iter = 0;
  // COUNT bounds the generated set BEFORE EXDATE removes from it (RFC 5545)
  const consider = t => {
    made++;
    if (count && made > count) return false;
    if (untilEpoch != null && blockOf(t)[0] > untilEpoch) return false;
    emit(t);
    return true;
  };

  if (freq === 'DAILY' || freq === 'WEEKLY') {
    const byday = freq === 'WEEKLY'
      ? (rr.BYDAY ? rr.BYDAY.split(',').map(x => BYDAY_NUM[x.trim().toUpperCase()]) : [dowMon(start)])
      : null;
    const anchor = dowMon(start);           // DTSTART's offset inside its Mon-based week
    for (let n = 0; iter++ < MAX_ITER; n++) {
      const day = addDaysLocal(start, n);
      if (approxUTC(day) > stopApprox) break;
      const hit = freq === 'DAILY'
        ? n % interval === 0
        : Math.floor((n + anchor) / 7) % interval === 0 && byday.includes(dowMon(day));
      if (hit && !consider(day)) break;
    }
  } else if (freq === 'MONTHLY') {
    const dom = rr.BYMONTHDAY ? parseInt(rr.BYMONTHDAY, 10) : start.d;
    for (let k = 0; iter++ < MAX_ITER; k += interval) {
      const total = (start.mo - 1) + k;
      const t = { ...start, y: start.y + Math.floor(total / 12), mo: (total % 12) + 1, d: dom };
      if (approxUTC(t) > stopApprox) break;
      if (new Date(Date.UTC(t.y, t.mo - 1, dom)).getUTCMonth() + 1 !== t.mo) continue;  // Feb 30 & co.
      if (!consider(t)) break;
    }
  } else {                                   // YEARLY
    for (let k = 0; iter++ < MAX_ITER; k += interval) {
      const t = { ...start, y: start.y + k };
      if (approxUTC(t) > stopApprox) break;
      if (new Date(Date.UTC(t.y, t.mo - 1, t.d)).getUTCDate() !== t.d) continue;        // Feb 29
      if (!consider(t)) break;
    }
  }
  return out;
}

/** Whole ICS text → busy [startMs, endMs] pairs inside the window. */
export function icsBusy(text, winStart, winEnd) {
  const events = parseVevents(text);
  const moved = new Map();                   // uid → Set(epoch of the replaced base instance)
  for (const ev of events) {
    const rid = ev['RECURRENCE-ID'];
    const uid = ev.UID && ev.UID.value;
    if (!rid || !uid) continue;
    const ep = icsEpoch(parseIcsTime(rid.value, rid.params || {}));
    if (ep == null) continue;
    if (!moved.has(uid)) moved.set(uid, new Set());
    moved.get(uid).add(ep);
  }
  const out = [];
  for (const ev of events) {
    const uid = (ev.UID && ev.UID.value) || '';
    if (BOOM_UID_RE.test(uid.trim())) continue;
    if (String((ev.STATUS && ev.STATUS.value) || '').toUpperCase() === 'CANCELLED') continue;
    if (String((ev.TRANSP && ev.TRANSP.value) || '').toUpperCase() === 'TRANSPARENT') continue;
    try {
      out.push(...expandEvent(ev, winStart, winEnd, ev['RECURRENCE-ID'] ? null : moved.get(uid)));
    } catch (e) { console.warn('[viewings/_busyics] event skipped:', e && e.message); }
  }
  return out;
}

// ── config + fetch ─────────────────────────────────────────────────────────
export function busyIcsUrls(cfg) {
  const raw = String(process.env.BUSY_ICS_URLS || '').split(/[\s,]+/);
  const c = cfg && cfg.busyIcs;
  if (Array.isArray(c)) raw.push(...c.map(String));
  else if (c) raw.push(...String(c).split(/[\s,]+/));
  // https only: the secret address IS a credential, it must not travel in clear
  return [...new Set(raw.map(s => s.trim()).filter(u => /^https:\/\/\S+$/i.test(u)))];
}

const CACHE = new Map();                     // url → { at, text }
export function clearIcsCache() { CACHE.clear(); }

// never the full URL anywhere: it carries the secret
export const safeHost = url => { try { return new URL(url).host; } catch { return 'calendar'; } };

async function fetchIcsText(url, nowMs, fetchImpl) {
  const hit = CACHE.get(url);
  const age = hit ? nowMs - hit.at : Infinity;
  if (hit && age < FRESH_MS) return hit.text;
  const host = safeHost(url);
  try {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), ICS_FETCH_TIMEOUT_MS);
    let r;
    try { r = await fetchImpl(url, { signal: ctl.signal, redirect: 'follow' }); }
    finally { clearTimeout(timer); }
    if (!r || !r.ok) throw new Error('http_' + (r && r.status));
    const text = await r.text();
    if (!/BEGIN:VCALENDAR/i.test(text)) throw new Error('not_an_ics');
    CACHE.set(url, { at: nowMs, text });
    return text;
  } catch (e) {
    console.warn(`[viewings/_busyics] fetch failed (${host}):`, e && e.message);
    return hit && age < STALE_OK_MS ? hit.text : null;
  }
}

/**
 * The operator's external calendars as busy blocks for buildSlots().
 * dateKey is null on purpose: external events must not consume maxPerDay.
 * @param report  optional array — per-source diagnostics are pushed into it
 *                (host, ok, counts, error). Never contains the secret URL.
 * @returns [[startMs, endMs, null], …] — [] on any failure (fail-open)
 */
export async function externalBusy(cfg, now = new Date(), fetchImpl = globalThis.fetch, report = null) {
  const urls = busyIcsUrls(cfg);
  if (!urls.length || typeof fetchImpl !== 'function') return [];
  const nowMs = now.getTime();
  const horizonDays = Math.max(1, Number(cfg && cfg.horizonDays) || 14);
  const winStart = nowMs - 86400000;         // an event already running still blocks
  const winEnd = nowMs + (horizonDays + 2) * 86400000;
  const texts = await Promise.all(urls.map(u => fetchIcsText(u, nowMs, fetchImpl)));
  const out = [];
  for (let i = 0; i < texts.length; i++) {
    const host = safeHost(urls[i]);
    const text = texts[i];
    if (!text) { if (report) report.push({ host, ok: false, error: 'unreachable_or_not_ics' }); continue; }
    try {
      const found = icsBusy(text, winStart, winEnd);
      out.push(...found);
      if (report) report.push({ host, ok: true, events: parseVevents(text).length, busy: found.length });
    } catch (e) {
      console.warn('[viewings/_busyics] parse failed:', e && e.message);
      if (report) report.push({ host, ok: false, error: String((e && e.message) || 'parse_failed').slice(0, 120) });
    }
  }
  return out.map(([s, e]) => [s, e, null]);
}
