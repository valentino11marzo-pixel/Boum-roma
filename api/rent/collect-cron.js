// api/rent/collect-cron.js
// The Rent Collection engine. Runs daily (vercel.json cron) and:
//   1. back-fills payment schedules for active contracts that have none
//      (FUTURE months only — never fabricates past debt on legacy data);
//   2. issues a payToken to every unpaid payment (the /pay credential);
//   3. flips pending → overdue past the due date (same transition the
//      portal applies client-side, now authoritative server-side);
//   4. walks the dunning ladder per payment and sends AT MOST ONE email
//      per payment per run — pre-due heads-up, due-today, then solleciti
//      aligned with portal.html's dunning levels (1: 5d, 2: 15d, 3: 30d);
//   5. escalates level 2/3 to the operator (agentNotifications → the
//      minutely Telegram cron) and sends a morning Telegram digest;
//   6. writes a rentCollectionHealth/cron heartbeat with failure alerts.
//
// Ladder state lives on the payment doc:
//   reminders        { stageKey: ISO | 'superseded' }  → idempotency
//   dunningStage     1|2|3      (portal's suggestedDunningLevel semantics)
//   dunningHistory   [{ level, at, channel, by }]      (portal renders h.at)
//   remindersSent    counter
//
// Auth: Vercel cron secret, X-Homie-Secret, or admin Firebase ID token —
// same guard as the PFS radar (api/pfs/_guard.js).

import { requireCronOrAdmin } from './../pfs/_guard.js';
import { fsList, fsGet, fsPatch, logActivity, getAdminToken, toFsValue, fsDocToJs, FS_BASE } from '../homie/_lib.js';
import { commitWrites } from '../magic-sign/_shared.js';
import { sendEmail } from '../agent/_lib.js';
import { tgNotify } from '../pfs/_health.js';
import {
  BASE, newPayToken, paymentContext, payLink, monthLabel, money,
  emailShell, btn, esc, dueCard,
} from './_lib.js';

export const config = { maxDuration: 60 };

const MAX_EMAILS_PER_RUN = 40;   // blast guard: a bug or a bulk backfill must
                                 // never mass-mail; the rest goes next run
const ALERT_COOLDOWN_MS = 6 * 3600 * 1000;

// Ordered ladder. `minDays` is days past due (negative = before due date).
// The highest eligible unsent stage fires; lower unsent ones are marked
// superseded so a payment entering the system late skips straight to the
// right rung instead of getting five emails at once.
const STAGES = [
  { key: 'predue', minDays: -3, dunning: 0 },
  { key: 'due',    minDays: 0,  dunning: 0 },
  { key: 'late1',  minDays: 5,  dunning: 1 },
  { key: 'late2',  minDays: 15, dunning: 2 },
  { key: 'late3',  minDays: 30, dunning: 3 },
];

const ymd = (d) => d.toISOString().slice(0, 10);
const daysPastDue = (dueDate, today) =>
  Math.floor((Date.parse(today) - Date.parse(dueDate)) / 86400000);

// Windowed unpaid query: dueDate in [today-180d, today+3d], oldest first.
// A two-sided range + orderBy on the SAME field needs no composite index
// (unlike status==X + orderBy dueDate). Bounding by due date instead of
// pulling "first 500 by doc name" prevents silent starvation of contracts
// whose ids sort late; paid docs inside the window are filtered in JS.
const WINDOW_LIMIT = 1000;
async function listDueWindow(today) {
  const from = ymd(new Date(Date.parse(today) - 180 * 86400000));
  const to = ymd(new Date(Date.parse(today) + 3 * 86400000));
  const token = await getAdminToken();
  const structuredQuery = {
    from: [{ collectionId: 'payments' }],
    where: {
      compositeFilter: {
        op: 'AND',
        filters: [
          { fieldFilter: { field: { fieldPath: 'dueDate' }, op: 'GREATER_THAN_OR_EQUAL', value: toFsValue(from) } },
          { fieldFilter: { field: { fieldPath: 'dueDate' }, op: 'LESS_THAN_OR_EQUAL', value: toFsValue(to) } },
        ],
      },
    },
    orderBy: [{ field: { fieldPath: 'dueDate' }, direction: 'ASCENDING' }],
    limit: WINDOW_LIMIT,
  };
  const r = await fetch(`${FS_BASE}:runQuery`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ structuredQuery }),
  });
  if (!r.ok) throw new Error(`due-window query failed (${r.status}): ${await r.text()}`);
  const arr = await r.json();
  return (Array.isArray(arr) ? arr : []).filter(x => x.document).map(x => fsDocToJs(x.document));
}

