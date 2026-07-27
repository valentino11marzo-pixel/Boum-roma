// api/viewings/_apply.js — the ONE place a viewing changes state.
//
// Four surfaces can now confirm, move or cancel a visit:
//   · the operator's API           (POST /api/viewings/confirm)
//   · the operator's phone         (Telegram inline buttons)
//   · the client themselves        (POST /api/viewings/manage, /viewing page)
//   · the portal                   (same API)
//
// If each rebuilt the side-effects — the email, the Wallet push, the calendar
// invite, the reminder-flag reset — they would drift, and the drift always
// shows up as a client who got a new time but no new calendar entry. So the
// side-effects live here, once, and every surface is a thin auth wrapper.
//
// Guarantees:
//   · a reschedule ALWAYS re-opens the countdown (reminder flags reset)
//   · the calendar event is updated in place, never duplicated (stable UID +
//     growing SEQUENCE, handled by _invite.js)
//   · the Wallet pass is pushed on every change, so the card in the client's
//     phone is never a lie
//   · a failure in any notification never rolls back the state change — the
//     appointment is the truth, the email is a courtesy

import { fsGet, fsPatch, logActivity } from '../homie/_lib.js';
import { videoRoom, startOf, passUrl, manageUrl } from './_lib.js';
import { sendConfirmation, sendChanged } from './_email.js';
import { inviteOperator } from './_invite.js';
import { replyLang } from '../_lang.js';

export const VALID_MODE = new Set(['person', 'video']);

/** The address + coords live on the listing, not on the request. */
export async function enrichViewing(v) {
  const id = v.listingId || v.propertyId;
  if (!id) return { ...v };
  let l = null;
  try { l = await fsGet(`listings/${id}`); } catch { /* ignore */ }
  if (!l) { try { l = await fsGet(`properties/${id}`); } catch { /* ignore */ } }
  if (!l) return { ...v };
  return {
    ...v,
    listingName: v.listingName || l.name || l.address || null,
    listingAddress: l.address || v.listingAddress || null,
    listingZone: v.listingZone || l.zone || null,
    listingPrice: v.listingPrice != null ? v.listingPrice : (l.price != null ? l.price : null),
    lat: l.lat != null ? l.lat : v.lat,
    lng: l.lng != null ? l.lng : v.lng,
  };
}

/** Load + enrich in one step. Returns null when the doc is gone. */
export async function loadViewing(id) {
  const v = await fsGet(`viewingRequests/${id}`);
  if (!v) return null;
  return await enrichViewing({ ...v, id });
}

/** Best-effort Wallet push: the pass web service regenerates from the live doc. */
async function pushPass(id) {
  try {
    const { pushPass: push } = await import('../_passkit.js');
    if (typeof push === 'function') await push(`viewing-${id}`);
  } catch (e) { console.warn('[viewings/_apply] pass push skipped:', e.message); }
}

/**
 * @param id       viewing doc id
 * @param opts     { action:'confirm'|'reschedule'|'cancel', when, mode,
 *                   durationMinutes, meetingPoint, notes, reason,
 *                   actor:'telegram:…'|'client'|uid, byClient:bool,
 *                   viewing?: already-loaded+enriched doc }
 * @returns { ok, id, status, mode?, when?, videoUrl?, passUrl?, manageUrl?, viewing }
 */
export async function applyViewingChange(id, opts = {}) {
  const action = String(opts.action || 'confirm').toLowerCase();
  const actor = opts.actor || 'system';
  const v = opts.viewing || await loadViewing(id);
  if (!v) return { ok: false, error: 'viewing_not_found' };
  const lang = replyLang(v);

  // ── cancel ───────────────────────────────────────────────────────────────
  if (action === 'cancel') {
    await fsPatch(`viewingRequests/${id}`, {
      status: 'cancelled',
      voided: true,
      cancelledAt: new Date(),
      cancelledBy: actor,
      ...(opts.byClient ? { cancelledByClient: true } : {}),
      ...(opts.reason ? { cancelReason: String(opts.reason).slice(0, 300) } : {}),
      // a cancelled visit must never emit a countdown message
      reminder24hSent: true, reminder3hSent: true, reminder30mSent: true, afterAskSent: true,
    });
    // The client who cancelled themselves does not need an email telling them so.
    if (!opts.byClient) {
      await sendChanged(v, 'cancelled', lang).catch(e => console.warn('[viewings] cancel mail:', e.message));
    }
    await inviteOperator(v, 'cancel').catch(e => console.warn('[viewings] cancel invite:', e.message));
    await pushPass(id);
    await logActivity('Visita annullata', 'viewing', { id, byClient: !!opts.byClient }, actor);
    return { ok: true, id, status: 'cancelled', viewing: { ...v, status: 'cancelled' } };
  }

  // ── confirm | reschedule ────────────────────────────────────────────────
  const when = opts.when ? new Date(opts.when) : startOf(v);
  if (!when || isNaN(when.getTime())) return { ok: false, error: 'when_required' };
  const mode = VALID_MODE.has(String(opts.mode || '').toLowerCase())
    ? String(opts.mode).toLowerCase()
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
  if (opts.durationMinutes) patch.durationMinutes = Math.max(10, Math.min(180, Number(opts.durationMinutes) || 30));
  if (opts.meetingPoint) patch.meetingPoint = String(opts.meetingPoint).slice(0, 120);
  if (opts.notes) patch.notes = String(opts.notes).slice(0, 800);
  if (mode === 'video') patch.videoUrl = v.videoUrl || videoRoom(id);

  // A moved appointment re-opens the countdown: the client must hear it again.
  const moved = action === 'reschedule'
    || (v.confirmedDateTime && v.confirmedDateTime !== patch.confirmedDateTime)
    || (v.mode && v.mode !== mode && v.status === 'confirmed');
  if (moved) {
    Object.assign(patch, {
      reminder24hSent: false, reminder3hSent: false, reminder30mSent: false, afterAskSent: false,
      rescheduledAt: new Date(),
      ...(opts.byClient ? { rescheduledByClient: true } : {}),
    });
  }
  await fsPatch(`viewingRequests/${id}`, patch);

  const fresh = { ...v, ...patch, id };
  try {
    if (moved) await sendChanged(fresh, 'rescheduled', lang);
    else {
      await sendConfirmation(fresh, lang);
      await fsPatch(`viewingRequests/${id}`, { confirmationSent: true, confirmationSentAt: new Date() });
      fresh.confirmationSent = true;
    }
  } catch (e) { console.warn('[viewings/_apply] mail failed:', e.message); }

  // calendar: create on confirm, update in place on a move
  try { await inviteOperator(fresh, moved ? 'update' : 'new'); }
  catch (e) { console.warn('[viewings/_apply] invite failed:', e.message); }
  await pushPass(id);
  await logActivity(moved ? 'Visita spostata' : 'Visita confermata', 'viewing',
    { id, mode, when: patch.confirmedDateTime, byClient: !!opts.byClient }, actor);

  return {
    ok: true, id, status: 'confirmed', mode, moved,
    when: patch.confirmedDateTime,
    videoUrl: mode === 'video' ? patch.videoUrl : undefined,
    passUrl: passUrl(fresh),
    manageUrl: manageUrl(fresh),
    viewing: fresh,
  };
}
