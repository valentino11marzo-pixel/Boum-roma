// api/viewings/_avail.js — the availability engine, one copy for everyone.
//
// The public booking grid (book.html), the client's self-service reschedule
// page and the operator's Telegram slot picker must all see EXACTLY the same
// free slots. Any divergence and one of them offers a time the others consider
// taken — the client books it, the server refuses, trust gone.
//
// So the rules live here, alone:
//   · weekly windows per weekday, Rome wall-clock (`settings/viewingAvailability`)
//   · per-mode duration (person 45' / video 20'), minimum notice, horizon, max/day
//   · a live viewing blocks its slot plus a 15' gap on either side
//   · the operator's REAL calendar (Google Workspace secret ICS — _busyics.js,
//     `BUSY_ICS_URLS` env and/or `busyIcs` on the config doc) blocks too: an
//     event in the agenda removes the slot from every surface at once
//
// No external timezone library: Rome offsets are derived from Intl, which the
// Node runtime already carries. `exceptId` lets a RESCHEDULE ignore the
// viewing's own block — otherwise a client could never move a visit by
// 30 minutes, because they'd be blocked by themselves.

import { fsGet, fsList } from '../homie/_lib.js';
import { startOf } from './_lib.js';
import { externalBusy } from './_busyics.js';

export const TZ = 'Europe/Rome';
export const GAP_MINUTES = 15;               // travel / reset between visits

export const DEFAULTS = {
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
  busyIcs: null,           // secret ICS URL(s) — merged with BUSY_ICS_URLS env
};

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// ── Rome-time helpers ───────────────────────────────────────────────────────
export function romeOffsetMinutes(utcDate) {
  const s = new Intl.DateTimeFormat('en-US', {
    timeZone: TZ, hour12: false,
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
  }).formatToParts(utcDate).reduce((a, p) => (a[p.type] = p.value, a), {});
  const asUTC = Date.UTC(+s.year, +s.month - 1, +s.day, +s.hour, +s.minute);
  return Math.round((asUTC - utcDate.getTime()) / 60000);
}

// a Rome wall-clock (Y-M-D H:M) → the real UTC instant
export function romeToUtc(y, m, d, hh, mm) {
  const guess = new Date(Date.UTC(y, m - 1, d, hh, mm));
  const off = romeOffsetMinutes(guess);
  return new Date(guess.getTime() - off * 60000);
}

export function romeParts(date) {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: TZ, weekday: 'short', day: '2-digit', month: 'short',
    year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false,
  }).formatToParts(date).reduce((a, x) => (a[x.type] = x.value, a), {});
}

// the Rome calendar day of an instant, as YYYY-MM-DD
export function romeDateKey(date) {
  const p = romeParts(date);
  const mo = MONTHS.indexOf(p.month) + 1;
  return `${p.year}-${String(mo).padStart(2, '0')}-${p.day}`;
}

const hhmm = str => { const [h, m] = String(str).split(':').map(Number); return { h: h || 0, m: m || 0 }; };

export async function loadConfig() {
  try {
    const c = await fsGet('settings/viewingAvailability');
    if (!c) return DEFAULTS;
    return {
      windows: c.windows && Object.keys(c.windows).length ? c.windows : DEFAULTS.windows,
      slotMinutes: { ...DEFAULTS.slotMinutes, ...(c.slotMinutes || {}) },
      minNoticeHours: Number(c.minNoticeHours) >= 0 ? Number(c.minNoticeHours) : DEFAULTS.minNoticeHours,
      horizonDays: Number(c.horizonDays) > 0 ? Math.min(30, Number(c.horizonDays)) : DEFAULTS.horizonDays,
      maxPerDay: Number(c.maxPerDay) > 0 ? Number(c.maxPerDay) : DEFAULTS.maxPerDay,
      busyIcs: c.busyIcs || null,
    };
  } catch { return DEFAULTS; }
}

/**
 * Every live appointment in the horizon as [startMs, endMs, dateKey] blocks.
 * @param exceptId  viewing id to ignore (a reschedule must not block itself)
 */
export async function busyBlocks(cfg, exceptId = null) {
  const out = [];
  for (const status of ['confirmed', 'pending']) {
    let rows = [];
    try { rows = await fsList('viewingRequests', { filter: { field: 'status', op: 'EQUAL', value: status }, limit: 200 }); }
    catch { /* best effort: an unreadable list must not block booking */ }
    for (const v of rows) {
      if (v.voided) continue;
      if (exceptId && v.id === exceptId) continue;
      const s = startOf(v);
      if (!s) continue;
      const dur = Number(v.durationMinutes) || 45;
      out.push([s.getTime(), s.getTime() + dur * 60000, romeDateKey(s)]);
    }
  }
  // the operator's Google Workspace calendar: a real appointment removes the
  // slot for every surface. Best-effort — an unreachable calendar must never
  // switch off bookings (fail-open with cache inside _busyics.js).
  try { out.push(...await externalBusy(cfg)); }
  catch (e) { console.warn('[viewings/_avail] external busy skipped:', e && e.message); }
  return out;
}

/**
 * The published grid. Pure — same inputs, same output (unit-testable).
 * @returns [{ date:'YYYY-MM-DD', label:'Thu 31 Jul', times:[{iso,label}] }]
 */
export function buildSlots(cfg, busy, mode, now = new Date()) {
  const step = cfg.slotMinutes[mode] || 45;
  const gapMs = GAP_MINUTES * 60000;
  const notAfter = now.getTime() + cfg.horizonDays * 86400000;
  const notBefore = now.getTime() + cfg.minNoticeHours * 3600000;
  const days = [];

  for (let i = 0; i <= cfg.horizonDays; i++) {
    const probe = new Date(now.getTime() + i * 86400000);
    const p = romeParts(probe);
    const y = +p.year, mo = MONTHS.indexOf(p.month) + 1, d = +p.day;
    const dow = romeToUtc(y, mo, d, 12, 0).getUTCDay();
    const wins = cfg.windows[dow] || cfg.windows[String(dow)] || [];
    if (!wins.length) continue;

    const dateKey = `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    if (busy.filter(b => b[2] === dateKey).length >= cfg.maxPerDay) continue;

    const times = [];
    for (const [from, to] of wins) {
      const a = hhmm(from), b = hhmm(to);
      let cur = romeToUtc(y, mo, d, a.h, a.m);
      const end = romeToUtc(y, mo, d, b.h, b.m);
      while (cur.getTime() + step * 60000 <= end.getTime() + 1) {
        const s = cur.getTime(), e = s + step * 60000;
        const free = !busy.some(([bs, be]) => s < be + gapMs && e + gapMs > bs);
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

/** Convenience for callers that just want "is this exact instant bookable?" */
export function slotOffered(slots, when) {
  const iso = when instanceof Date ? when.toISOString() : String(when);
  return slots.some(d => d.times.some(t => t.iso === iso));
}
