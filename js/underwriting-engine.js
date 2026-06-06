/* ============================================================================
 * BOOM Underwriting Engine — pure tenant/lead risk scoring.
 * window.BOOM_UW (browser) + module.exports (Node). No DOM, no Firebase.
 * Used by the portal (native page) and the standalone /underwriting tool.
 * ========================================================================== */
(function (root) {
  'use strict';

  const PRIORS = {
    lossRate:   { A: 0.005, B: 0.015, C: 0.05, D: 0.15 }, // expected annual loss / annual rent
    marginMult: 1.6,
    minPremiumPct: 0.015,
    eligibleBands: ['A', 'B'],
  };
  const clamp = (n, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, n));
  function bandFor(score) { return score >= 85 ? 'A' : score >= 70 ? 'B' : score >= 50 ? 'C' : 'D'; }

  function toDate(v) {
    if (!v) return null;
    if (v instanceof Date) return isNaN(v) ? null : v;
    if (typeof v === 'object') {
      if (typeof v.toDate === 'function') { try { return v.toDate(); } catch (e) {} }
      if ('seconds' in v) return new Date(v.seconds * 1000);
      if ('_seconds' in v) return new Date(v._seconds * 1000);
    }
    if (typeof v === 'number') return new Date(v);
    if (typeof v === 'string') { if (/^\d{4}-\d{2}$/.test(v)) return new Date(v + '-01'); const d = new Date(v); return isNaN(d) ? null : d; }
    return null;
  }
  const DAY = 86400000;
  const daysBetween = (a, b) => Math.round((toDate(a) - toDate(b)) / DAY);

  function computeTenantMetrics(payments, monthlyRent, today = new Date()) {
    let onTime = 0, late = 0, lateDaysSum = 0, maxLate = 0, overdueCount = 0, overdueAmt = 0, maxOverdue = 0, paidCount = 0;
    for (const p of (payments || [])) {
      const status = String(p.status || '').toLowerCase();
      const amt = Number(p.amount ?? p.importo ?? monthlyRent) || 0;
      const due = toDate(p.dueDate ?? p.due ?? p.dueAt ?? p.month);
      const paid = toDate(p.paidDate ?? p.paidAt ?? p.paid_on);
      const isPaid = status.includes('paid') || status.includes('pagat') || !!paid;
      if (isPaid) {
        paidCount++;
        if (due && paid) { const dl = Math.max(0, daysBetween(paid, due)); if (dl <= 5) onTime++; else { late++; lateDaysSum += dl; maxLate = Math.max(maxLate, dl); } }
        else onTime++;
      } else if (due && toDate(due) < today) {
        const od = daysBetween(today, due); overdueCount++; overdueAmt += amt; maxOverdue = Math.max(maxOverdue, od);
      }
    }
    const totalGraded = onTime + late;
    return { paidCount, onTime, late, overdueCount, overdueAmt, maxOverdue, onTimeRate: totalGraded ? onTime / totalGraded : null, avgDaysLate: late ? lateDaysSum / late : 0, maxLate, monthlyRent };
  }

  function scoreTenant(m, opts = {}) {
    const factors = [];
    const rent = m.monthlyRent || 0;
    const history = m.onTime + m.late + m.overdueCount;
    if (history < 2) {
      const gradeBase = { A: 78, B: 70, C: 58, D: 45 }[opts.leadGrade] ?? 62;
      factors.push(['Storico insufficiente', 0, 'neu', 'nuovo inquilino']);
      factors.push(["Grado d'ingresso (" + (opts.leadGrade || 'n/d') + ')', gradeBase - 62, gradeBase >= 62 ? 'pos' : 'neg', '']);
      return { score: clamp(gradeBase), thin: true, factors };
    }
    let score = 62;
    const otr = m.onTimeRate ?? 1;
    const otrPts = Math.round((otr - 0.7) * 30);
    score += otrPts;
    factors.push(['Puntualità pagamenti', otrPts, otrPts >= 0 ? 'pos' : 'neg', Math.round((m.onTimeRate || 0) * 100) + '% entro 5gg']);
    if (m.overdueCount === 0 && m.paidCount >= 2) { score += 10; factors.push(['Nessuna insoluta', 10, 'pos', 'paga sempre']); }
    const tenurePts = Math.round(Math.min(10, m.paidCount * 0.8));
    score += tenurePts;
    factors.push(['Storico (mensilità)', tenurePts, 'pos', m.paidCount + ' pagate']);
    if (m.late) {
      const mildPen = -Math.min(10, Math.round(m.avgDaysLate * 0.5));
      const sevPen = (m.avgDaysLate > 20 || m.maxLate > 40) ? -Math.min(12, Math.round((m.avgDaysLate - 20) * 0.6)) : 0;
      const latePen = mildPen + sevPen; score += latePen;
      factors.push(['Ritardo medio', latePen, 'neg', Math.round(m.avgDaysLate) + ' gg · ' + m.late + ' rit.']);
    }
    if (m.overdueCount) {
      const exposureRatio = rent ? m.overdueAmt / rent : m.overdueCount;
      const odPen = -Math.min(45, Math.round(m.maxOverdue * 0.5 + exposureRatio * 12));
      score += odPen;
      factors.push(['Morosità in corso', odPen, 'neg', '€' + Math.round(m.overdueAmt) + ' · ' + m.maxOverdue + ' gg']);
    }
    return { score: clamp(Math.round(score)), thin: false, factors };
  }

  function tenantEconomics(band, monthlyRent) {
    const annual = (monthlyRent || 0) * 12;
    const lossRate = PRIORS.lossRate[band];
    const premiumPct = Math.max(PRIORS.minPremiumPct, lossRate * PRIORS.marginMult);
    return { annual, expectedLoss: annual * lossRate, premiumPct, premium: annual * premiumPct, eligible: PRIORS.eligibleBands.includes(band) };
  }

  function scoreLead(lead) {
    const factors = [];
    const g = String(lead.grade || '').toUpperCase();
    const gradeBase = { A: 88, B: 70, C: 50, DEAD: 12 }[g] ?? 55;
    let score = gradeBase;
    factors.push(['Grado Homie (' + (lead.grade || 'n/d') + ')', gradeBase - 55, gradeBase >= 55 ? 'pos' : 'neg', '']);
    if (typeof lead.confidence === 'number') { const c = Math.round((lead.confidence - 0.7) * 33); score += c; factors.push(['Confidenza', c, c >= 0 ? 'pos' : 'neg', Math.round(lead.confidence * 100) + '%']); }
    const contact = (lead.phone ? 1 : 0) + (lead.email ? 1 : 0);
    const cPts = contact === 2 ? 8 : contact === 1 ? 2 : -12;
    score += cPts; factors.push(['Contattabilità', cPts, cPts >= 0 ? 'pos' : 'neg', contact === 2 ? 'tel+email' : contact === 1 ? 'parziale' : 'assente']);
    const comp = (lead.budget ? 1 : 0) + (lead.zone ? 1 : 0); const compPts = comp * 4;
    score += compPts; factors.push(['Dati (budget/zona)', compPts, 'pos', comp + '/2']);
    return { score: clamp(Math.round(score)), factors };
  }

  const API = { PRIORS, bandFor, computeTenantMetrics, scoreTenant, tenantEconomics, scoreLead, toDate };
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  if (root) root.BOOM_UW = API;
})(typeof window !== 'undefined' ? window : null);
