// api/viewings/confirm.js — the operator's one move, over HTTP.
//
// A viewing request becomes a real appointment here: pick the mode (in person
// or video), set the time, and the client immediately gets the full flight
// kit — confirmation email with the one-tap action, Google/Apple calendar,
// Apple Wallet pass — while the countdown (_moments.js) takes over.
//
// The state change itself lives in _apply.js, shared with the Telegram buttons
// and the client's self-service page: this file is auth + parsing, nothing more.
//
// Method: POST · auth: admin Firebase ID token, X-Homie-Secret or cron secret
// Body: { id, action?: 'confirm'|'reschedule'|'cancel',
//         when?: ISO datetime, mode?: 'person'|'video',
//         durationMinutes?, meetingPoint?, notes? }
// 200:  { ok, id, status, mode, when, videoUrl?, passUrl, manageUrl }

import { readJson } from '../homie/_lib.js';
import { requireCronOrAdmin } from '../pfs/_guard.js';
import { applyViewingChange } from './_apply.js';

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'method_not_allowed' });
  const actor = await requireCronOrAdmin(req, res);
  if (!actor) return;

  let body;
  try { body = await readJson(req); } catch { return res.status(400).json({ ok: false, error: 'invalid_json' }); }
  const id = String((body && body.id) || '').trim();
  if (!id) return res.status(400).json({ ok: false, error: 'id_required' });

  try {
    const out = await applyViewingChange(id, {
      action: body.action,
      when: body.when,
      mode: body.mode,
      durationMinutes: body.durationMinutes,
      meetingPoint: body.meetingPoint,
      notes: body.notes,
      actor,
    });
    if (!out.ok) {
      const code = out.error === 'viewing_not_found' ? 404 : 400;
      return res.status(code).json({ ok: false, error: out.error });
    }
    const { viewing, ...payload } = out;
    return res.status(200).json(payload);
  } catch (err) {
    console.error('[viewings/confirm]', err);
    return res.status(500).json({ ok: false, error: err.message || 'internal' });
  }
}
