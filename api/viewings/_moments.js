// api/viewings/_moments.js — THE COUNTDOWN.
//
// Runs inside reminder-cron (every 15 min, lazy-imported like journey/_run):
// walks the confirmed viewings and speaks at the crucial moments, exactly
// like an airline:
//
//   T-24h  "tomorrow" + Wallet pass + reschedule is one reply away
//   T-3h   "in 3 hours" + the one-tap action (directions / join call)
//   T-30m  "in 30 minutes" — the room is already open / the door is there
//   T+2h   "how did it go?" — one tap: interested / thinking / not the one
//
// Each moment fires ONCE per viewing (flags on the doc) inside a tolerant
// window, so a missed cron run never skips a moment — and a cron run that
// happens twice never doubles a message. Past-due windows are simply closed:
// a viewing found 5 hours late gets no "in 3 hours" email, ever.

import { fsList, fsPatch, fsGet } from '../homie/_lib.js';
import { startOf, endOf, isVideo, videoRoom } from './_lib.js';
import { sendReminder, sendAfter, sendConfirmation } from './_email.js';
import { inviteOperator } from './_invite.js';

const MIN = 60 * 1000, H = 60 * MIN;

// moment → { flag, window [from, to] relative to start (ms, negative = before) }
const MOMENTS = [
  { key: '24h', flag: 'reminder24hSent', from: -26 * H, to: -22 * H },
  { key: '3h', flag: 'reminder3hSent', from: -3.5 * H, to: -2.5 * H },
  { key: '30m', flag: 'reminder30mSent', from: -45 * MIN, to: -20 * MIN },
];

const langOf = v => (String(v.language || '').toLowerCase() === 'it' ? 'it' : 'en');

// the address and the map coordinates live on the listing, not on the request
async function withListing(v) {
  const pid = v.listingId || v.propertyId;
  if (!pid) return { ...v };
  const l = await fsGet(`listings/${pid}`).catch(() => null)
    || await fsGet(`properties/${pid}`).catch(() => null);
  if (!l) return { ...v };
  return {
    ...v,
    listingName: v.listingName || l.name || l.address || null,
    listingAddress: l.address || v.listingAddress || null,
  };
}
const isLive = v => {
  const s = String(v.status || '').toLowerCase();
  return s === 'confirmed' && !v.voided && !s.includes('cancel');
};

export async function runViewingMoments() {
  const out = { checked: 0, sent: [], errors: [] };
  let viewings = [];
  try {
    viewings = await fsList('viewingRequests', {
      filter: { field: 'status', op: 'EQUAL', value: 'confirmed' },
      limit: 100,
    });
  } catch (e) {
    out.errors.push('list: ' + e.message);
    return out;
  }

  const now = Date.now();
  for (const v of viewings) {
    if (!isLive(v)) continue;
    const start = startOf(v);
    if (!start) continue;
    const delta = start.getTime() - now;          // >0 = still ahead
    // ignore anything further out than 30h or older than 24h — cheap guard
    if (delta > 30 * H || delta < -24 * H) continue;
    out.checked++;
    const lang = langOf(v);

    // Path-independent confirmation: whoever flipped the status to
    // 'confirmed' — this API, the portal's Viewings page, a hand edit in
    // Firestore — the client gets the flight kit exactly once. Without this
    // the whole countdown would depend on which button the operator used.
    if (!v.confirmationSent && delta > 15 * MIN) {
      try {
        const full = await withListing(v);
        if (isVideo(full) && !full.videoUrl) full.videoUrl = videoRoom(v.id);
        await sendConfirmation(full, lang);
        await inviteOperator(full, 'new').catch(e => console.warn('[viewings] invite:', e.message));
        await fsPatch(`viewingRequests/${v.id}`, {
          confirmationSent: true, confirmationSentAt: new Date(),
          ...(full.videoUrl && !v.videoUrl ? { videoUrl: full.videoUrl } : {}),
        });
        out.sent.push({ id: v.id, moment: 'confirmation' });
      } catch (e) {
        out.errors.push(`${v.id} confirmation: ${e.message}`);
      }
    }

    for (const m of MOMENTS) {
      if (v[m.flag]) continue;
      const offset = -delta;                       // ms past the "from" scale
      if (!(offset >= m.from && offset <= m.to)) continue;
      try {
        await sendReminder(await withListing(v), m.key, lang);
        await fsPatch(`viewingRequests/${v.id}`, { [m.flag]: true, [`${m.flag}At`]: new Date() });
        out.sent.push({ id: v.id, moment: m.key });
      } catch (e) {
        out.errors.push(`${v.id} ${m.key}: ${e.message}`);
      }
    }

    // after the visit: ask once, 2–8h after it ended
    if (!v.afterAskSent) {
      const endedAgo = now - endOf(v, start).getTime();
      if (endedAgo >= 2 * H && endedAgo <= 8 * H) {
        try {
          await sendAfter(await withListing(v), lang);
          await fsPatch(`viewingRequests/${v.id}`, {
            afterAskSent: true, afterAskAt: new Date(),
            status: 'completed', completedAt: new Date(),
          });
          out.sent.push({ id: v.id, moment: 'after' });
        } catch (e) {
          out.errors.push(`${v.id} after: ${e.message}`);
        }
      }
    }
  }
  return out;
}

// Exported for tests: which moments would fire for a viewing at time `now`.
export function dueMoments(v, now = Date.now()) {
  const start = startOf(v);
  if (!start || !isLive(v)) return [];
  const delta = start.getTime() - now;
  const offset = -delta;
  const due = MOMENTS.filter(m => !v[m.flag] && offset >= m.from && offset <= m.to).map(m => m.key);
  if (!v.afterAskSent) {
    const endedAgo = now - endOf(v, start).getTime();
    if (endedAgo >= 2 * H && endedAgo <= 8 * H) due.push('after');
  }
  return due;
}

export { isVideo };
