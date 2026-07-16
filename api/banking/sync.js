// api/banking/sync.js — LA BANCA (cron giornaliero, prima del Contabile)
//
// Pulls movements from every linked account, dedupes (stable doc ids —
// re-runs are no-ops), categorizes for the prima nota, and reconciles
// incoming credits against the portal's pending `payments`:
//
//   match sicuro   → payment marked paid (paidVia:'bank'), audit-logged —
//                    the tenant's rent shows up as collected with zero manual
//                    work, and taxpack counts it as a receipt.
//   match incerto  → stored as matchSuggestions on the movement, surfaced in
//                    /banca and in the Contabile's morning report. Never a
//                    silent guess.
//
// Heartbeat: teamHealth/banca (the /team console shows La Banca like every
// other employee; 3 failed runs → Telegram). Consent expiring ≤7gg → Telegram
// reminder with the /banca link to renew.
//
// Auth: cron secret / X-Homie-Secret / admin ID token. `?dry=1` = read-only.
// `?days=N` overrides the sync window (default 35; first run per account
// backfills as far as the consent allows, up to 540).

import {
  gc, gcConfigured, normalizeTx, txDocId, reconcile, applyMatch,
  listLinkedAccounts, batchExists, fsPatch, fsList,
} from './_lib.js';
import { requireCronOrAdmin, reportEmployeeHealth, saveReport, tgNotify } from '../employees/_lib.js';

const EMPLOYEE = 'banca';
const DEFAULT_WINDOW_DAYS = 35;
const BACKFILL_DAYS = 540;

export default async function handler(req, res) {
  const actor = await requireCronOrAdmin(req, res);
  if (!actor) return;
  const dry = req.query?.dry === '1';

  try {
    const out = await run({ dry, windowDays: Number(req.query?.days) || null });
    if (!dry) await reportEmployeeHealth(EMPLOYEE, { ok: true, stats: out.counts });
    return res.status(200).json({ ok: true, actor, dry, ...out });
  } catch (e) {
    console.error('[banking/sync]', e);
    if (!dry) await reportEmployeeHealth(EMPLOYEE, { ok: false, error: e.message });
    return res.status(500).json({ ok: false, error: e.message });
  }
}

