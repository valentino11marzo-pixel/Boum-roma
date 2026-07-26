// api/viewings/_invite.js — put the viewing in the operator's calendar,
// automatically, the moment it exists.
//
// Sends a genuine iCalendar invitation (METHOD:REQUEST) to the operator with
// the client as attendee. Gmail/Apple Mail/Outlook add it to the calendar on
// their own — and because the UID is stable and the SEQUENCE grows, a
// reschedule updates that same event and a cancellation deletes it. No OAuth,
// no API project, nothing to expire.
//
// The client gets their own copy of the invite attached to the confirmation
// email (sendConfirmation) — here we only handle the operator side, so a
// mail failure on one side can never affect the other.

import { sendEmail } from '../agent/_lib.js';
import { fsPatch } from '../homie/_lib.js';
import { buildInvite, OPERATOR_EMAIL } from './_ical.js';
import { isVideo, startOf, fmtWhen, videoRoom, primaryAction } from './_lib.js';

const esc = s => String(s == null ? '' : s).replace(/[<>&"]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[c]));

/**
 * @param v      enriched viewing (id, listingName/Address, client fields…)
 * @param kind   'new' | 'update' | 'cancel'
 */
export async function inviteOperator(v, kind = 'new') {
  const cancel = kind === 'cancel';
  const sequence = Number(v.icalSequence || 0) + (kind === 'new' ? 0 : 1);
  const ics = buildInvite(v, {
    method: cancel ? 'CANCEL' : 'REQUEST',
    sequence,
    lang: 'it',
    attendees: [
      { email: OPERATOR_EMAIL, name: 'BOOM Rome', role: 'CHAIR' },
      (v.clientEmail || v.email) ? { email: v.clientEmail || v.email, name: v.clientName || v.name || '' } : null,
    ].filter(Boolean),
  });
  if (!ics) return { skipped: 'no_date' };

  const s = startOf(v);
  const act = primaryAction(v, 'it');
  const who = [v.clientName || v.name, v.clientPhone || v.phone, v.clientEmail || v.email].filter(Boolean).join(' · ');
  const title = `${cancel ? '❌ ANNULLATA' : kind === 'update' ? '🔄 SPOSTATA' : '📅 NUOVA VISITA'} — ${v.listingName || 'BOOM'} · ${fmtWhen(s, 'it')}`;
  const html = `<div style="font-family:Helvetica,Arial,sans-serif;font-size:14px;color:#222;line-height:1.7">
    <p style="font-size:16px;margin:0 0 14px"><b>${esc(title)}</b></p>
    <p style="margin:0 0 6px">👤 ${esc(who)}</p>
    <p style="margin:0 0 6px">🏠 ${esc(v.listingName || '')}${v.listingAddress ? ' — ' + esc(v.listingAddress) : ''}</p>
    <p style="margin:0 0 6px">${isVideo(v) ? '🎥 Videochiamata' : '🚶 Di persona'} · ${Number(v.durationMinutes) || 45} min${v.selfBooked ? ' · <i>prenotata dal cliente</i>' : ''}</p>
    ${v.notes ? `<p style="margin:0 0 6px">📝 ${esc(v.notes)}</p>` : ''}
    ${cancel ? '' : `<p style="margin:14px 0 0"><a href="${act.href}" style="color:#B8960C">${esc(act.label)}</a></p>`}
    ${isVideo(v) && !cancel ? `<p style="margin:6px 0 0"><a href="${esc(v.videoUrl || videoRoom(v.id))}" style="color:#B8960C">${esc(v.videoUrl || videoRoom(v.id))}</a></p>` : ''}
    <p style="margin:16px 0 0;font-size:12px;color:#888">${cancel ? 'L\'evento è stato rimosso dal calendario.' : 'L\'evento è stato aggiunto al tuo calendario automaticamente.'}</p>
  </div>`;

  await sendEmail({
    to: OPERATOR_EMAIL,
    subject: title,
    html,
    text: `${title}\n${who}\n${v.listingName || ''}`,
    icalEvent: {
      method: cancel ? 'CANCEL' : 'REQUEST',
      filename: 'invite.ics',
      content: ics,
    },
  });

  try { await fsPatch(`viewingRequests/${v.id}`, { icalSequence: sequence, icalSentAt: new Date() }); }
  catch (e) { console.warn('[viewings/_invite] sequence save:', e.message); }
  return { ok: true, sequence };
}
