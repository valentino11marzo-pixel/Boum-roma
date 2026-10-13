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
import RENT from '../../js/rent-engine.js';
import TAXPACK from '../../js/taxpack-engine.js';
import CS from '../../js/contract-state.js';
import { sendEmail } from '../agent/_lib.js';
import { real } from '../_demo.js';
import {
  requireCronOrAdmin, fsGet, fsList, fsListAll, logActivity, tgNotify,
  reportEmployeeHealth, saveReport, daysUntil, euro, esc, propLabel,
} from './_lib.js';

const EMPLOYEE = 'contabile';

export default async function handler(req, res) {
  const actor = await requireCronOrAdmin(req, res);
  if (!actor) return;
  const dry = req.query?.dry === '1';

  try {
    // ?year=2025 → fiscal picture for a PAST year (recupero/chiusura anno):
    // obligations, taxpack checklist and incassi computed on that year.
    const out = await run({
      dry,
      forceMonthly: req.query?.monthly === '1',
      yearOverride: Number(req.query?.year) || null,
    });
    if (!dry) await reportEmployeeHealth(EMPLOYEE, { ok: true, stats: out.counts });
    return res.status(200).json({ ok: true, actor, dry, ...out });
  } catch (e) {
    console.error('[contabile]', e);
    if (!dry) await reportEmployeeHealth(EMPLOYEE, { ok: false, error: e.message });
    return res.status(500).json({ ok: false, error: e.message });
  }
}

