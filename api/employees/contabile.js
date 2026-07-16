// api/employees/contabile.js — IL CONTABILE (cron giornaliero)
//
// The accounting employee. Every morning it re-derives the whole fiscal
// picture from data already in Firestore — nothing manual to feed it:
//
//   1. Scadenze fiscali   fiscal-engine: per-property/contract (registro,
//                         IMU, cedolare, ISTAT…) + company (IVA, LIPE,
//                         CCIAA, Redditi SC) from paid invoices by quarter.
//   2. Pacchetto          taxpack-engine: per-contract document checklist
//      commercialista     for the current fiscal year → what's missing for
//                         the accountant, per property, with completeness %.
//   3. Incassi            payments: collected vs expected YTD + late list.
//
// Output of every run: teamReports doc + teamHealth heartbeat. Telegram
// message only when something is actionable (overdue/≤7gg obligations or
// late payments) — a quiet day stays quiet.
//
// On the 1st of the month it also emails the operator a "chiusura mese"
// recap (previous-month collections + commercialista-pack readiness), the
// same summary the accountant needs before asking for documents.
//
// Auth: Vercel cron (Bearer CRON_SECRET), Homie (X-Homie-Secret) or an
// admin Firebase ID token — the /team console's "Esegui ora" button.
// `?dry=1` computes and returns everything without writing or notifying.

import FISCAL from '../../js/fiscal-engine.js';
import TAXPACK from '../../js/taxpack-engine.js';
import { sendEmail } from '../agent/_lib.js';
import {
  requireCronOrAdmin, fsList, logActivity, tgNotify,
  reportEmployeeHealth, saveReport, daysUntil, euro, esc, propLabel,
} from './_lib.js';

const EMPLOYEE = 'contabile';

export default async function handler(req, res) {
  const actor = await requireCronOrAdmin(req, res);
  if (!actor) return;
  const dry = req.query?.dry === '1';

  try {
    const out = await run({ dry, forceMonthly: req.query?.monthly === '1' });
    if (!dry) await reportEmployeeHealth(EMPLOYEE, { ok: true, stats: out.counts });
    return res.status(200).json({ ok: true, actor, dry, ...out });
  } catch (e) {
    console.error('[contabile]', e);
    if (!dry) await reportEmployeeHealth(EMPLOYEE, { ok: false, error: e.message });
    return res.status(500).json({ ok: false, error: e.message });
  }
}

