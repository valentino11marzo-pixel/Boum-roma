// api/regista/_brief.js — il Foglio di Chiamata (the call sheet).
//
// A film set starts every morning with one sheet: who, where, when, what to
// bring. The operator's day deserves the same. This module BUILDS that sheet
// — pure functions over data the cron hands in, so the whole layout is
// unit-testable without Firestore or Telegram.
//
// Sections, in reading order (a phone screen, thumb-first):
//   · the day's viewings as a timeline, with the TRAVEL LEGS between
//     consecutive in-person visits (same heuristic the booking grid uses —
//     the sheet and the grid can never disagree about the day's geometry)
//   · what happened overnight (self-service bookings, client reschedules)
//   · requests still waiting for a decision → /visite
//   · today's tasks, each with one-tap ✓ Fatta / ⏰ +1g buttons
//   · tomorrow, one line — enough to see the wave coming
//
// Deterministic on purpose: a call sheet must be RIGHT, not eloquent. No AI
// call, nothing to hallucinate, nothing to pay for at 07:30 every day.

import { startOf, isVideo } from '../viewings/_lib.js';
import { travelGapMinutes, TZ } from '../viewings/_avail.js';

const esc = s => String(s == null ? '' : s).replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
const hhmm = d => new Intl.DateTimeFormat('it-IT', { timeZone: TZ, hour: '2-digit', minute: '2-digit' }).format(d);

export const viewingMeta = v => ({
  listingId: v.listingId || v.propertyId || null,
  lat: v.lat != null ? Number(v.lat) : null,
  lng: v.lng != null ? Number(v.lng) : null,
  mode: v.mode || 'person',
});

/** Consecutive in-person viewings → [{minutes, fromId, toId}] (skips video). */
export function travelLegs(viewings) {
  const legs = [];
  const walk = viewings.filter(v => !isVideo(v) && startOf(v));
  for (let i = 1; i < walk.length; i++) {
    const a = viewingMeta(walk[i - 1]), b = viewingMeta(walk[i]);
    const min = travelGapMinutes(a, b);
    legs.push({ minutes: min, fromId: walk[i - 1].id, toId: walk[i].id, same: a.listingId && a.listingId === b.listingId });
  }
  return legs;
}

/**
 * @param p { todayViewings, tomorrowViewings, tasks, overnight:{booked,moved},
 *            pendingCount, dateLabel }
 * @returns { text, keyboard, empty }
 */
export function buildBrief(p) {
  const today = (p.todayViewings || []).filter(v => startOf(v)).sort((a, b) => startOf(a) - startOf(b));
  const tomorrow = (p.tomorrowViewings || []).filter(v => startOf(v)).sort((a, b) => startOf(a) - startOf(b));
  const tasks = (p.tasks || []).slice(0, 8);
  const booked = (p.overnight && p.overnight.booked) || 0;
  const moved = (p.overnight && p.overnight.moved) || 0;
  const pending = p.pendingCount || 0;

  const empty = !today.length && !tasks.length && !booked && !moved && !pending;

  const legs = travelLegs(today);
  const legByToId = new Map(legs.map(l => [l.toId, l]));
  const travelTotal = legs.reduce((a, l) => a + (l.same ? 0 : l.minutes), 0);

  const L = [];
  L.push(`🎬 <b>LA GIORNATA</b> — ${esc(p.dateLabel || '')}`);
  const counts = [
    today.length ? `${today.length} visit${today.length === 1 ? 'a' : 'e'}` : 'nessuna visita',
    travelTotal ? `~${travelTotal}′ di spostamenti` : null,
    tasks.length ? `${tasks.length} task` : null,
  ].filter(Boolean).join(' · ');
  L.push(counts);

  if (today.length) {
    L.push('');
    for (const v of today) {
      const leg = legByToId.get(v.id);
      if (leg) L.push(leg.same ? '   🔗 stesso immobile — a catena' : `   🛵 ~${leg.minutes}′ di viaggio`);
      const s = startOf(v);
      const who = esc(v.clientName || v.name || 'Cliente');
      const where = esc(v.listingName || v.listingAddress || 'BOOM');
      L.push(`<b>${hhmm(s)}</b> ${isVideo(v) ? '🎥' : '🚶'} ${who} — ${where} (${Number(v.durationMinutes) || 45}′)`);
    }
  }

  if (booked || moved) {
    L.push('');
    const parts = [];
    if (booked) parts.push(`${booked} nuova${booked === 1 ? '' : 'e'} prenotazion${booked === 1 ? 'e' : 'i'}`);
    if (moved) parts.push(`${moved} spostat${moved === 1 ? 'a' : 'e'} dal cliente`);
    L.push(`🌙 Stanotte: ${parts.join(' · ')}`);
  }
  if (pending) L.push(`⏳ ${pending} richiest${pending === 1 ? 'a' : 'e'} da confermare → /visite`);

  if (tasks.length) {
    L.push('');
    L.push('<b>TASK DI OGGI</b>');
    for (const t of tasks) {
      const overdue = p.todayKey && t.due && t.due < p.todayKey;
      L.push(`• ${overdue ? '⚠️ ' : ''}${esc(t.title)}${t.dueTime ? ` (${t.dueTime})` : ''}`);
    }
  }

  L.push('');
  if (tomorrow.length) {
    L.push(`Domani: ${tomorrow.length} visit${tomorrow.length === 1 ? 'a' : 'e'}, la prima alle ${hhmm(startOf(tomorrow[0]))}.`);
  } else if (!empty) {
    L.push('Domani: agenda libera.');
  }
  if (empty) {
    L.length = 0;
    L.push(`🎬 <b>LA GIORNATA</b> — ${esc(p.dateLabel || '')}`);
    L.push('Agenda libera: nessuna visita, nessun task. 🧘');
    L.push('');
    L.push('Scrivimi "ricordami di …" per un promemoria, /visite per l\'agenda.');
  }

  // one row per task: ✓ done + ⏰ tomorrow (Telegram caps callbacks at 64B —
  // task ids are built short on purpose, see autoTaskId)
  const keyboard = tasks.length ? {
    inline_keyboard: tasks.slice(0, 6).map(t => ([
      { text: `✓ ${String(t.title).replace(/^[^\w]*/, '').slice(0, 22)}`, callback_data: `tkd:${t.id}` },
      { text: '⏰ +1g', callback_data: `tks:${t.id}` },
    ])),
  } : undefined;

  return { text: L.join('\n'), keyboard, empty };
}
