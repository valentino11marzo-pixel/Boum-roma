// api/agent/context.push.js — Tool: agent.context.push  (Tier 1)
//
// Homie's "what I saw today" channel. The Mac agent observes the operator's
// real day (WhatsApp volume, response rhythm, recurring topics, friction) and
// pushes ONE structured observation doc per day into `operatorContext`.
// Planning sessions (Claude Code) read it back via context.pack — so the
// systems we design match how the operator actually works, not how we
// imagine they work.
//
// Body: {
//   day?:          'YYYY-MM-DD'   defaults to today (Europe/Rome)
//   observations?: string          free-form narrative (what happened, patterns)
//   habits?:       object          e.g. { activeHours: '9-13, 16-21', peakChannel: 'whatsapp' }
//   whatsapp?:     object          e.g. { conversations: 41, needingReply: 6, avgResponseMin: 22, topics: [...] }
//   painPoints?:   string[]        recurring friction Homie noticed
//   wins?:         string[]        what worked well today
//   notes?:        string          anything else worth remembering
// }
//
// Idempotent per day: re-pushing the same day PATCHES field-by-field (last
// push wins per field, so a morning push + evening push compose). Everything
// is also mirrored into `operatorContext/latest` for cheap "current picture"
// reads.

import { fsPatch, logActivity, guardPost, okJson, errJson } from './_lib.js';

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

function todayRome() {
  // en-CA locale formats as YYYY-MM-DD
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/Rome' });
}

const clip = (s, n) => (typeof s === 'string' ? s.slice(0, n) : undefined);
const clipArr = (a, items, len) =>
  Array.isArray(a) ? a.slice(0, items).map(x => String(x).slice(0, len)) : undefined;

export default async function handler(req, res) {
  const body = await guardPost(req, res); if (!body) return;

  // Size guard: observations are context, not a data dump.
  try {
    if (JSON.stringify(body).length > 40000) {
      return errJson(res, 400, 'payload_too_large', 'Keep a context push under 40KB — summarize, do not dump raw chats.');
    }
  } catch { /* circular body impossible from JSON parse; ignore */ }

  const day = DAY_RE.test(body.day || '') ? body.day : todayRome();

  const data = {
    day,
    observations: clip(body.observations, 6000),
    habits: (body.habits && typeof body.habits === 'object' && !Array.isArray(body.habits)) ? body.habits : undefined,
    whatsapp: (body.whatsapp && typeof body.whatsapp === 'object' && !Array.isArray(body.whatsapp)) ? body.whatsapp : undefined,
    painPoints: clipArr(body.painPoints, 20, 300),
    wins: clipArr(body.wins, 20, 300),
    notes: clip(body.notes, 4000),
    updatedAt: new Date(),
    updatedBy: body._actor || 'homie',
  };
  // Drop undefined so fsPatch's updateMask only touches provided fields.
  Object.keys(data).forEach(k => data[k] === undefined && delete data[k]);

  const saved = Object.keys(data).filter(k => !['day', 'updatedAt', 'updatedBy'].includes(k));
  if (!saved.length) {
    return errJson(res, 400, 'empty_push', 'Send at least one of: observations, habits, whatsapp, painPoints, wins, notes.');
  }

  try {
    await fsPatch(`operatorContext/${day}`, data);
    // Mirror into /latest so readers get the current picture with one fsGet.
    await fsPatch('operatorContext/latest', data);
    await logActivity('Context push (operatore)', 'agent', { day, fields: saved }, body._actor || 'homie');
    return okJson(res, { day, saved });
  } catch (e) { return errJson(res, 500, e.message); }
}