async function run({ dry, forceMonthly }) {
  const now = new Date();
  const fiscalYear = now.getFullYear();

  const [properties, contracts, payments, documents, invoices] = await Promise.all([
    fsList('properties', { limit: 200 }),
    fsList('contracts', { limit: 300 }),
    fsList('payments', { limit: 600 }),
    fsList('documents', { limit: 600 }).catch(() => []),
    fsList('invoices', { limit: 400 }).catch(() => []),
  ]);
  const propById = {};
  properties.forEach(p => { propById[p.id] = p; });

  // ── 1. Scadenze fiscali (landlord + company) ──────────────────────────
  const landlordObl = FISCAL.landlordObligations({ properties, contracts, fiscalYear });
  const revenueByQuarter = { 1: 0, 2: 0, 3: 0, 4: 0 };
  for (const inv of invoices) {
    if (inv.status !== 'paid') continue;
    const d = new Date(inv.paidDate || inv.date || 0);
    if (d.getFullYear() !== fiscalYear) continue;
    revenueByQuarter[Math.floor(d.getMonth() / 3) + 1] += Number(inv.amount) || 0;
  }
  const companyObl = FISCAL.companyObligations(fiscalYear, revenueByQuarter);
  const roll = FISCAL.rollup(landlordObl.concat(companyObl), now);

  const oblLine = o => ({
    key: o.key, label: o.label, party: o.party || 'landlord',
    dueDate: o.dueDate || null, days: o._daysUntil ?? null,
    amount: o.amount ?? null,
  });
  const overdue = roll.buckets.overdue.map(oblLine).slice(0, 15);
  const dueSoon = roll.buckets.dueSoon.map(oblLine).slice(0, 15);

  // ── 2. Pacchetto commercialista (taxpack per contratto attivo nell'anno) ──
  const packs = [];
  const missingDocs = [];
  for (const c of contracts) {
    if (c.status === 'draft') continue;
    if (TAXPACK.monthsActiveInYear(c, fiscalYear) <= 0) continue;
    const property = propById[c.propertyId] || { id: c.propertyId };
    const cPayments = payments.filter(p => p.contractId === c.id);
    const checklist = TAXPACK.buildChecklist({ contract: c, property, documents, payments: cPayments, fiscalYear });
    const totals = TAXPACK.computeTotals({ contract: c, payments: cPayments, fiscalYear });
    packs.push({
      contractId: c.id,
      property: propLabel(propById, c),
      completeness: checklist.completeness,
      ready: checklist.ready,
      missing: checklist.missing.map(m => m.label + (m.detail ? ` (${m.detail})` : '')).slice(0, 8),
      canoniIncassati: totals.canoniIncassati ?? 0,
    });
    checklist.missing.slice(0, 4).forEach(m => {
      missingDocs.push(`${propLabel(propById, c)} — ${m.label}${m.detail ? ` (${m.detail})` : ''}`);
    });
  }

  // ── 3. Incassi: YTD + ritardi ─────────────────────────────────────────
  let incassatoYtd = 0, attesoYtd = 0;
  const late = [];
  for (const p of payments) {
    const inYear = p.month && String(p.month).slice(0, 4) === String(fiscalYear);
    if (inYear) {
      const amt = Number(p.amount) || 0;
      const due = p.dueDate ? Date.parse(p.dueDate) : null;
      if (p.status === 'paid') { incassatoYtd += amt; attesoYtd += amt; }
      else if (p.status !== 'cancelled' && due && due <= now.getTime()) attesoYtd += amt;
    }
    if (!['paid', 'cancelled'].includes(p.status)) {
      const d = daysUntil(p.dueDate, now.getTime());
      if (d != null && d < 0) {
        late.push({
          paymentId: p.id, property: propLabel(propById, p),
          month: p.month || null, amount: Number(p.amount) || 0, daysLate: -d,
        });
      }
    }
  }
  late.sort((a, b) => b.daysLate - a.daysLate);

  const counts = {
    oblOverdue: roll.counts.overdue,
    oblDueSoon: roll.counts.dueSoon,
    packsReady: packs.filter(k => k.ready).length,
    packsTotal: packs.length,
    docsMissing: missingDocs.length,
    paymentsLate: late.length,
    incassatoYtd: Math.round(incassatoYtd),
    outstandingYtd: Math.round(attesoYtd - incassatoYtd),
  };
  const summary =
    `Fisco: ${counts.oblOverdue} scadute · ${counts.oblDueSoon} ≤30gg | ` +
    `Pacchetto: ${counts.packsReady}/${counts.packsTotal} pronti | ` +
    `Incassi YTD ${euro(counts.incassatoYtd)} (da incassare ${euro(counts.outstandingYtd)}) | ` +
    `${counts.paymentsLate} in ritardo`;

  // ── Telegram: solo quando c'è da agire ───────────────────────────────
  const urgentSoon = dueSoon.filter(o => (o.days ?? 99) <= 7);
  const actionable = overdue.length || urgentSoon.length || late.length;
  let notified = false;
  if (!dry && actionable) {
    const lines = [`🧮 <b>Contabile — da fare</b>`];
    overdue.slice(0, 6).forEach(o => lines.push(`🔴 ${esc(o.label)} — scaduta da ${Math.abs(o.days)}gg${o.amount ? ` · ~${euro(o.amount)}` : ''}`));
    urgentSoon.slice(0, 6).forEach(o => lines.push(`🟠 ${esc(o.label)} — tra ${o.days}gg${o.amount ? ` · ~${euro(o.amount)}` : ''}`));
    late.slice(0, 6).forEach(l => lines.push(`💸 ${esc(l.property)} — ${euro(l.amount)} in ritardo ${l.daysLate}gg`));
    if (missingDocs.length) lines.push(`📁 ${missingDocs.length} documenti mancanti per il commercialista`);
    lines.push(`\nConsole: https://boomrome.com/team`);
    notified = await tgNotify(lines.join('\n'));
  }

  // ── Chiusura mese (giorno 1, o ?monthly=1) ────────────────────────────
  let monthlyEmail = null;
  if ((now.getUTCDate() === 1 || forceMonthly) && !dry) {
    monthlyEmail = await sendMonthlyClose({ now, payments, packs, overdue, dueSoon, propById });
  }

  const report = {
    summary,
    counts,
    fiscalYear,
    obligations: { overdue, dueSoon },
    packs: packs.slice(0, 20),
    late: late.slice(0, 15),
    notified,
  };
  if (!dry) {
    await saveReport(EMPLOYEE, report);
    await logActivity('Contabile: run completato', 'employee', counts, EMPLOYEE);
  }
  return { counts, summary, report, monthlyEmail };
}