// ── Stage emails ─────────────────────────────────────────────
function stageEmail(stage, p, ctx, link) {
  const card = dueCard({ month: p.month, amount: p.amount, propLabel: ctx.propLabel, dueDate: p.dueDate });
  const hi = `<p style="margin:0 0 14px">Hi ${esc(ctx.tenantFirstName)},</p>`;
  const paidAlready = `<p style="margin:18px 0 0;font-size:12px;color:#999">Already paid by bank transfer? Reply to this email or report it from <a href="${BASE}/portal" style="color:#B8860B">your portal</a> and we'll reconcile it.</p>`;
  const pay = `<p style="margin:4px 0 0">${btn(link, 'Pay ' + money(p.amount) + ' securely')}</p>`;

  switch (stage) {
    case 'predue': return {
      subject: `Your rent for ${monthLabel(p.month)} is due soon`,
      html: emailShell('Rent due soon', `${hi}
        <p style="margin:0 0 6px">A quick heads-up: your rent for <b>${esc(ctx.propLabel)}</b> is due on <b>${esc(p.dueDate)}</b>. You can settle it in under a minute:</p>
        ${card}${pay}${paidAlready}`),
    };
    case 'due': return {
      subject: `Rent due today — ${monthLabel(p.month)}`,
      html: emailShell('Rent due today', `${hi}
        <p style="margin:0 0 6px">Your rent for <b>${esc(ctx.propLabel)}</b> is due <b>today</b>. One tap and it's done:</p>
        ${card}${pay}${paidAlready}`),
    };
    case 'late1': return {
      subject: `Reminder: rent for ${monthLabel(p.month)} is outstanding`,
      html: emailShell('Payment reminder', `${hi}
        <p style="margin:0 0 6px">We haven't recorded your rent payment for <b>${monthLabel(p.month)}</b> yet. If it slipped through, you can settle it right now:</p>
        ${card}${pay}
        <p style="margin:18px 0 0;font-size:13px;color:#666">If there's a problem — a delay, a question about the amount — just reply to this email. We'd rather know early.</p>
        ${paidAlready}`),
    };
    case 'late2': return {
      subject: `Second reminder — rent ${monthLabel(p.month)} overdue (sollecito)`,
      html: emailShell('Second reminder', `${hi}
        <p style="margin:0 0 6px">Your rent for <b>${monthLabel(p.month)}</b> is now more than two weeks overdue. Per your lease, late payments can accrue interest and affect your standing:</p>
        ${card}${pay}
        <p style="margin:18px 0 0;font-size:13px;color:#666">Our office has been notified. If you're facing difficulties, contact us today — we can usually find a solution before it becomes formal.</p>
        ${paidAlready}`),
    };
    case 'late3': return {
      subject: `Formal notice — rent ${monthLabel(p.month)} unpaid (diffida)`,
      html: emailShell('Formal notice', `${hi}
        <p style="margin:0 0 6px">Despite previous reminders, your rent for <b>${monthLabel(p.month)}</b> — due ${esc(p.dueDate)} — remains unpaid. This message constitutes a formal payment reminder under your lease agreement:</p>
        ${card}${pay}
        <p style="margin:18px 0 0;font-size:13px;color:#666">If payment is not received promptly, the landlord may proceed with the remedies provided by the lease and by Italian law (including formal <i>diffida ad adempiere</i> and termination for non-payment). Contact us immediately if you have already paid or need to discuss this.</p>`),
    };
  }
  return null;
}

// ── Schedule back-fill (future months only) ──────────────────
async function backfillSchedules(today, stats) {
  const contracts = await fsList('contracts', {
    filter: { field: 'status', op: 'EQUAL', value: 'active' },
    limit: 100,
  });
  for (const c of contracts) {
    if (!c.rent || !c.startDate || !c.endDate) continue;
    if (c.rentCollection === false) continue;
    if (ymd(new Date(c.endDate)) < today) continue;
    let existing;
    try {
      // limit 5 + type filter: a paid deposit doc (payments/dep_<id>,
      // type 'deposit') shares the contractId and must not suppress the
      // rent-schedule backfill.
      existing = await fsList('payments', {
        filter: { field: 'contractId', op: 'EQUAL', value: c.id },
        limit: 5,
      });
    } catch { continue; }
    if (existing.some(p => p.type !== 'deposit')) continue;

    // Same generator as api/magic-sign/submit (same doc ids), but starting
    // from today: back-filling PAST months on a legacy contract would
    // instantly manufacture arrears and trigger the dunning ladder.
    const writes = [];
    const pEnd = new Date(c.endDate);
    // Clamp to 28 (portal convention): day 29-31 makes setMonth() skip
    // February entirely and drift due dates into the next month.
    const payDay = Math.min(parseInt(c.paymentDay, 10) || 5, 28);
    const from = new Date(today);
    let cur = new Date(from.getFullYear(), from.getMonth(), payDay);
    if (ymd(cur) < today) cur.setMonth(cur.getMonth() + 1);
    let safety = 0;
    while (cur <= pEnd && safety++ < 60) {
      const month = cur.toISOString().slice(0, 7);
      writes.push({
        docPath: 'payments/pay_' + c.id + '_' + month,
        fields: {
          contractId: c.id,
          tenantId: c.tenantId || '',
          propertyId: c.propertyId || '',
          amount: c.rent,
          month,
          dueDate: cur.toISOString().split('T')[0],
          status: 'pending',
          autoGenerated: true,
          source: 'rent-cron-backfill',
        },
        serverTimestampFields: ['createdAt'],
      });
      cur.setMonth(cur.getMonth() + 1);
    }
    if (writes.length) {
      await commitWrites(writes);
      stats.backfilledContracts += 1;
      stats.backfilledPayments += writes.length;
    }
  }
}

