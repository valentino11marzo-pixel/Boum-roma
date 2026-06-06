// api/agent/compliance.scan.js — Tool: agent.compliance.scan  (Tier 1, read-only)
//
// Runs the BOOM Compliance OS rule library (js/compliance-rules.js) server-side
// over every active contract and returns the bureaucratic obligations that are
// OVERDUE or DUE SOON — so Homie can answer "cosa scade in burocrazia?" and the
// daily digest / cockpit Risk Radar can surface fiscal deadlines, not just rent.
//
// No new logic here: this is the same pure engine the /compliance page uses,
// reused on the server. Respects items already marked done/NA in the
// complianceState collection.
//
// Body: { window?: number }   days-ahead horizon for "due soon" (default 14)
// Output: { generatedAt, counts:{high,med,total}, items:[{sev,cat,title,detail,days,ref,code,owner}] }

import { fsList, guardPost, okJson, errJson } from './_lib.js';
import COMPLIANCE from '../../js/compliance-rules.js';

const ACTIVE = c => {
  const s = String(c.status || '').toLowerCase();
  return s === '' || s.includes('attiv') || s.includes('active') || s.includes('firmat') || s.includes('signed') || s.includes('draft');
};

export default async function handler(req, res) {
  const body = await guardPost(req, res); if (!body) return;
  const soonDays = typeof body.window === 'number' ? body.window : 14;
  const today = new Date();

  try {
    const [contracts, users, properties, stateDocs] = await Promise.all([
      fsList('contracts', { limit: 300 }),
      fsList('users', { limit: 1000 }),
      fsList('properties', { limit: 300 }),
      fsList('complianceState', { limit: 500 }).catch(() => []),
    ]);
    const userById = {}; users.forEach(u => { userById[u.id] = u; });
    const propById = {}; properties.forEach(p => { propById[p.id] = p; });
    const stateById = {}; stateDocs.forEach(d => { stateById[d.id] = d.items || {}; });

    const sevMap = { high: 'high', med: 'med', low: 'low' };
    const items = [];

    for (const c of contracts) {
      if (!ACTIVE(c)) continue;
      const tenant = userById[c.tenantId || c.tenant || c.tenantUid] || {};
      const prop = propById[c.propertyId || c.property] || {};
      const label = prop.title || prop.name || prop.address || c.propertyName || c.propertyAddress || ('Contratto ' + String(c.id).slice(0, 5));
      const doneMap = stateById[c.id] || {};
      const obligations = COMPLIANCE.obligationsFor(c, { tenant, today });

      for (const it of obligations) {
        const st = COMPLIANCE.statusOf(it, doneMap, today, soonDays);
        if (st !== 'overdue' && st !== 'due_soon') continue;
        const days = it.dueDate ? Math.round((COMPLIANCE.toDate(it.dueDate) - today) / 86400000) : 0;
        const sev = st === 'overdue' && it.severity === 'low' ? 'med' : sevMap[it.severity] || 'med';
        items.push({
          sev,
          cat: st === 'overdue' ? 'Burocrazia scaduta' : 'Burocrazia in scadenza',
          title: `${label} — ${it.label}`,
          detail: st === 'overdue' ? `In ritardo di ${Math.abs(days)}gg` : `Tra ${days}gg`,
          days,
          ref: c.id,
          code: it.code,
          owner: it.owner,
        });
      }
    }

    const rank = { high: 0, med: 1, low: 2 };
    items.sort((a, b) => (rank[a.sev] - rank[b.sev]) || (a.days - b.days));

    return okJson(res, {
      generatedAt: new Date().toISOString(),
      counts: { high: items.filter(i => i.sev === 'high').length, med: items.filter(i => i.sev === 'med').length, total: items.length },
      items,
    });
  } catch (e) { return errJson(res, 500, e.message); }
}
