// api/viewings/manage.js — the client's own appointment, in their hands.
//
// Until now, "I can't make Thursday" meant a WhatsApp message, a human
// reading it, a human opening a desktop, a human pressing confirm. For an
// international client eight timezones away that round trip is a day —
// and a day is how you lose a viewing.
//
// This endpoint backs /viewing?t=<ref>: no login, no account. The link IS
// the credential (see manageToken in _lib.js: derived, not stored, so every
// viewing ever created already has one). With it the client can:
//   · see their ticket, with the one-tap action for the day
//   · MOVE it to any genuinely free slot — the same grid the public booking
//     page publishes, minus their own block so they can shift by 30 minutes
//   · switch between in person and video (the expat's real need: "I'm still
//     in Berlin on Thursday")
//   · CANCEL, with an optional reason
//
// Every change goes through _apply.js — the same path the operator's own
// button uses — so the calendar updates in place, the Wallet pass follows,
// and the countdown restarts. The operator is told on Telegram the second it
// happens: a client rescheduling themselves must never be a silent surprise.
//
// POST { t, op:'lookup' }                       → { ok, viewing, slots, … }
// POST { t, op:'reschedule', when, mode? }      → { ok, viewing, … }
// POST { t, op:'cancel', reason? }              → { ok, status:'cancelled' }

import { readJson } from '../homie/_lib.js';
import { parseManageRef, isVideo, startOf, primaryAction, passUrl, videoRoom, fmtWhen, WA } from './_lib.js';
import { loadConfig, busyBlocks, buildSlots, slotOffered, TZ } from './_avail.js';
import { applyViewingChange, loadViewing, VALID_MODE } from './_apply.js';
import { replyLang } from '../_lang.js';
import { tgSend } from '../telegram/_lib.js';

const OPEN_STATUSES = new Set(['pending', 'confirmed']);

// The operator hears about it on their phone within seconds — no polling, no
// cron delay. Never throws: a Telegram outage must not fail a client's action.
async function tellOperator(v, what, extra = '') {
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!chatId || !process.env.TELEGRAM_BOT_TOKEN) return;
  const esc = s => String(s || '').replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
  const icon = what === 'cancelled' ? '✖️' : '🔁';
  const head = what === 'cancelled' ? 'Visita ANNULLATA dal cliente' : 'Visita SPOSTATA dal cliente';
  try {
    await tgSend(chatId, [
      `${icon} <b>${head}</b>`,
      `👤 ${esc(v.clientName || v.name || '—')}`,
      `🏠 ${esc(v.listingName || '—')}`,
      what === 'cancelled'
        ? `🕐 era: ${esc(fmtWhen(startOf(v), 'it'))}`
        : `🕐 nuovo: ${esc(fmtWhen(startOf(v), 'it'))} · ${isVideo(v) ? 'video' : 'di persona'}`,
      extra ? `📝 <i>${esc(extra)}</i>` : null,
      '',
      '<i>Il calendario si è già aggiornato da solo.</i>',
    ].filter(Boolean).join('\n'));
  } catch (e) { console.warn('[viewings/manage] telegram:', e.message); }
}

