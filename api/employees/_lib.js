// api/employees/_lib.js
// Shared plumbing for the AI "employees" (contabile, gestore, commerciale) —
// the scheduled colleagues that run the back office with no manual trigger.
//
// Design mirrors the PFS radar (api/pfs/*): every run writes a heartbeat the
// /team console renders, sustained failures alert on Telegram, and anything
// that needs a human decision goes through the SAME action_queue +
// Telegram-approval loop Homie already uses (api/homie/action.js →
// api/telegram/notify-pending.js → api/agent/execute.js). No new approval
// surface, no new secrets.
//
// Collections introduced here:
//   teamHealth/<employee>   heartbeat: lastRunAt, ok, consecutiveErrors, stats
//   teamReports/<auto>      one doc per run: summary + compact data sections

import { FS_BASE, getAdminToken, fsGet, fsPatch, fsCreate, fsList, logActivity } from '../homie/_lib.js';
import { tgNotify } from '../pfs/_health.js';

export { requireCronOrAdmin } from '../pfs/_guard.js';
export { fsGet, fsPatch, fsCreate, fsList, logActivity, tgNotify };

const ALERT_COOLDOWN_MS = 6 * 3600 * 1000;
const FAILURES_BEFORE_ALERT = 3;

// ─── Heartbeat (same shape as pfsRadarHealth, own collection) ─────────────
// employee: 'contabile' | 'gestore' | 'commerciale'
// result:   { ok: boolean, stats?: object, error?: string }
export async function reportEmployeeHealth(employee, result) {
  const now = new Date();
  let prev = null;
  try { prev = await fsGet('teamHealth/' + employee); } catch { /* first run */ }

  const consecutiveErrors = result.ok ? 0 : ((prev && prev.consecutiveErrors) || 0) + 1;
  const doc = {
    employee,
    lastRunAt: now,
    ok: !!result.ok,
    consecutiveErrors,
    lastError: result.ok ? null : String(result.error || 'unknown').slice(0, 500),
    stats: result.stats || {},
  };
  if (result.ok) doc.lastOkAt = now;

  let alerted = false;
  const lastAlertAt = prev && prev.lastAlertAt ? new Date(prev.lastAlertAt) : null;
  const cooledDown = !lastAlertAt || (now - lastAlertAt) > ALERT_COOLDOWN_MS;
  if (!result.ok && consecutiveErrors >= FAILURES_BEFORE_ALERT && cooledDown) {
    alerted = await tgNotify(
      `⚠️ <b>Squadra — "${employee}" fermo</b>\n` +
      `${consecutiveErrors} run falliti di fila.\n` +
      `Ultimo errore: ${String(result.error || '').slice(0, 200)}\n` +
      `Console: https://boomrome.com/team`
    );
    if (alerted) doc.lastAlertAt = now;
  }
  if (result.ok && prev && (prev.consecutiveErrors || 0) >= FAILURES_BEFORE_ALERT) {
    await tgNotify(`✅ Squadra — "${employee}" di nuovo operativo.`);
  }

  try { await fsPatch('teamHealth/' + employee, doc); }
  catch (e) { console.error('[employees/_lib] health write failed:', e.message); }
  return { consecutiveErrors, alerted };
}

// ─── Run report ────────────────────────────────────────────────────────────
// Persists a compact run report the /team console lists. `report` should stay
// small (summary string + counts + capped item lists) — it's a feed, not an
// archive.
export async function saveReport(employee, report) {
  try {
    const { id } = await fsCreate('teamReports', {
      employee,
      runAt: new Date(),
      ...report,
    });
    return id;
  } catch (e) {
    console.error('[employees/_lib] report write failed:', e.message);
    return null;
  }
}

// ─── Action proposal (Tier 2 → Telegram approval) ─────────────────────────
// Same schema api/homie/action.js validates, written directly under admin
// creds. contextHash gives idempotency: re-running a cron never re-proposes
// the same nudge. Returns { id, dedupHit }.
export async function proposeAction({ leadId, kind, summary, tier = 2, confidence = 0.8, proposedBy, payload = null, contextHash = null }) {
  if (contextHash) {
    try {
      const token = await getAdminToken();
      const queryRes = await fetch(`${FS_BASE}:runQuery`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          structuredQuery: {
            from: [{ collectionId: 'action_queue' }],
            where: { fieldFilter: { field: { fieldPath: 'contextHash' }, op: 'EQUAL', value: { stringValue: contextHash } } },
            limit: 1,
          },
        }),
      });
      const arr = await queryRes.json();
      const existing = Array.isArray(arr) ? arr.find(r => r.document) : null;
      if (existing) return { id: existing.document.name.split('/').pop(), dedupHit: true };
    } catch (e) {
      console.warn('[employees/_lib] dedup query failed:', e.message);
    }
  }
  const now = new Date();
  const { id } = await fsCreate('action_queue', {
    leadId: leadId || 'none',
    kind,
    summary: String(summary || '').slice(0, 240),
    tier,
    confidence,
    proposedBy,
    payload,
    contextHash,
    status: 'pending',
    autoApplied: false,
    createdAt: now,
    proposedAt: now,
  });
  return { id, dedupHit: false };
}

// ─── Small shared utilities ────────────────────────────────────────────────
export function daysUntil(d, now = Date.now()) {
  if (!d) return null;
  const t = typeof d === 'string' ? Date.parse(d) : (d?.getTime ? d.getTime() : d);
  return isNaN(t) ? null : Math.round((t - now) / 86400000);
}

// ISO week bucket ('2026-W29') — used in contextHash so a still-open issue
// re-proposes at most once a week instead of every run.
export function isoWeek(date = new Date()) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const week = Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

export function euro(n) {
  return '€' + (Number(n) || 0).toLocaleString('it-IT');
}

export function esc(s) {
  return String(s || '').replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
}

// Label helper shared by the three employees.
export function propLabel(propById, ref) {
  const p = propById[ref.propertyId];
  return (p && (p.title || p.name || p.nickname)) || ref.propertyName || ref.propertyTitle || ref.propertyId || '—';
}
