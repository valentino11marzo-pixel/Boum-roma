// api/viewings/confirm.js — the operator's one move.
//
// A viewing request becomes a real appointment here: pick the mode (in person
// or video), set the time, and the client immediately gets the full flight
// kit — confirmation email with the one-tap action, Google/Apple calendar,
// Apple Wallet pass — while the countdown (_moments.js) takes over.
//
// Also handles the two edits that matter: reschedule and cancel. Both re-send
// the right email and push the updated Wallet pass, so the card in the
// client's phone is never a lie.
//
// Method: POST · auth: admin Firebase ID token, X-Homie-Secret or cron secret
// Body: { id, action?: 'confirm'|'reschedule'|'cancel',
//         when?: ISO datetime, mode?: 'person'|'video',
//         durationMinutes?, meetingPoint?, notes? }
// 200:  { ok, id, status, mode, when, videoUrl?, passUrl }

import { fsGet, fsPatch, logActivity, fsList } from '../homie/_lib.js';
import { requireCronOrAdmin } from '../pfs/_guard.js';
import { readJson } from '../homie/_lib.js';
import { videoRoom, isVideo, startOf, passUrl, SITE } from './_lib.js';
import { sendConfirmation, sendChanged } from './_email.js';
import { inviteOperator } from './_invite.js';

const VALID_MODE = new Set(['person', 'video']);

// The address + coords live on the listing, not on the request.
async function enrich(v) {
  const id = v.listingId || v.propertyId;
  if (!id) return v;
  let l = null;
  try { l = await fsGet(`listings/${id}`); } catch { /* ignore */ }
  if (!l) { try { l = await fsGet(`properties/${id}`); } catch { /* ignore */ } }
  if (!l) return v;
  return {
    ...v,
    listingName: v.listingName || l.name || l.address || null,
    listingAddress: l.address || v.listingAddress || null,
    lat: l.lat != null ? l.lat : v.lat,
    lng: l.lng != null ? l.lng : v.lng,
  };
}

// Best-effort Wallet push: the pass web service already knows how to
// regenerate from the live doc, we only ring the bell.
async function pushPass(id) {
  try {
    const { pushPass: push } = await import('../_passkit.js');
    if (typeof push === 'function') await push(`viewing-${id}`);
  } catch (e) { console.warn('[viewings/confirm] pass push skipped:', e.message); }
}

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'method_not_allowed' });
  const actor = await requireCronOrAdmin(req, res);
  if (!actor) return;

  let body;
  try { body = await readJson(req); } catch { return res.status(400).json({ ok: false, error: 'invalid_json' }); }
  const id = String((body && body.id) || '').trim();
  if (!id) return res.status(400).json({ ok: false, error: 'id_required' });
  const action = String((body && body.action) || 'confirm').toLowerCase();

  let v;
  try { v = await fsGet(`viewingRequests/${id}`); } catch (e) { return res.status(500).json({ ok: false, error: e.message }); }
  if (!v) return res.status(404).json({ ok: false, error: 'viewing_not_found' });
  v = await enrich({ ...v, id });

  try {
    if (action === 'cancel') {
      await fsPatch(`viewingRequests/${id}`, {
        status: 'cancelled', voided: true, cancelledAt: new Date(), cancelledBy: actor,
      });
      await sendChanged(v, 'cancelled', v.language === 'it' ? 'it' : 'en').catch(e => console.warn('[viewings] cancel mail:', e.message));
      await inviteOperator(v, 'cancel').catch(e => console.warn('[viewings] cancel invite:', e.message));
      await pushPass(id);
      await logActivity('Visita annullata', 'viewing', { id }, actor);
      return res.status(200).json({ ok: true, id, status: 'cancelled' });
    }

    // confirm | reschedule
    const when = body.when ? new Date(body.when) : startOf(v);
    if (!when || isNaN(when.getTime())) return res.status(400).json({ ok: false, error: 'when_required' });
    const mode = VALID_MODE.has(String(body.mode || '').toLowerCase())
      ? String(body.mode).toLowerCase()
      : (v.mode || 'person');

    const patch = {
      status: 'confirmed',
      mode,
      confirmedDateTime: when.toISOString(),
      confirmedDate: when.toISOString().slice(0, 10),
      confirmedTime: when.toISOString().slice(11, 16),
      scheduledAt: when.toISOString(),
      voided: false,
      confirmedAt: new Date(),
      confirmedBy: actor,
    };
    if (body.durationMinutes) patch.durationMinutes = Math.max(10, Math.min(180, Number(body.durationMinutes) || 30));
    if (body.meetingPoint) patch.meetingPoint = String(body.meetingPoint).slice(0, 120);
    if (body.notes) patch.notes = String(body.notes).slice(0, 800);
    if (mode === 'video') patch.videoUrl = videoRoom(id);
    // a reschedule re-opens the countdown: the client must hear it again
    if (action === 'reschedule' || (v.confirmedDateTime && v.confirmedDateTime !== patch.confirmedDateTime)) {
      Object.assign(patch, {
        reminder24hSent: false, reminder3hSent: false, reminder30mSent: false,
        afterAskSent: false,
      });
    }
    await fsPatch(`viewingRequests/${id}`, patch);

    const fresh = { ...v, ...patch, id };
    const lang = fresh.language === 'it' ? 'it' : 'en';
    const rescheduled = action === 'reschedule';
    try {
      if (rescheduled) await sendChanged(fresh, 'rescheduled', lang);
      else await sendConfirmation(fresh, lang);
    } catch (e) { console.warn('[viewings/confirm] mail failed:', e.message); }
    // calendar: create on confirm, update in place on reschedule
    try { await inviteOperator(fresh, rescheduled ? 'update' : 'new'); }
    catch (e) { console.warn('[viewings/confirm] invite failed:', e.message); }
    await pushPass(id);
    await logActivity(rescheduled ? 'Visita spostata' : 'Visita confermata', 'viewing',
      { id, mode, when: patch.confirmedDateTime }, actor);

    return res.status(200).json({
      ok: true, id, status: 'confirmed', mode,
      when: patch.confirmedDateTime,
      videoUrl: mode === 'video' ? patch.videoUrl : undefined,
      passUrl: passUrl(fresh),
    });
  } catch (err) {
    console.error('[viewings/confirm]', err);
    return res.status(500).json({ ok: false, error: err.message || 'internal' });
  }
}