// "Chiusura mese": incassi del mese appena chiuso + prontezza del pacchetto
// commercialista + prossime scadenze. Recipient override via ACCOUNTING_EMAIL.
async function sendMonthlyClose({ now, payments, packs, overdue, dueSoon, propById }) {
  const to = process.env.ACCOUNTING_EMAIL || process.env.GMAIL_USER;
  if (!to) return { sent: false, error: 'no recipient configured' };

  const prev = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
  const monthKey = prev.toISOString().slice(0, 7); // YYYY-MM
  const monthLabel = prev.toLocaleDateString('it-IT', { month: 'long', year: 'numeric', timeZone: 'UTC' });

  let incassato = 0, atteso = 0;
  const unpaid = [];
  for (const p of payments) {
    if (p.month !== monthKey) continue;
    const amt = Number(p.amount) || 0;
    if (p.status === 'cancelled') continue;
    atteso += amt;
    if (p.status === 'paid') incassato += amt;
    else unpaid.push(`${propLabel(propById, p)} — ${euro(amt)}`);
  }

  const rows = packs.map(k =>
    `<tr><td style="padding:6px 10px;border-bottom:1px solid #eee">${esc(k.property)}</td>` +
    `<td style="padding:6px 10px;border-bottom:1px solid #eee;text-align:right">${k.completeness}%</td>` +
    `<td style="padding:6px 10px;border-bottom:1px solid #eee">${k.ready ? '✅ pronto' : esc(k.missing.slice(0, 3).join(' · '))}</td></tr>`
  ).join('');
  const oblRows = overdue.concat(dueSoon).slice(0, 10).map(o =>
    `<li>${esc(o.label)} — ${o.days < 0 ? `scaduta da ${Math.abs(o.days)}gg` : `tra ${o.days}gg`}${o.amount ? ` · ~${euro(o.amount)}` : ''}</li>`
  ).join('');

  const html = `<div style="font-family:Helvetica,Arial,sans-serif;max-width:640px;margin:0 auto">
    <div style="background:#08080A;color:#D4AF37;padding:18px 22px;border-radius:10px 10px 0 0">
      <strong style="font-size:18px;letter-spacing:1px">BOOM Roma</strong>
      <div style="color:#999;font-size:13px">Il Contabile · Chiusura ${esc(monthLabel)}</div>
    </div>
    <div style="border:1px solid #eee;border-top:none;padding:18px 22px;border-radius:0 0 10px 10px">
      <p style="font-size:15px"><strong>💰 Incassato:</strong> ${euro(incassato)} su ${euro(atteso)} attesi</p>
      ${unpaid.length ? `<p style="font-size:14px;color:#a33"><strong>Non incassato:</strong></p><ul style="font-size:14px">${unpaid.map(u => `<li>${esc(u)}</li>`).join('')}</ul>` : '<p style="color:#2a8;font-size:14px">Tutti i canoni del mese incassati ✅</p>'}
      <p style="font-weight:bold;margin-top:18px">📁 Pacchetto commercialista (anno ${now.getUTCFullYear()})</p>
      <table style="border-collapse:collapse;font-size:13px;width:100%">${rows}</table>
      ${oblRows ? `<p style="font-weight:bold;margin-top:18px">🏛️ Scadenze fiscali</p><ul style="font-size:14px;line-height:1.7">${oblRows}</ul>` : ''}
      <p style="font-size:12px;color:#999;margin-top:18px">Report automatico del Contabile — verifica col commercialista prima di versare. Console: https://boomrome.com/team</p>
    </div></div>`;

  try {
    const r = await sendEmail({ to, subject: `BOOM · Chiusura contabile ${monthLabel}`, html, text: `Chiusura ${monthLabel}: incassato ${euro(incassato)} su ${euro(atteso)}.` });
    return { sent: true, to, messageId: r.messageId, month: monthKey };
  } catch (e) {
    return { sent: false, error: e.message };
  }
}