// ── Heartbeat (rentCollectionHealth/cron) ────────────────────
async function heartbeat(ok, stats, error) {
  const now = new Date();
  let prev = null;
  try { prev = await fsGet('rentCollectionHealth/cron'); } catch { /* first run */ }
  const consecutiveErrors = ok ? 0 : ((prev && prev.consecutiveErrors) || 0) + 1;
  const doc = {
    lastRunAt: now, ok: !!ok, consecutiveErrors,
    lastError: ok ? null : String(error || 'unknown').slice(0, 500),
    stats: stats || {},
  };
  if (ok) doc.lastOkAt = now;
  const lastAlertAt = prev && prev.lastAlertAt ? new Date(prev.lastAlertAt) : null;
  if (!ok && consecutiveErrors >= 2 && (!lastAlertAt || (now - lastAlertAt) > ALERT_COOLDOWN_MS)) {
    const sent = await tgNotify(
      `⚠️ <b>Rent Collection — cron in errore</b>\n${consecutiveErrors} run falliti di fila.\nUltimo errore: ${String(error || '').slice(0, 200)}`
    );
    if (sent) doc.lastAlertAt = now;
  }
  if (ok && prev && (prev.consecutiveErrors || 0) >= 2) {
    await tgNotify('✅ Rent Collection — cron di nuovo operativo.');
  }
  try { await fsPatch('rentCollectionHealth/cron', doc); }
  catch (e) { console.error('[rent/collect-cron] heartbeat write failed:', e.message); }
}