async function run({ dry, forceMonthly, yearOverride }) {
  const now = new Date();
  const fiscalYear = yearOverride || now.getFullYear();

  // Immobili, contratti e rate letti FINO IN FONDO (a pagine per nome):
  // il Contabile conta anche le rate PAGATE dell'anno (incassato YTD,
  // pacchetto per contratto, chiusura del mese), quindi legge tutto. Una
  // lettura «limit: 600» senza ordine perdeva, oltre quel numero, proprio le
  // rate del Palazzo (`pay_c_plz_…`, in fondo all'ordine per nome). Un tetto
  // di sicurezza scattato si DICE nel rapporto e su Telegram.
  const [propertiesR, contractsR, paymentsR, documents, invoices, bankHealth, bankAccounts] = await Promise.all([
    fsListAll('properties'),
    fsListAll('contracts'),
    fsListAll('payments', { maxPages: 30 }),
    fsList('documents', { limit: 600 }).catch(() => []),
    fsList('invoices', { limit: 400 }).catch(() => []),
    fsGet('teamHealth/banca').catch(() => null),
    fsList('bankAccounts', { limit: 20 }).catch(() => []),
  ]);
  const properties = propertiesR.docs, contracts = real(contractsR.docs), payments = real(paymentsR.docs);
  const partial = [[propertiesR, 'immobili'], [contractsR, 'contratti'], [paymentsR, 'rate']].filter(([r]) => r.truncated).map(([, n]) => n);
  const propById = {};
  properties.forEach(p => { propById[p.id] = p; });

  // ── 1. Scadenze fiscali (landlord + company) ──────────────────────────
  const landlordObl = FISCAL.landlordObligations({ properties, contracts, fiscalYear });
  const revenueByQuarter = { 1: 0, 2: 0, 3: 0, 4: 0 };
  // BOOM è agenzia: le ricevute di canoni/depositi custoditi per i
  // proprietari non diventano ricavi aziendali né base IVA della società.
  for (const inv of RENT.businessInvoices(invoices)) {
    if (inv.status !== 'paid') continue;
    const d = new Date(inv.paidDate || inv.date || 0);
    if (d.getFullYear() !== fiscalYear) continue;
    revenueByQuarter[Math.floor(d.getMonth() / 3) + 1] += Number(inv.amount) || 0;
  }
  const companyObl = FISCAL.companyObligations(fiscalYear, revenueByQuarter);
  const roll = FISCAL.rollup(landlordObl.concat(companyObl), now);

  // L'etichetta dice DI QUALE immobile: «IMU — acconto 2026» ripetuto
  // cinque volte su Telegram non è azionabile.
  const oblLine = o => ({
    key: o.key, label: o.label, party: o.party || 'landlord',
    property: o.propertyId ? propLabel(propById, { propertyId: o.propertyId }) : null,
    dueDate: o.dueDate || null, days: o._daysUntil ?? null,
    amount: o.amount ?? null,
  });
  const oblText = o => o.property ? `${o.label} — ${o.property}` : o.label;
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
  // Lo stato di ogni rata da BOOM_RENT.paymentState (la stessa lettura del
  // Palazzo): un bonifico SEGNALATO dall'inquilino è da verificare, non «in
  // ritardo»; un mese prima della gestione BOOM (property.gestioneDal) non è
  // un arretrato né un atteso — la RATA intera (una trimestrale che arriva
  // dentro la gestione resta). Anche l'INCASSATO segue lo stato: una rata
  // 'paid' poi rimborsata o con una contestazione aperta/persa (stato
  // 'review') NON è incassata — il Palazzo e il rendiconto la danno non
  // incassata, e così il Contabile: va nell'atteso e fra le «da verificare».
  let incassatoYtd = 0, attesoYtd = 0;
  const late = [], reported = [], moneyBack = [], afterClose = [];
  const contractById = {}; contracts.forEach(c => { contractById[c.id] = c; });
  for (const p of payments) {
    const pc = contractById[p.contractId] || {};
    if (CS.paymentBeforeGestione(p, propById[p.propertyId || pc.propertyId])) continue;
    // Una rata il cui periodo comincia DOPO la chiusura vera del contratto
    // (BOOM_RENT.openAfterClose, la regola del Palazzo): né arretrato né
    // atteso — va annullata, e lo si dice.
    if (RENT.openAfterClose(p, contractById[p.contractId], now)) {
      afterClose.push({ paymentId: p.id, property: propLabel(propById, p.propertyId ? p : pc), month: p.month || null, amount: Number(p.amount) || 0 });
      continue;
    }
    const st = RENT.paymentState(p, now);
    const inYear = p.month && String(p.month).slice(0, 4) === String(fiscalYear);
    const label = propLabel(propById, p.propertyId ? p : pc);
    if (inYear) {
      const amt = Number(p.amount) || 0;
      const due = p.dueDate ? Date.parse(p.dueDate) : null;
      if (st === 'paid') { incassatoYtd += amt; attesoYtd += amt; }
      else if (st === 'review') {
        attesoYtd += amt;
        moneyBack.push({ paymentId: p.id, property: label, month: p.month || null, amount: amt, why: RENT.moneyBack(p) === 'dispute' ? 'contestazione' : 'rimborso' });
      } else if (st !== 'cancelled' && due && due <= now.getTime()) attesoYtd += amt;
    }
    if (st === 'reported') {
      reported.push({ paymentId: p.id, property: label, month: p.month || null, amount: Number(p.amount) || 0 });
      continue;
    }
    if (st !== 'overdue') continue;
    const d = daysUntil(p.dueDate, now.getTime());
    if (d != null && d < 0) {
      late.push({
        paymentId: p.id, property: label,
        month: p.month || null, amount: Number(p.amount) || 0, daysLate: -d,
      });
    }
  }
  late.sort((a, b) => b.daysLate - a.daysLate);

  // ── 3b. Documenti "da smistare" (Smistatore senza immobile certo) ─────
  const daSmistare = documents.filter(d => d.needsFiling === true).length;

  // ── 4. Banca (dal sync di La Banca, corre prima di questo cron) ───────
  const bankStats = (bankHealth && bankHealth.stats) || {};
  const banca = {
    accounts: bankAccounts.filter(a => a.status !== 'disabled').length,
    consentExpired: bankAccounts.filter(a => a.status === 'consent_expired').length,
    matchedLastRun: bankStats.matched || 0,
    toConfirm: bankStats.suggested || 0,
  };

  const counts = {
    oblOverdue: roll.counts.overdue,
    oblDueSoon: roll.counts.dueSoon,
    packsReady: packs.filter(k => k.ready).length,
    packsTotal: packs.length,
    docsMissing: missingDocs.length,
    daSmistare,
    paymentsLate: late.length,
    paymentsReported: reported.length,
    paymentsMoneyBack: moneyBack.length,
    paymentsAfterClose: afterClose.length,
    archivePartial: partial.length,
    incassatoYtd: Math.round(incassatoYtd),
    outstandingYtd: Math.round(attesoYtd - incassatoYtd),
  };
  const summary =
    `Fisco: ${counts.oblOverdue} scadute · ${counts.oblDueSoon} ≤30gg | ` +
    `Pacchetto: ${counts.packsReady}/${counts.packsTotal} pronti | ` +
    `Canoni/depositi per conto dei proprietari YTD ${euro(counts.incassatoYtd)} (da incassare ${euro(counts.outstandingYtd)}) | ` +
    `${counts.paymentsLate} in ritardo` + (reported.length ? ` · ${reported.length} bonifici segnalati da verificare` : '') +
    (moneyBack.length ? ` · ${moneyBack.length} rimborsate/contestate` : '') +
    (afterClose.length ? ` · ${afterClose.length} dopo la chiusura del contratto (da annullare)` : '') +
    (banca.accounts ? ` | Banca: ${banca.matchedLastRun} riconciliati · ${banca.toConfirm} da confermare` : '') +
    (partial.length ? ` | ⚠️ archivio letto in parte: ${partial.join(', ')}` : '');

  // ── Telegram: solo quando c'è da agire ───────────────────────────────
  const urgentSoon = dueSoon.filter(o => (o.days ?? 99) <= 7);
  const actionable = overdue.length || urgentSoon.length || late.length || reported.length || moneyBack.length || afterClose.length || banca.toConfirm || banca.consentExpired || partial.length;
  let notified = false;
  if (!dry && actionable) {
    const lines = [`🧮 <b>Contabile — da fare</b>`];
    if (partial.length) lines.push(`⚠️ archivio letto in parte: ${esc(partial.join(', '))} — i numeri qui sotto possono non essere completi`);
    overdue.slice(0, 6).forEach(o => lines.push(`🔴 ${esc(oblText(o))} — scaduta da ${Math.abs(o.days)}gg${o.amount ? ` · ~${euro(o.amount)}` : ''}`));
    urgentSoon.slice(0, 6).forEach(o => lines.push(`🟠 ${esc(oblText(o))} — tra ${o.days}gg${o.amount ? ` · ~${euro(o.amount)}` : ''}`));
    late.slice(0, 6).forEach(l => lines.push(`💸 ${esc(l.property)} — ${euro(l.amount)} in ritardo ${l.daysLate}gg`));
    reported.slice(0, 4).forEach(r => lines.push(`💶 ${esc(r.property)} — ${euro(r.amount)} bonifico segnalato: verifica l'incasso`));
    moneyBack.slice(0, 4).forEach(r => lines.push(`↩️ ${esc(r.property)} — ${euro(r.amount)} ${r.why === 'contestazione' ? 'contestato con la carta' : 'rimborsato'}: non è incassato`));
    afterClose.slice(0, 4).forEach(r => lines.push(`🧾 ${esc(r.property)} — ${euro(r.amount)}${r.month ? ' (' + esc(r.month) + ')' : ''} rata dopo la chiusura del contratto: annullala (non è un arretrato)`));
    if (missingDocs.length) lines.push(`📁 ${missingDocs.length} documenti mancanti per il commercialista`);
    if (banca.toConfirm) lines.push(`🏦 ${banca.toConfirm} bonifici da confermare come canoni: https://boomrome.com/banca`);
    if (daSmistare) lines.push(`📥 ${daSmistare} documenti archiviati ma senza immobile — assegnali dal portale`);
    if (banca.consentExpired) lines.push(`🏦 Consenso banca scaduto su ${banca.consentExpired} cont${banca.consentExpired === 1 ? 'o' : 'i'} — rinnova da /banca`);
    lines.push(`\nConsole: https://boomrome.com/team`);
    notified = await tgNotify(lines.join('\n'));
  }

  // ── Chiusura mese (giorno 1, o ?monthly=1) ────────────────────────────
  let monthlyEmail = null;
  if ((now.getUTCDate() === 1 || forceMonthly) && !dry) {
    monthlyEmail = await sendMonthlyClose({ now, payments, packs, overdue, dueSoon, propById, contractById, partial });
  }

  const report = {
    summary,
    counts,
    fiscalYear,
    obligations: { overdue, dueSoon },
    packs: packs.slice(0, 20),
    late: late.slice(0, 15),
    reported: reported.slice(0, 15),
    moneyBack: moneyBack.slice(0, 15),
    afterClose: afterClose.slice(0, 15),
    partial,
    banca,
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
// Lo stato di ogni rata dalla STESSA lettura del Palazzo e del rendiconto
// (BOOM_RENT.paymentState): una rata rimborsata o contestata non è
// incassata; un bonifico segnalato, una carta in volo o uno stato illeggibile
// sono «da verificare» (nell'atteso, mai fra gli incassati né fra i «non
// incassato»); le rate tutte prima della gestione BOOM non sono di nessuno.
const MESI = ['gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno', 'luglio', 'agosto', 'settembre', 'ottobre', 'novembre', 'dicembre'];
export function monthlyCloseFigures({ payments, monthKey, propById, contractById = {}, now }) {
  let incassato = 0, atteso = 0;
  const unpaid = [], toCheck = [];
  const WHY = { review: 'rimborso o contestazione', reported: 'bonifico segnalato', processing: 'pagamento in corso', unknown: 'stato da verificare' };
  for (const p of payments) {
    if (p.month !== monthKey) continue;
    const pc = contractById[p.contractId] || {};
    if (CS.paymentBeforeGestione(p, propById[p.propertyId || pc.propertyId])) continue;
    // Dopo la chiusura del contratto: da annullare, mai «non incassato».
    if (RENT.openAfterClose(p, contractById[p.contractId], now)) continue;
    const st = RENT.paymentState(p, now);
    if (st === 'cancelled') continue;
    const amt = Number(p.amount) || 0;
    const label = propLabel(propById, p.propertyId ? p : (pc.propertyId ? pc : p));
    atteso += amt;
    if (st === 'paid') incassato += amt;
    else if (WHY[st]) toCheck.push(`${label} — ${euro(amt)} (${WHY[st]})`);
    else unpaid.push(`${label} — ${euro(amt)}`);
  }
  return { incassato, atteso, unpaid, toCheck };
}

async function sendMonthlyClose({ now, payments, packs, overdue, dueSoon, propById, contractById, partial = [] }) {
  const to = process.env.ACCOUNTING_EMAIL || process.env.GMAIL_USER;
  if (!to) return { sent: false, error: 'no recipient configured' };

  const prev = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
  const monthKey = prev.toISOString().slice(0, 7); // YYYY-MM
  // Deterministico (mai toLocaleDateString: con l'ICU ridotta del runtime
  // 'it-IT' ricade sull'inglese).
  const monthLabel = MESI[prev.getUTCMonth()] + ' ' + prev.getUTCFullYear();

  const { incassato, atteso, unpaid, toCheck } = monthlyCloseFigures({ payments, monthKey, propById, contractById, now });

  const rows = packs.map(k =>
    `<tr><td style="padding:6px 10px;border-bottom:1px solid #eee">${esc(k.property)}</td>` +
    `<td style="padding:6px 10px;border-bottom:1px solid #eee;text-align:right">${k.completeness}%</td>` +
    `<td style="padding:6px 10px;border-bottom:1px solid #eee">${k.ready ? '✅ pronto' : esc(k.missing.slice(0, 3).join(' · '))}</td></tr>`
  ).join('');
  const oblRows = overdue.concat(dueSoon).slice(0, 10).map(o =>
    `<li>${esc(o.property ? o.label + ' — ' + o.property : o.label)} — ${o.days < 0 ? `scaduta da ${Math.abs(o.days)}gg` : `tra ${o.days}gg`}${o.amount ? ` · ~${euro(o.amount)}` : ''}</li>`
  ).join('');

  const html = `<div style="font-family:Helvetica,Arial,sans-serif;max-width:640px;margin:0 auto">
    <div style="background:#08080A;color:#D4AF37;padding:18px 22px;border-radius:10px 10px 0 0">
      <strong style="font-size:18px;letter-spacing:1px">BOOM Roma</strong>
      <div style="color:#999;font-size:13px">Il Contabile · Chiusura ${esc(monthLabel)}</div>
    </div>
    <div style="border:1px solid #eee;border-top:none;padding:18px 22px;border-radius:0 0 10px 10px">
      <p style="font-size:15px"><strong>💰 Canoni/depositi per conto dei proprietari:</strong> ${euro(incassato)} su ${euro(atteso)} attesi</p>
      ${partial.length ? `<p style="font-size:14px;color:#a33"><strong>⚠️ Archivio letto in parte (${esc(partial.join(', '))}):</strong> i numeri possono non essere completi.</p>` : ''}
      ${unpaid.length ? `<p style="font-size:14px;color:#a33"><strong>Non incassato:</strong></p><ul style="font-size:14px">${unpaid.map(u => `<li>${esc(u)}</li>`).join('')}</ul>` : (toCheck.length ? '' : '<p style="color:#2a8;font-size:14px">Tutti i canoni del mese incassati ✅</p>')}
      ${toCheck.length ? `<p style="font-size:14px;color:#b8860b"><strong>Da verificare (bonifico segnalato / rimborso / contestazione):</strong></p><ul style="font-size:14px">${toCheck.map(u => `<li>${esc(u)}</li>`).join('')}</ul>` : ''}
      <p style="font-weight:bold;margin-top:18px">📁 Pacchetto commercialista (anno ${now.getUTCFullYear()})</p>
      <table style="border-collapse:collapse;font-size:13px;width:100%">${rows}</table>
      ${oblRows ? `<p style="font-weight:bold;margin-top:18px">🏛️ Scadenze fiscali</p><ul style="font-size:14px;line-height:1.7">${oblRows}</ul>` : ''}
      <p style="font-size:12px;color:#999;margin-top:18px">Report automatico del Contabile — verifica col commercialista prima di versare. Console: https://boomrome.com/team</p>
    </div></div>`;

  try {
    const r = await sendEmail({ to, subject: `BOOM · Chiusura contabile ${monthLabel}`, html, text: `Chiusura ${monthLabel}: canoni/depositi per conto dei proprietari ${euro(incassato)} su ${euro(atteso)}.` +
      (unpaid.length ? `\nNon incassato: ${unpaid.join('; ')}` : '') + (toCheck.length ? `\nDa verificare: ${toCheck.join('; ')}` : '') });
    return { sent: true, to, messageId: r.messageId, month: monthKey };
  } catch (e) {
    return { sent: false, error: e.message };
  }
}
