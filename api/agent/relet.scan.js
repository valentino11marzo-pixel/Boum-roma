// api/agent/relet.scan.js — Tool: agent.relet.scan  (Tier 1, read-only)
//
// Zero-Vacancy scan: runs the shared re-let engine (js/relet-engine.js) over
// every active contract approaching its end and matches each against the live
// lead pool. Lets Homie answer "quali contratti devo ricollocare?" and the
// daily digest warn 90 days early — so a unit never goes silently empty.
//
// Body: { window?: number }   horizon days (default 90)
// Output: { generatedAt, counts:{expiring,urgent,matched,uncovered},
//           incomeAtRisk, vacancyExposure, plans:[...] }

import { fsList, guardPost, okJson, errJson } from './_lib.js';
import RELET from '../../js/relet-engine.js';

export default async function handler(req, res) {
  const body = await guardPost(req, res); if (!body) return;
  const horizon = typeof body.window === 'number' ? body.window : 90;

  try {
    const [contracts, properties, leads] = await Promise.all([
      fsList('contracts', { limit: 300 }),
      fsList('properties', { limit: 300 }),
      fsList('leads', { orderBy: { field: 'createdAt', direction: 'DESCENDING' }, limit: 300 }),
    ]);

    const r = RELET.scan(contracts, properties, leads, { today: new Date(), horizonDays: horizon });

    // Trim the plans for transport: keep the headline + top 3 matches.
    const plans = r.plans.map(p => ({
      contractId: p.contractId, label: p.label, zone: p.zone, rent: p.rent,
      daysToEnd: p.daysToEnd, status: p.status,
      matchCount: p.matches.length, strongMatches: p.strongMatches,
      estDaysToLet: p.estDaysToLet, vacancyRisk: p.vacancyRisk,
      topMatches: p.matches.slice(0, 3).map(m => ({
        leadId: m.lead.id, name: m.lead.name || null, phone: m.lead.phone || null,
        zone: m.lead.zone || null, budget: m.lead.budget || null, score: m.score,
      })),
    }));

    return okJson(res, {
      generatedAt: r.generatedAt,
      counts: r.counts,
      incomeAtRisk: r.incomeAtRisk,
      vacancyExposure: r.vacancyExposure,
      plans,
    });
  } catch (e) { return errJson(res, 500, e.message); }
}
