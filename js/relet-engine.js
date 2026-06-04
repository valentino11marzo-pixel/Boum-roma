/* ============================================================================
 * BOOM Zero-Vacancy Re-let Engine
 * ----------------------------------------------------------------------------
 * Pure, dependency-free logic (window.BOOM_RELET + CommonJS) so it can be unit-
 * tested and reused by the agent layer. Detects contracts approaching their end,
 * matches each against the live lead pool, estimates days-to-let and the money
 * at risk if the unit sits empty — turning end-of-contract (today a silent
 * income gap) into a pre-planned, zero-vacancy hand-off.
 * ========================================================================== */
(function (root) {
  'use strict';

  const DAY = 86400000;
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
  const daysUntil = (d, today) => { const x = toDate(d); return x ? Math.round((x - today) / DAY) : null; };
  const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
  const norm = s => String(s == null ? '' : s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
  const num = v => { const n = Number(v); return isFinite(n) && n > 0 ? n : null; };

  function isActive(c) {
    const s = String(c.status || '').toLowerCase();
    if (['expired', 'terminated', 'cancelled', 'draft', 'archived'].some(x => s.includes(x))) return false;
    return s === '' || s.includes('attiv') || s.includes('active') || s.includes('firmat') || s.includes('signed');
  }
  function leadOpen(l) {
    const s = String(l.status || 'new').toLowerCase();
    return s === '' || s === 'new' || s === 'responded';
  }

  // Zone affinity 0..1 (exact / contains / token overlap).
  function zoneAffinity(a, b) {
    const x = norm(a), y = norm(b);
    if (!x || !y) return 0;
    if (x === y) return 1;
    if (x.includes(y) || y.includes(x)) return 0.7;
    const xs = new Set(x.split(' ')), ys = y.split(' ');
    const hit = ys.filter(t => t && xs.has(t)).length;
    return hit ? Math.min(0.6, hit * 0.3) : 0;
  }

  // Score one lead against a re-let target (a unit becoming available).
  // target: { zone, askingRent, beds }   returns { score 0-100, reasons[] }
  function matchLead(target, lead, today) {
    const reasons = [];
    let score = 0;

    const za = zoneAffinity(target.zone, lead.zone);
    // Zone gate: a lead explicitly looking in a DIFFERENT zone is not a match for
    // this specific unit. Leads with no stated zone stay (zone-flexible/unknown).
    if (norm(target.zone) && norm(lead.zone) && za === 0) {
      return { score: 0, reasons: ['zona non compatibile'] };
    }
    if (za > 0) { const p = Math.round(za * 45); score += p; reasons.push(`zona ${za === 1 ? 'esatta' : 'compatibile'} (+${p})`); }

    const budget = num(lead.budget);
    const ask = num(target.askingRent);
    if (budget && ask) {
      if (budget >= ask) { score += 30; reasons.push(`budget ok €${budget} (+30)`); }
      else if (budget >= ask * 0.9) { score += 15; reasons.push(`budget vicino €${budget} (+15)`); }
      else { reasons.push(`budget basso €${budget}`); }
    } else if (!budget) { score += 8; reasons.push('budget n/d (+8)'); }

    const g = String(lead.grade || '').toUpperCase();
    if (g === 'A') { score += 15; reasons.push('grado A (+15)'); }
    else if (g === 'B') { score += 8; reasons.push('grado B (+8)'); }
    else if (g === 'C') { score += 3; }

    const created = toDate(lead.createdAt || lead.ingestedAt);
    if (created) { const age = (today - created) / DAY; if (age <= 30) { score += 10; reasons.push('lead fresco (+10)'); } else if (age <= 90) { score += 5; } }

    if (String(lead.status || '').toLowerCase() === 'responded') { score += 5; reasons.push('già in contatto (+5)'); }

    return { score: clamp(Math.round(score), 0, 100), reasons };
  }

  function matchLeads(target, leads, today, opts) {
    opts = opts || {};
    const minScore = opts.minScore != null ? opts.minScore : 35;
    const limit = opts.limit || 8;
    const out = [];
    for (const l of leads) {
      if (!leadOpen(l)) continue;
      const m = matchLead(target, l, today);
      if (m.score >= minScore) out.push({ lead: l, score: m.score, reasons: m.reasons });
    }
    out.sort((a, b) => b.score - a.score);
    return out.slice(0, limit);
  }

  // Heuristic days-to-let from how many strong matches sit in the pipeline.
  function estDaysToLet(matches) {
    const strong = matches.filter(m => m.score >= 70).length;
    const ok = matches.filter(m => m.score >= 50).length;
    if (strong >= 3) return 10;
    if (strong >= 1) return 18;
    if (ok >= 2) return 28;
    if (matches.length >= 1) return 40;
    return 55; // no compatible demand yet → needs active marketing
  }

  // Build the full re-let plan for one expiring contract.
  // status: 'urgent' (≤30g), 'soon' (≤horizon), else excluded by caller.
  function reletPlan(contract, property, leads, today, horizonDays) {
    horizonDays = horizonDays || 90;
    const dEnd = daysUntil(contract.endDate || (contract.durata && contract.durata.endDate), today);
    const rent = num(contract.rent) || num(contract.rentAmount) || num(contract.monthlyRent) || num(property && property.price) || 0;
    const zone = (property && (property.zone || property.area)) || contract.zone || '';
    const beds = (property && (property.beds || property.rooms)) || null;
    const target = { zone, askingRent: rent, beds };

    const matches = matchLeads(target, leads, today, {});
    const est = estDaysToLet(matches);
    const vacancyRisk = Math.round((rent / 30) * est); // € lost if it sits empty `est` days
    const status = dEnd != null && dEnd <= 30 ? 'urgent' : 'soon';

    return {
      contractId: contract.id, propertyId: contract.propertyId || (property && property.id) || null,
      label: (property && (property.title || property.name || property.address)) || contract.propertyName || contract.propertyAddress || ('Contratto ' + String(contract.id || '').slice(0, 5)),
      zone, rent, suggestedRent: rent, beds,
      daysToEnd: dEnd, endDate: contract.endDate || (contract.durata && contract.durata.endDate) || null,
      tenantName: contract.tenantName || null,
      status, matches, strongMatches: matches.filter(m => m.score >= 70).length,
      estDaysToLet: est, vacancyRisk,
    };
  }

  // Portfolio scan: every active contract ending within the horizon → plans.
  function scan(contracts, properties, leads, opts) {
    opts = opts || {};
    const today = toDate(opts.today) || new Date();
    const horizon = opts.horizonDays || 90;
    const propById = {}; (properties || []).forEach(p => { propById[p.id] = p; });

    const plans = [];
    for (const c of (contracts || [])) {
      if (!isActive(c)) continue;
      const dEnd = daysUntil(c.endDate || (c.durata && c.durata.endDate), today);
      if (dEnd == null) continue;
      if (dEnd < -7 || dEnd > horizon) continue; // window: from just-expired to horizon
      const prop = propById[c.propertyId || c.property] || {};
      plans.push(reletPlan(c, prop, leads || [], today, horizon));
    }
    plans.sort((a, b) => (a.daysToEnd ?? 9999) - (b.daysToEnd ?? 9999));

    const incomeAtRisk = plans.reduce((s, p) => s + (p.rent || 0), 0);
    const vacancyExposure = plans.reduce((s, p) => s + (p.vacancyRisk || 0), 0);
    const matchedUnits = plans.filter(p => p.matches.length > 0).length;
    const uncovered = plans.filter(p => p.matches.length === 0).length;

    return {
      generatedAt: today.toISOString(),
      counts: { expiring: plans.length, urgent: plans.filter(p => p.status === 'urgent').length, matched: matchedUnits, uncovered },
      incomeAtRisk, vacancyExposure, plans,
    };
  }

  const API = { scan, reletPlan, matchLead, matchLeads, estDaysToLet, zoneAffinity, isActive, leadOpen, toDate };
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  if (root) root.BOOM_RELET = API;
})(typeof window !== 'undefined' ? window : null);