async function run({ dry, windowDays }) {
  if (!gcConfigured()) {
    // Not an error: manual CSV import keeps working without API keys.
    return { counts: { accounts: 0, configured: 0 }, summary: 'GoCardless non configurato — solo import manuale attivo' };
  }

  const accounts = await listLinkedAccounts();
  if (!accounts.length) {
    return { counts: { accounts: 0 }, summary: 'Nessun conto collegato — collega la banca da /banca' };
  }

  const now = new Date();
  const iso = d => d.toISOString().slice(0, 10);

  // Pending payments + tenant names once, shared across accounts.
  const [payments, users] = await Promise.all([
    fsList('payments', { limit: 600 }),
    fsList('users', { limit: 1000 }).catch(() => []),
  ]);
  const pending = payments.filter(p => !['paid', 'cancelled'].includes(p.status));
  const tenantNameById = {};
  users.forEach(u => { tenantNameById[u.id] = u.name || ''; });

  let txNew = 0, txSeen = 0, matched = 0, suggested = 0;
  const consentWarnings = [];
  const perAccount = [];

  for (const acc of accounts) {
    const firstSync = !acc.lastSyncAt;
    const days = windowDays || (firstSync ? BACKFILL_DAYS : DEFAULT_WINDOW_DAYS);
    const from = new Date(now.getTime() - days * 86400000);

    let data;
    try {
      data = await gc(`/accounts/${acc.id}/transactions/?date_from=${iso(from)}&date_to=${iso(now)}`);
    } catch (e) {
      // 401/403 on the account = consent expired → tell the operator, keep
      // syncing the other accounts.
      if (e.status === 401 || e.status === 403 || /EUA|expired|suspended/i.test(e.message)) {
        consentWarnings.push(acc.iban || acc.id);
        if (!dry) await fsPatch('bankAccounts/' + acc.id, { status: 'consent_expired', lastError: e.message.slice(0, 200) });
        continue;
      }
      throw e;
    }

    // Normalize + dedupe in bulk (one batchGet per 200 movements instead of
    // one GET each — the 540-day backfill stays inside the 60s budget).
    const booked = (data.transactions?.booked || [])
      .map(raw => normalizeTx(acc.id, raw))
      .filter(tx => tx.bookingDate);
    const withIds = booked.map(tx => ({ tx, docId: txDocId(tx) }));
    const seen = withIds.length ? await batchExists('bankTransactions', withIds.map(w => w.docId)) : new Set();
    const fresh = withIds.filter(w => !seen.has(w.docId));
    txSeen += withIds.length - fresh.length;

    // Reconcile sequentially (`pending` shrinks as matches land — one
    // bonifico can't pay two schedules), write in parallel chunks.
    const toWrite = [];
    for (const { tx, docId } of fresh) {
      const { match, suggestions } = reconcile(tx, pending, tenantNameById);
      if (match) {
        const idx = pending.findIndex(p => p.id === match.paymentId);
        if (idx >= 0) pending.splice(idx, 1);
        matched++;
      } else if (suggestions.length) suggested++;
      toWrite.push({ tx, docId, match, suggestions });
    }
    txNew += fresh.length;
    const accNew = fresh.length;

    if (!dry) {
      for (let i = 0; i < toWrite.length; i += 8) {
        await Promise.all(toWrite.slice(i, i + 8).map(async ({ tx, docId, match, suggestions }) => {
          await fsPatch('bankTransactions/' + docId, {
            ...tx,
            matchSuggestions: suggestions.length ? suggestions : null,
            createdAt: new Date(),
          });
          if (match) await applyMatch(docId, tx, match.paymentId, match.confidence);
        }));
      }
    }

    // Balance snapshot (best-effort) + sync bookkeeping.
    if (!dry) {
      let balance = null;
      try {
        const b = await gc(`/accounts/${acc.id}/balances/`);
        const bal = (b.balances || []).find(x => ['interimAvailable', 'expected', 'closingBooked'].includes(x.balanceType)) || (b.balances || [])[0];
        if (bal) balance = Number(bal.balanceAmount?.amount ?? null);
      } catch { /* not all banks expose balances */ }
      await fsPatch('bankAccounts/' + acc.id, {
        lastSyncAt: now,
        status: 'active',
        lastError: null,
        ...(balance != null ? { balance, balanceAt: now } : {}),
      });
    }
    perAccount.push({ account: acc.iban || acc.id, newTx: accNew, backfill: firstSync });

    // Consent expiry heads-up (7 days ahead, once per run).
    const exp = acc.consentExpiresAt ? new Date(acc.consentExpiresAt) : null;
    if (exp && (exp - now) < 7 * 86400000 && (exp - now) > 0) consentWarnings.push((acc.iban || acc.id) + ` (scade ${iso(exp)})`);
  }

  if (!dry && consentWarnings.length) {
    await tgNotify(
      `🏦 <b>La Banca — consenso da rinnovare</b>\n` +
      consentWarnings.map(w => `• ${w}`).join('\n') +
      `\nRinnova in 2 minuti: https://boomrome.com/banca`
    );
  }

  const counts = { accounts: accounts.length, txNew, txSeen, matched, suggested, consentWarnings: consentWarnings.length };
  const summary = `${txNew} nuovi movimenti su ${accounts.length} conti · ${matched} canoni riconciliati · ${suggested} da confermare`;

  if (!dry && (txNew || matched || suggested || consentWarnings.length)) {
    await saveReport(EMPLOYEE, { summary, counts, perAccount: perAccount.slice(0, 10) });
  }
  return { counts, summary, perAccount };
}