export default async function handler(req, res) {
  const actor = await requireCronOrAdmin(req, res);
  if (!actor) return;

  const t0 = Date.now();
  const today = ymd(new Date());
  const stats = {
    backfilledContracts: 0, backfilledPayments: 0, tokensIssued: 0,
    flippedOverdue: 0, emailsSent: 0, escalations: 0,
    skippedNoEmail: 0, skippedCap: 0, unpaidTotal: 0, errors: [],
  };
  const digest = [];

  try {
    // 1. Back-fill schedules (never fatal for the rest of the run)
    try { await backfillSchedules(today, stats); }
    catch (e) { stats.errors.push('backfill: ' + e.message); }

    // 2. Load unpaid payments due inside the actionable window
    const windowRows = await listDueWindow(today);
    if (windowRows.length >= WINDOW_LIMIT) {
      stats.errors.push(`due-window returned ${windowRows.length} rows (limit) — possible truncation`);
    }
    const unpaid = windowRows.filter(p =>
      (p.status === 'pending' || p.status === 'overdue')
      && !p.paidDate && !p.paidAt
      && p.dueDate && p.month && p.type !== 'deposit');
    stats.unpaidTotal = unpaid.length;

    // Soft deadline: Vercel kills the function at maxDuration and a hard
    // kill skips heartbeat() entirely — break early instead, report the
    // remainder, and let the alerting see a failed run.
    const deadline = t0 + 50_000;

    for (let i = 0; i < unpaid.length; i++) {
      const p = unpaid[i];
      if (Date.now() > deadline) {
        stats.truncated = true;
        stats.remaining = unpaid.length - i;
        break;
      }
      try {
        const late = daysPastDue(p.dueDate, today);
        const patch = {};

        // 2a. payToken for the /pay page + email links
        if (!p.payToken) { patch.payToken = newPayToken(); stats.tokensIssued += 1; }

        // 2b. authoritative overdue flip
        if (late > 0 && p.status === 'pending') {
          patch.status = 'overdue';
          stats.flippedOverdue += 1;
        }

        // 2c. pick the single ladder stage to fire (if any)
        const reminders = (p.reminders && typeof p.reminders === 'object') ? { ...p.reminders } : {};
        const eligible = STAGES.filter(s => late >= s.minDays && !reminders[s.key]);
        // predue only makes sense strictly before the due date
        const fireable = eligible.filter(s => s.key !== 'predue' || late < 0);
        const stage = fireable.length ? fireable[fireable.length - 1] : null;

        if (stage && stats.emailsSent >= MAX_EMAILS_PER_RUN) {
          stats.skippedCap += 1;
        } else if (stage) {
          const ctx = await paymentContext(p);
          if (ctx.contract && ctx.contract.rentCollection === false) {
            // opted out: still keep token/overdue bookkeeping below
          } else if (!ctx.tenantEmail) {
            stats.skippedNoEmail += 1;
            reminders[stage.key] = 'skipped_no_email:' + new Date().toISOString();
            patch.reminders = reminders;
          } else {
            const token = p.payToken || patch.payToken;
            const mail = stageEmail(stage.key, p, ctx, payLink(token));
            await sendEmail({ to: ctx.tenantEmail, subject: mail.subject, html: mail.html });
            stats.emailsSent += 1;

            const nowISO = new Date().toISOString();
            // mark lower unsent rungs as superseded so they never fire late
            for (const s of STAGES) {
              if (s.minDays < stage.minDays && !reminders[s.key]) reminders[s.key] = 'superseded';
            }
            reminders[stage.key] = nowISO;
            patch.reminders = reminders;
            patch.remindersSent = (Number(p.remindersSent) || 0) + 1;
            patch.lastReminderDate = nowISO;
            if (stage.dunning > 0) {
              patch.dunningStage = stage.dunning;
              const hist = Array.isArray(p.dunningHistory) ? [...p.dunningHistory] : [];
              hist.push({ level: stage.dunning, at: nowISO, channel: 'email', by: 'rent-cron' });
              patch.dunningHistory = hist.slice(-20);
            }

            // level 2+ wakes the operator (Telegram via notify-pending cron)
            if (stage.dunning >= 2) {
              stats.escalations += 1;
              try {
                await fsPatch('agentNotifications/rent-' + stage.key + '-' + p.id, {
                  type: 'payment.overdue',
                  summary: `🔴 Affitto NON pagato (${stage.dunning}° sollecito): ${ctx.tenantName || p.tenantId || '?'} · ${monthLabel(p.month, 'it')} · ${money(p.amount)} · ${late}gg di ritardo`,
                  priority: stage.dunning >= 3 ? 'urgent' : 'high',
                  status: 'pending',
                  actor: 'rent-cron',
                  dedupKey: 'rent-' + stage.key + '-' + p.id,
                  createdAt: nowISO,
                  attempts: 0,
                });
              } catch (e) { stats.errors.push('notify ' + p.id + ': ' + e.message); }
            }
            digest.push({
              month: p.month, amount: p.amount, late,
              stage: stage.key, tenant: ctx.tenantName || '—',
            });
          }
        }

        if (Object.keys(patch).length) {
          // Close the stale-read race: the Stripe webhook may have marked
          // this doc paid between our window query and now — a blind patch
          // would flip it back to 'overdue' and dun a paid tenant forever.
          const fresh = await fsGet('payments/' + p.id);
          if (!fresh || fresh.status === 'paid' || fresh.paidDate || fresh.paidAt) continue;
          await fsPatch('payments/' + p.id, patch);
        }
      } catch (e) {
        stats.errors.push(p.id + ': ' + e.message);
      }
    }

    // 3. Morning digest — only when something actually moved
    if (digest.length) {
      const lines = digest.slice(0, 12).map(d =>
        `· ${d.tenant} — ${monthLabel(d.month, 'it')} ${money(d.amount)} (${d.late >= 0 ? d.late + 'gg ritardo' : 'in scadenza'}, ${d.stage})`);
      await tgNotify(
        `🏦 <b>Rent Collection</b> — ${today}\n` +
        `${stats.emailsSent} email inviate · ${stats.flippedOverdue} nuovi ritardi · ${stats.unpaidTotal} rate aperte\n` +
        lines.join('\n') +
        (digest.length > 12 ? `\n… e altri ${digest.length - 12}` : '')
      ).catch(() => {});
    }

    await logActivity('rent_collection_run', 'payment', stats, 'rent-cron');
    // A truncated run counts as a failure for alerting: two in a row and
    // the operator hears about it on Telegram.
    await heartbeat(!stats.truncated, stats,
      stats.truncated ? `deadline hit with ${stats.remaining} payments unprocessed` : undefined);
    return res.status(200).json({ ok: !stats.truncated, actor, ms: Date.now() - t0, stats });
  } catch (e) {
    console.error('[rent/collect-cron]', e);
    stats.errors.push(e.message);
    await heartbeat(false, stats, e.message).catch(() => {});
    return res.status(500).json({ ok: false, error: e.message, stats });
  }
}