// Only what the client is allowed to see. Never leak internal grading, the
// operator's notes, or the other party's data.
function publicView(v, lang) {
  const s = startOf(v);
  const act = primaryAction(v, lang);
  return {
    id: v.id,
    status: v.status || 'pending',
    mode: isVideo(v) ? 'video' : 'person',
    when: s ? s.toISOString() : null,
    whenLabel: s ? fmtWhen(s, lang) : null,
    durationMinutes: Number(v.durationMinutes) || 45,
    clientName: v.clientName || v.name || null,
    listingName: v.listingName || v.propertyName || null,
    listingAddress: isVideo(v) ? null : (v.listingAddress || null),
    listingZone: v.listingZone || null,
    listingPrice: v.listingPrice != null ? v.listingPrice : null,
    meetingPoint: isVideo(v) ? null : (v.meetingPoint || null),
    videoUrl: isVideo(v) ? (v.videoUrl || videoRoom(v.id)) : null,
    action: { href: act.href, label: act.label },
    passUrl: passUrl(v),
    whatsapp: WA,
    lang,
  };
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Cache-Control', 'private, no-store');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'method_not_allowed' });

  let body;
  try { body = await readJson(req); } catch { return res.status(400).json({ ok: false, error: 'invalid_json' }); }

  const id = parseManageRef(body && body.t);
  if (!id) return res.status(404).json({ ok: false, error: 'invalid_link' });

  let v;
  try { v = await loadViewing(id); } catch (e) { return res.status(500).json({ ok: false, error: 'internal' }); }
  if (!v) return res.status(404).json({ ok: false, error: 'not_found' });

  const lang = replyLang(v);
  const op = String((body && body.op) || 'lookup').toLowerCase();
  // the viewing knows its listing (loadViewing enriches lat/lng): reschedule
  // grids get the same travel-aware gaps as the public booking page
  const vctx = { listingId: v.listingId || v.propertyId || null, lat: v.lat != null ? Number(v.lat) : null, lng: v.lng != null ? Number(v.lng) : null };
  const start = startOf(v);
  const past = !start || start.getTime() <= Date.now();
  const open = OPEN_STATUSES.has(String(v.status || '').toLowerCase()) && !v.voided;
  const canChange = open && !past;

  try {
    // ── lookup ────────────────────────────────────────────────────────────
    if (op === 'lookup') {
      let slots = [];
      if (canChange) {
        const cfg = await loadConfig();
        const mode = isVideo(v) ? 'video' : 'person';
        slots = buildSlots(cfg, await busyBlocks(cfg, id), mode, new Date(), vctx);
      }
      return res.status(200).json({
        ok: true, timezone: TZ, canChange, past,
        viewing: publicView(v, lang), slots,
      });
    }

    // ── slots for the OTHER mode (client switching person ⇄ video) ────────
    if (op === 'slots') {
      if (!canChange) return res.status(409).json({ ok: false, error: past ? 'too_late' : 'not_open' });
      const mode = VALID_MODE.has(String(body.mode || '').toLowerCase()) ? String(body.mode).toLowerCase() : (isVideo(v) ? 'video' : 'person');
      const cfg = await loadConfig();
      return res.status(200).json({ ok: true, mode, timezone: TZ, slots: buildSlots(cfg, await busyBlocks(cfg, id), mode, new Date(), vctx) });
    }

    // ── reschedule ────────────────────────────────────────────────────────
    if (op === 'reschedule') {
      if (!canChange) return res.status(409).json({ ok: false, error: past ? 'too_late' : 'not_open' });
      const when = new Date(body.when);
      if (isNaN(when.getTime())) return res.status(400).json({ ok: false, error: 'when_invalid' });
      const mode = VALID_MODE.has(String(body.mode || '').toLowerCase())
        ? String(body.mode).toLowerCase()
        : (isVideo(v) ? 'video' : 'person');

      // Re-verify server-side: the grid the client is looking at may be a few
      // seconds stale, and two people can want the same 15:00.
      const cfg = await loadConfig();
      const busy = await busyBlocks(cfg, id);
      if (!slotOffered(buildSlots(cfg, busy, mode, new Date(), vctx), when)) {
        return res.status(409).json({ ok: false, error: 'slot_taken' });
      }

      const out = await applyViewingChange(id, {
        action: 'reschedule', when, mode,
        durationMinutes: cfg.slotMinutes[mode],
        actor: 'client', byClient: true, viewing: v,
      });
      if (!out.ok) return res.status(400).json({ ok: false, error: out.error });
      await tellOperator(out.viewing, 'rescheduled');
      return res.status(200).json({ ok: true, viewing: publicView(out.viewing, lang) });
    }

    // ── cancel ────────────────────────────────────────────────────────────
    if (op === 'cancel') {
      // Cancelling is allowed right up to the start — a client who bails 20
      // minutes before is exactly who the operator needs to hear from. After
      // the slot has begun there is nothing left to cancel.
      if (!canChange) return res.status(409).json({ ok: false, error: past ? 'too_late' : 'not_open' });
      const reason = String((body && body.reason) || '').slice(0, 300);
      const out = await applyViewingChange(id, {
        action: 'cancel', actor: 'client', byClient: true, reason: reason || null, viewing: v,
      });
      if (!out.ok) return res.status(400).json({ ok: false, error: out.error });
      await tellOperator(v, 'cancelled', reason);
      return res.status(200).json({ ok: true, status: 'cancelled' });
    }

    return res.status(400).json({ ok: false, error: 'unknown_op' });
  } catch (e) {
    console.error('[viewings/manage]', e);
    return res.status(500).json({ ok: false, error: 'internal' });
  }
}
